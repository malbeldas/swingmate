---
name: ui-discovery
description: Diagnostica el modo visual de una tarea SwingMate y produce un brief corto antes de prototipar.
---

# UI Discovery — SwingMate

## Propósito

Usar cuando una tarea modifica o crea una experiencia visual relevante.

No inventa una dirección visual ni implementa pantallas. Produce el contexto mínimo para una decisión.

## Paso 1 — Clasificar el modo

Elegir uno:

- Fidelidad: existe referencia aprobada concreta.
- Composición guiada: no hay pantalla aprobada, pero sí design system/patrones.
- Evolución: existe UI que necesita cambios.
- Exploración: no existe referencia ni sistema suficiente.
- Mantenimiento liviano: bug visual puntual.

Para SwingMate, preferir **Evolución** o **Composición guiada** cuando exista una pantalla actual y `specs/design-system.md`.

## Paso 2 — Leer la fuente de verdad

Siempre:

- `CLAUDE.md`
- `specs/design-system.md`
- `specs/frontend-migration.md`

Luego solo los BR/UC/AC de la historia afectada.

No reinterpretar reglas de producto como decisiones visuales.

## Paso 3 — Identificar la tarea crítica

Redactar una frase:

> La persona necesita ______ para poder ______.

Luego identificar:

- información imprescindible;
- acción principal;
- estados relevantes;
- restricciones;
- incertidumbres visuales reales.

## Paso 4 — Separar decidido vs exploratorio

Crear dos listas:

### Fijo

Reglas, flujos, textos o patrones ya aprobados.

### A explorar

Solo aspectos estructurales donde existe una decisión humana pendiente.

## Paso 5 — Entregable

Actualizar o crear `docs/design/experience-brief.md`, máximo 1–2 páginas cuando sea una historia acotada.

Debe contener:

- objetivo;
- usuario;
- tarea crítica;
- flujo;
- estados;
- restricciones;
- criterios de éxito;
- preguntas abiertas.

## Regla de parada

Si la exploración exige cambiar una BR, un AC, un token de marca o una decisión cerrada, no asumirlo: registrarlo como decisión pendiente y detener esa parte.
