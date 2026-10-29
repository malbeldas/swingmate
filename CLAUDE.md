---
name: swingmate
description: Governance file for AI coding agents working on SwingMate. Defines documentation routing, precedence rules, and operational protocol.
---

# CLAUDE.md — SwingMate

> Esta es la primera lectura obligatoria antes de cualquier tarea. Te dice **dónde está la verdad** sobre cada aspecto del proyecto y **en qué orden** consultarla.

---

## 1. Qué es este proyecto

SwingMate es una web responsive para que trabajadores FIFO, DIDO y BIBO de Australia compartan alojamiento según su roster: quien busca encuentra una casa libre las noches que está en la ciudad, y quien tiene lugar lo ofrece por las noches en que está en el sitio o libre. En v0.1 no hay pagos, reservas ni contratos: el producto termina en una conversación entre dos personas verificadas. El objetivo inmediato es un piloto en Perth el 6 Dic 2026, sin código atado a Perth. Socios: Tomás (visual y negocio) y Maxi (producto y flujos).

Glosario completo en `specs/glossary.md`.

---

## 2. Stack (resumen — fuente de verdad: `specs/engineering-constitution.md` §2)

- Web: HTML, CSS y JavaScript con ES modules nativos, sin framework ni build. Una página HTML por pantalla.
- Hosting: GitHub Pages desde `main`.
- Datos, login, fotos, chat en tiempo real y funciones de servidor: Supabase (Postgres 15+, región Sídney).
- Lógica de dominio pura en `core/` (noches, disponibilidad, fit, chequeos de texto), compartida por la web y las Edge Functions.
- Servicios externos: Google sign-in, Resend (email), Twilio (SMS), Cloudflare Turnstile, OpenStreetMap + Leaflet, dataset ABS de suburbios.
- Tests: `node:test` (unit), pgTAP (base y RLS), Playwright con Chromium a 375×740 y 1280×800 (pantalla) contra Supabase local.
- **El stack está pendiente de confirmación de Maxi y Tomás** (`specs/decision-log.md` Q-02). Hasta que se confirme, no se crean issues de código que dependan de él.

---

## 3. Mapa de documentación — qué consultar para qué

La documentación está en `specs/`. Cada archivo es **autoritativo en su área** y las áreas no se solapan.

| Pregunta que estás resolviendo | Archivo autoritativo | Tipo de contenido |
|---|---|---|
| ¿Qué significa este término? | `specs/glossary.md` | Vocabulario y textos de interfaz |
| ¿Qué puede y qué no puede pasar? | `specs/business-rules.md` | Reglas `BR-{módulo}-NNN` |
| ¿Qué hace cada persona y cuándo está terminado? | `specs/use-cases.md` | `UC-NNN` con criterios `AC-NNN-n` |
| ¿Qué tablas y funciones hay? | `specs/schema.md` | Tablas, constraints, RPC, triggers, Storage |
| ¿Quién puede leer o escribir qué? | `specs/roles-permissions.md` | Matriz `P-NN` de RLS |
| ¿Cómo se construye y testea? | `specs/engineering-constitution.md` | Stack, carpetas, convenciones, testing, CI, reglas hard |
| ¿Contra qué nos protegemos? | `specs/security.md` | Amenazas `T-NN` y medidas `SEC-NN` |
| ¿Qué emails o SMS salen y con qué texto? | `specs/notifications.md` + `specs/notifications-*.md` | `NTF-NNN` |
| ¿Qué servicios externos usamos? | `specs/integrations.md` + `specs/integrations-*.md` | `INT-NNN` |
| ¿Cómo se ve? | `specs/design-system.md` | Tokens, componentes, prohibiciones |
| ¿Qué tomo del prototipo? | `specs/frontend-migration.md` | Inventario de pantallas y lógica a portar |
| ¿Qué medimos y quién recibe alertas? | `specs/observability.md` | Catálogo cerrado de eventos y alertas |
| ¿Dónde corre, cuánto cuesta y cómo se despliega? | `specs/infrastructure.md` | Ambientes, tareas programadas, costos, deploy |
| ¿Por qué se decidió así y qué falta decidir? | `specs/decision-log.md` | `DEC-NNN` cerradas y `Q-NN` pendientes |
| ¿Cómo ejecuto una tarea paso a paso? | `task-execution-prompt.md` | Workflow Learn → Plan → Write → Validate → PR |
| ¿Qué tarea hago? | GitHub Issues de `malbeldas/swingmate` | Una tarea por issue (`#N`) |

### Precedencia ante conflicto

Si dos fuentes se contradicen:

1. `business-rules.md` gana sobre todo lo demás en **qué** hace el producto, incluidos los AC de `use-cases.md`.
2. `schema.md` y `roles-permissions.md` ganan en **cómo se guarda y quién accede**; si contradicen una regla, se corrige el schema o la matriz.
3. `security.md` gana sobre cualquier doc en lo que agrega restricciones; nunca se relaja una medida `SEC-NN` para cumplir otro doc.
4. `engineering-constitution.md` gana en **cómo se construye**; `design-system.md` en **cómo se ve**.
5. `decision-log.md` explica; no crea reglas. Una `Q-NN` pendiente no se implementa como si estuviera decidida, salvo lo que el doc dice explícitamente que se construye mientras tanto.
6. El prototipo y `frontend-migration.md` son referencia visual y de textos; nunca ganan sobre un spec.
7. Un issue no puede ampliar el alcance de los specs: si pide algo que no está o los contradice, primero se propone el cambio al spec (§4.5).
8. El código es la referencia más débil: si difiere de un spec, es un desvío a corregir.

Si después de aplicar las reglas anteriores el conflicto persiste: **detenerse y reportar la discrepancia** al humano antes de codear.

---

## 4. Protocolo operativo para cada tarea

**Toda tarea que llega a Claude Code se ejecuta en este orden. Sin excepciones.**

### 4.1 Identificar IDs involucrados

- `BR-{ROS|AVL|SRC|FIT|LST|ACC|MSG|TRU|MAIL|ADM|PRV|ANL}-NNN` — reglas (`business-rules.md`). Ejemplo: `BR-ROS-003` noches que necesita según el roster.
- `UC-NNN` y `AC-NNN-n` — casos de uso y criterios (`use-cases.md`). Ejemplo: `AC-004-2` el borrador sobrevive al registro.
- `P-NN` — filas de la matriz de permisos (`roles-permissions.md`).
- `T-NN`, `SEC-NN` — amenazas y medidas (`security.md`).
- `NTF-NNN` — notificaciones; `INT-NNN` — integraciones.
- `DEC-NNN`, `Q-NN` — decisiones y pendientes (`decision-log.md`).
- Reglas hard: "regla hard N" de `engineering-constitution.md` §9.
- Tareas: `#N` (issue de GitHub).

> **Regla dura:** las reglas se citan por ID, no se parafrasean.

### 4.2 Ejecutar el workflow Learn → Plan → Write → Validate → PR

Definido en detalle en `task-execution-prompt.md` (raíz del repo).

Resumen:

1. **LEARN** — leer el issue y las secciones de los specs que cita, escanear el código existente.
2. **PLAN** — diseñar el cambio y justificar decisiones contra los specs.
3. **WRITE** — implementar migraciones, `core/`, pantalla y tests.
4. **VALIDATE** — checklist contra las reglas hard y los AC, correr los tests.
5. **PR** — rama por issue, PR con `Closes #N`, CI en verde. El merge lo hace Maxi.

### 4.3 Reglas duras para producción de código

Citadas de `specs/engineering-constitution.md` §9:

1. **Costo cero** salvo lo aprobado en `infrastructure.md` §5. Ningún servicio pago nuevo sin decisión de Maxi y Tomás.
2. **RLS en todo.** Ninguna tabla sin políticas y ninguna `service_role` fuera de Edge Functions.
3. **Datos privados no salen de la base hacia otra persona:** dirección exacta, email, teléfono, empleador (`BR-TRU-003`). Hay tests que lo prueban mirando las respuestas de red.
4. **Lógica pura en `core/`** con test unitario, compartida entre web y Edge Functions.
5. **Sin inventario falso en producción** (`BR-TRU-006`).
6. **Mobile first a 375 px** y sin scripts externos salvo Turnstile (`SEC-22`).
7. **Cada AC tiene su test** y nada se mergea con CI en rojo.
8. **El logo es el existente** (Instagram: círculo navy, "Swing" crema, "Mate" ámbar). No se proponen ni dibujan logos nuevos.

Y de `engineering-constitution.md` §10, prácticas prohibidas: frameworks o build sin decisión, `select *` desde la web, datos personales en `localStorage`, URLs o eventos, editar migraciones aplicadas, saltear tests, copiar datos de ejemplo del prototipo a producción.

### 4.4 Reglas duras para testing

El proyecto no tiene capas formales; el corte es entre lógica pura, base y pantalla (`engineering-constitution.md` §7):

| Si la tarea toca… | Test obligatorio | Herramienta |
|---|---|---|
| `core/` (noches, disponibilidad, fit, textos, geo) | Unitario, sin DOM ni red | `node:test` en `tests/unit/` |
| `core/availability.js` o `listing_nights` | Paridad con `tests/fixtures/availability.json` contra las dos | `node:test` + pgTAP |
| Migraciones: tablas, RLS, RPC, triggers | Un test por política `P-NN` y por RPC | pgTAP en `supabase/tests/` |
| Un flujo de pantalla | E2E a 375×740 táctil y a 1280×800, contra Supabase local con `seed.sql` | Playwright en `tests/e2e/` |
| Plantillas de email | Unitario de la función que arma `{ subject, text, html }` | `node:test` |

- El título de cada test empieza con el AC que cubre (`AC-004-2 …`). Un AC sin test es una tarea incompleta (regla hard 7).
- Un bug corregido suma un test que fallaba antes del arreglo.
- Nunca se llama a Google, Resend, Twilio ni OpenStreetMap reales desde un test.
- Lo visual se revisa con capturas a 375 y 1280 px adjuntas al PR.

### 4.5 Propuestas de documentación

Si la tarea introduce contexto nuevo (una regla, un caso de error, un AC, una decisión), proponer el diff sobre el spec correspondiente en la descripción del PR. Si no, omitir.

**No editar los archivos de `specs/` ni este `CLAUDE.md` directamente** salvo que el issue lo pida de forma explícita y Maxi lo haya aprobado.

---

## 5. Lo que NO está cubierto por la documentación (todavía)

- **API contracts formales:** no hay `api-contracts.md`; las firmas de las RPC están en `schema.md` §10 y se documentan con el SQL.
- **Accesibilidad:** no hay spec propio; el mínimo está en `engineering-constitution.md` §6.
- **SEO:** fuera del piloto (`decision-log.md` §4).
- **Textos legales:** Terms, Privacy y "Before you agree" esperan al abogado (`decision-log.md` Q-01). No se inventan.
- **Decisiones pendientes:** todo lo marcado `Q-NN` en `decision-log.md`.

---

## 6. Reglas de comunicación con el humano

- **Tono profesional y conciso** en español rioplatense, con voseo. La interfaz del producto, en inglés australiano.
- **Citar IDs siempre** (BR, UC, AC, P, SEC, NTF, INT, DEC, Q, issue).
- **Decir "no sé"** cuando un spec no cubre el caso, y preguntar antes de suponer.
- **Ante opciones, recomendar una con razones y evidencia** y esperar la decisión de Maxi. Si la pregunta es para Tomás, siempre va con "lo que haríamos nosotros".

---

## 7. Cómo arrancar una tarea (cheat sheet)

1. Leer el issue con comentarios: `gh issue view <N> --comments` (o la herramienta de GitHub disponible).
2. Anotar los UC, AC, BR y P que cita; si no cita ninguno, deducirlos de los specs y confirmarlos en el plan.
3. Crear la rama `issue-<N>-<slug>` desde `main` actualizado.
4. Levantar el entorno local: `supabase start` y servir la raíz con `npx serve .`.
5. Seguir `task-execution-prompt.md` fase por fase.
6. Correr `npm test`, `supabase test db` y `npx playwright test` antes del PR.
7. Abrir el PR con `Closes #<N>` y esperar CI en verde. No mergear: lo hace Maxi.

---

*Documento vivo. Si encontrás un caso recurrente no cubierto, proponé adición a este archivo antes que improvisar.*
