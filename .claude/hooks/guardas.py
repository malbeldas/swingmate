#!/usr/bin/env python3
"""Guardas PreToolUse de los proyectos. Modos: proyecto | solo-lectura.

Bloquear: sale con código 2 y el motivo en stderr.
Pedir confirmación: imprime el JSON de permissionDecision "ask".
La configuración propia de cada repo va en .claude/guardas.json.
"""
import json
import os
import re
import shlex
import subprocess
import sys

OPERADORES = set(";&|()<>\n")
ENVOLTURAS = {"env", "sudo", "command", "nohup", "time", "xargs", "exec"}
RAMAS_PROTEGIDAS = {"main", "master"}
SOLO_TEXTO = {"git", "echo", "printf", "grep", "rg", "cat", "sed"}
SECRETOS = [
    r"(^|/)\.env(\.(?!example$|sample$)[^/]*)?$",
    r"\.(pem|p12|key)$",
    r"(^|/)id_(rsa|ed25519)$",
]
LECTURA = {
    "cat", "grep", "rg", "ls", "diff", "find", "awk", "head", "tail", "wc",
    "sort", "uniq", "cut", "sed", "tr", "jq", "basename", "dirname", "pwd",
    "echo", "stat", "file", "true",
}
GIT_LECTURA = {
    "diff", "log", "show", "rev-parse", "blame", "status", "ls-files",
    "merge-base", "cat-file", "grep", "rev-list", "shortlog",
}
GH_LECTURA = {("pr", "view"), ("pr", "diff"), ("pr", "checks"), ("run", "view"), ("run", "list")}
FIND_PROHIBIDOS = {"-delete", "-exec", "-execdir", "-ok", "-okdir", "-fprint", "-fprint0", "-fprintf", "-fls"}


def bloquear(motivo):
    print(motivo, file=sys.stderr)
    sys.exit(2)


def preguntar(motivo):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "ask",
        "permissionDecisionReason": motivo,
    }}))
    sys.exit(0)


def analizar(comando):
    """Devuelve (tramos, destinos de redirección). ValueError si no se puede leer."""
    lex = shlex.shlex(comando, posix=True, punctuation_chars=";&|()<>\n")
    lex.whitespace = " \t\r"
    lex.whitespace_split = True
    lex.commenters = ""
    tramos, actual, destinos = [], [], []
    tokens = list(lex)
    i = 0
    while i < len(tokens):
        token = tokens[i]
        if token and set(token) <= OPERADORES:
            if ">" in token:
                i += 1
                destinos.append(tokens[i] if i < len(tokens) else "")
                if actual and actual[-1].isdigit():
                    actual.pop()
            elif "<" in token:
                i += 1
            elif actual:
                tramos.append(actual)
                actual = []
        else:
            actual.append(token)
        i += 1
    if actual:
        tramos.append(actual)
    return tramos, destinos


def limpiar(tramo):
    """Quita asignaciones y envolturas del comienzo: FOO=1 sudo gh ... -> gh ..."""
    tramo = list(tramo)
    while tramo:
        if re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", tramo[0]):
            tramo.pop(0)
        elif tramo[0] in ENVOLTURAS:
            tramo.pop(0)
            while tramo and tramo[0].startswith("-"):
                tramo.pop(0)
        else:
            break
    return tramo


def todos_los_tramos(comando):
    """Incluye lo que corre adentro de $(...), comillas invertidas y bash -c."""
    tramos, destinos = analizar(comando)
    internos = re.findall(r"\$\(([^()]*)\)", comando) + re.findall(r"`([^`]*)`", comando)
    salida = []
    for tramo in tramos:
        tramo = limpiar(tramo)
        if not tramo:
            continue
        salida.append(tramo)
        if os.path.basename(tramo[0]) in {"bash", "sh", "zsh"} and "-c" in tramo[:-1]:
            internos.append(tramo[tramo.index("-c") + 1])
    for interno in internos:
        otros, mas = todos_los_tramos(interno)
        salida += otros
        destinos += mas
    return salida, destinos


def subcomando_git(tramo):
    """Devuelve (subcomando, argumentos, carpeta de -C) o None si no es git."""
    if os.path.basename(tramo[0]) != "git":
        return None
    i, carpeta = 1, None
    while i < len(tramo) and tramo[i].startswith("-"):
        if tramo[i] in {"-C", "-c", "--git-dir", "--work-tree"}:
            if tramo[i] == "-C" and i + 1 < len(tramo):
                carpeta = tramo[i + 1]
            i += 1
        i += 1
    if i >= len(tramo):
        return None
    return tramo[i], tramo[i + 1:], carpeta


def rama_actual(carpeta):
    try:
        return subprocess.run(
            ["git", "-C", carpeta or ".", "symbolic-ref", "--short", "-q", "HEAD"],
            capture_output=True, text=True, timeout=5,
        ).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def empuja_rama_protegida(tramo, cwd):
    git = subcomando_git(tramo)
    if not git or git[0] != "push":
        return False
    _, argumentos, carpeta = git
    if {"--all", "--mirror"} & set(argumentos):
        return True
    posicionales = [a for a in argumentos if not a.startswith("-")]
    if len(posicionales) < 2:
        return rama_actual(carpeta or cwd) in RAMAS_PROTEGIDAS
    for referencia in posicionales[1:]:
        destino = referencia.lstrip("+").split(":")[-1].replace("refs/heads/", "")
        if destino in RAMAS_PROTEGIDAS or destino == "HEAD" and rama_actual(carpeta or cwd) in RAMAS_PROTEGIDAS:
            return True
    return False


def mergea_pr(tramo):
    if os.path.basename(tramo[0]) != "gh":
        return False
    if any(a == "pr" and b == "merge" for a, b in zip(tramo, tramo[1:])):
        return True
    return "api" in tramo and any(re.search(r"pulls/[^/]+/merge|/merges$", t) for t in tramo)


def configuracion():
    raiz = os.environ.get("CLAUDE_PROJECT_DIR", ".")
    try:
        with open(os.path.join(raiz, ".claude", "guardas.json"), encoding="utf-8") as archivo:
            return json.load(archivo)
    except (OSError, ValueError):
        return {}


def es_secreto(ruta, patrones):
    return any(re.search(p, ruta) for p in patrones)


def guarda_proyecto(evento):
    config = configuracion()
    secretos = SECRETOS + config.get("secretos", [])
    herramienta = evento.get("tool_name", "")
    entrada = evento.get("tool_input", {})
    if herramienta != "Bash":
        for campo in ("file_path", "notebook_path", "path", "glob", "pattern"):
            if herramienta == "Grep" and campo == "pattern":
                continue
            if es_secreto(str(entrada.get(campo, "")), secretos):
                bloquear(f"Guarda: {entrada[campo]} es un archivo de secretos y no se toca.")
        return
    comando = entrada.get("command", "")
    try:
        tramos, _ = todos_los_tramos(comando)
    except ValueError:
        preguntar("Guarda: no se pudo interpretar el comando. Revisalo antes de aprobar.")
    cwd = evento.get("cwd")
    costo = None
    for tramo in tramos:
        if mergea_pr(tramo):
            bloquear("Guarda: el merge lo hace una persona desde GitHub, no un agente.")
        if empuja_rama_protegida(tramo, cwd):
            bloquear("Guarda: no se empuja a main. Usá la rama del issue y abrí un PR.")
        if any(es_secreto(t, secretos) for t in tramo[1:]):
            bloquear("Guarda: el comando toca un archivo de secretos.")
        texto = " ".join(tramo)
        if os.path.basename(tramo[0]) not in SOLO_TEXTO:
            for patron in config.get("con_costo", []):
                if re.search(patron, texto):
                    costo = texto
    if costo:
        preguntar(f"Guarda: acción con costo o sobre un servicio real: {costo[:120]}. Necesita tu OK.")


def tramo_de_lectura(tramo):
    nombre = tramo[0]
    if nombre == "git":
        git = subcomando_git(tramo)
        if not git or git[0] not in GIT_LECTURA:
            return False
        return not any(a.startswith(("--output", "--ext-diff")) for a in git[1])
    if nombre == "gh":
        return tuple(tramo[1:3]) in GH_LECTURA
    if nombre not in LECTURA:
        return False
    if nombre == "find" and FIND_PROHIBIDOS & set(tramo):
        return False
    if nombre == "sed" and any(a.startswith("-i") or a == "--in-place" for a in tramo):
        return False
    if nombre == "sort" and any(a.startswith(("-o", "--output")) for a in tramo):
        return False
    if nombre == "rg" and any(a.startswith("--pre") for a in tramo):
        return False
    if nombre == "awk" and any(re.search(r"system|getline|[|>]", a) for a in tramo[1:]):
        return False
    return True


def guarda_solo_lectura(evento):
    if evento.get("tool_name") != "Bash":
        return
    comando = evento.get("tool_input", {}).get("command", "")
    if "$(" in comando or "`" in comando:
        bloquear("Guarda de solo lectura: no se permite sustitución de comandos.")
    try:
        tramos, destinos = analizar(comando)
    except ValueError:
        bloquear("Guarda de solo lectura: comando ilegible.")
    for destino in destinos:
        if destino != "/dev/null" and not destino.isdigit():
            bloquear("Guarda de solo lectura: no se escribe en archivos.")
    for tramo in tramos:
        if not tramo_de_lectura(tramo):
            bloquear(f"Guarda de solo lectura: '{tramo[0]}' no está permitido.")


def main():
    modo = sys.argv[1] if len(sys.argv) > 1 else ""
    try:
        evento = json.load(sys.stdin)
    except ValueError:
        evento = None
    if modo == "solo-lectura":
        if evento is None:
            bloquear("Guarda de solo lectura: entrada ilegible.")
        guarda_solo_lectura(evento)
    elif modo == "proyecto":
        if evento is None:
            preguntar("Guarda: entrada ilegible.")
        guarda_proyecto(evento)
    else:
        bloquear(f"Guarda: modo desconocido '{modo}'.")


if __name__ == "__main__":
    main()
