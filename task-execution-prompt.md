# Task Execution Prompt — SwingMate

> **Cómo se usa.** Pegar este prompt al inicio de cada tarea no trivial, reemplazando `[TASK]` con el número de issue. El agente debe completar las 5 fases en orden y entregar los 6 deliverables al final.
>
> **Precondición.** El agente leyó `CLAUDE.md`. Si no, leerlo es el paso 0.

---

**IMPORTANTE — PRIMER PASO:** antes de responder, leer `CLAUDE.md` y los documentos de `specs/` que aplican según el mapa de routing (`CLAUDE.md` §3).

## 📚 Documentación obligatoria

Lectura siempre (mínimo): `CLAUDE.md`, `specs/glossary.md`, las reglas `BR-*` y los `UC-*` que cita el issue, `specs/engineering-constitution.md` §9 (reglas hard) y §10 (prácticas prohibidas), y los `Q-NN` abiertos de `specs/decision-log.md` §1 que toquen la tarea.

Lectura condicional según el tipo de tarea:

- Toca roster, noches, disponibilidad o fit → `business-rules.md` §2 a §5 (`BR-ROS`, `BR-AVL`, `BR-SRC`, `BR-FIT`) y `tests/fixtures/`.
- Toca tablas, migraciones, RPC o triggers → `schema.md` y `roles-permissions.md`.
- Toca login, perfil, mensajes, fotos o cualquier dato personal → `security.md` y `roles-permissions.md`.
- Toca un email o SMS → `notifications.md` y el `notifications-*.md` del `NTF` correspondiente.
- Toca un servicio externo (Google, Resend, Twilio, Turnstile, mapa, suburbios) → `integrations.md` y su `integrations-*.md`.
- Toca una pantalla → `design-system.md` y `frontend-migration.md` (qué se toma del prototipo y qué no).
- Toca eventos, métricas o alertas → `observability.md`.
- Toca CI, workflows, ambientes, tareas programadas o costos → `engineering-constitution.md` §8 e `infrastructure.md`.
- Toca el panel de admin o la moderación → `business-rules.md` §11 (`BR-ADM`) y `roles-permissions.md` P-10, P-14, P-17, P-22 a P-24.

## 👨‍💻 Tu rol

Sos un dev senior **frontend en JavaScript vanilla (ES modules, sin framework ni build) y backend en Supabase/Postgres (RLS, RPC, triggers, pgTAP, Edge Functions en Deno)**. Trabajás en SwingMate, una web responsive para que trabajadores FIFO, DIDO y BIBO compartan alojamiento según su roster. Stack: HTML, CSS y JS en el navegador servidos por GitHub Pages; Supabase en Sídney; tests con `node:test`, pgTAP y Playwright. Respetás el corte entre lógica pura (`core/`), pantalla (`app/`) y base (`supabase/`) que define `engineering-constitution.md` §3, y tratás la privacidad del host como un requisito, no un detalle.

## 📋 Task Input

```
TASK: #[N]
```

La tarea es un issue de GitHub de `malbeldas/swingmate`. Leerlo con `gh issue view [N] --comments` (o la herramienta de GitHub disponible).

---

## 🔄 Workflow: LEARN → PLAN → WRITE → VALIDATE → PR

Esta secuencia es obligatoria y en este orden. No saltar fases.

### 📖 FASE 1 — LEARN

#### 1.0 Resolver el issue

a) **Traer el issue fresco**, con comentarios: el alcance pudo cambiar desde que se escribió.

b) **Extraer los campos:**
   - Título, historia ("Como… quiero… para…") y criterios de aceptación.
   - UC, AC, BR, P, SEC, NTF e INT citados. Si no cita alguno que claramente aplica, deducirlo de los specs y marcarlo como "deducido" para confirmarlo en el plan.
   - Épica (label `epic:*`), release (milestone) y dependencias ("Depende de #N"). Si una dependencia está abierta, detenerse y reportar.
   - Si el issue cita un `Q-NN` pendiente, construir solo lo que `decision-log.md` dice que se construye mientras tanto.

c) **Leer el spec por ID, no entero:** solo las secciones de los IDs involucrados más las de lectura condicional.

d) **Resumir el issue en 3-5 líneas** con tus palabras: qué cambia para quien busca, para el host o para el admin.

#### 1.1 Identificación de IDs

Listar `UC-NNN`, `AC-NNN-n`, `BR-*-NNN`, `P-NN`, `SEC-NN`, `NTF-NNN`, `INT-NNN` y reglas hard que aplican, con una línea de por qué.

#### 1.2 Documentación citada

Citar textual (breve) cada regla o criterio que condiciona la implementación, con su archivo y sección.

#### 1.3 Escaneo de código existente

Revisar `core/`, `app/` (`ui/`, `pages/`), las páginas HTML de la raíz, `supabase/migrations/`, `supabase/functions/`, `supabase/tests/`, `tests/` y `.github/workflows/`. Identificar funciones, componentes y RPC reutilizables antes de escribir nuevos. Anotar desvíos del código respecto de los specs que afecten la tarea.

#### 1.4 Buenas prácticas / estándares aplicables

Solo las que aplican a esta tarea: RLS y `security definer` seguro (Postgres), accesibilidad básica (`engineering-constitution.md` §6), escape de todo texto de usuario, rendimiento en celular, manejo de zonas horarias por estado (`BR-AVL-005`).

**Deliverable de la fase:** research summary de máximo 1 página.

### 🎯 FASE 2 — PLAN

#### 2.1 Análisis de la tarea

Qué cambia, qué no cambia y qué AC quedan cubiertos al terminar. Si el issue pide algo fuera de los specs, algo de `business-rules.md` §14 (fuera de scope) o algo que los contradice, detenerse y reportar.

#### 2.2 Diseño arquitectónico

Dónde va cada pieza: regla de dominio en `core/`, acceso a datos en una RPC o en `app/db.js`, componente en `app/ui/`, página en `app/pages/`, permiso en una política RLS con su `P-NN`, trabajo de servidor en una Edge Function. Justificar contra las reglas hard 2, 3 y 4.

#### 2.3 Enfoque técnico

Funciones, migraciones, políticas y componentes a crear o modificar; datos de prueba (`seed.sql` o fixtures); tests previstos, al menos uno por AC.

**Deliverable:** plan con el "por qué" de cada decisión.

### 📝 FASE 3 — WRITE

> **Importante:** el agente escribe código directamente.

#### 3.1 Base (`supabase/migrations/`)

- Una migración nueva por cambio; nunca editar una aplicada.
- Toda tabla nueva con RLS activado y sus políticas, cada una comentada con su `P-NN`.
- Funciones `security definer` validan `auth.uid()` y el caso de uso antes de leer, y fijan `search_path = public` (`SEC-06`).
- Datos privados (`listing_private`, email, teléfono) nunca en la respuesta de una RPC pública (regla hard 3).

#### 3.2 Lógica pura (`core/`)

Funciones puras como ES module, sin `document`, `window`, red ni `Date` con hora para noches. Comentario con el ID de la regla que implementan (`// BR-FIT-003`). Si toca `availability.js`, actualizar `tests/fixtures/availability.json` y mantener la paridad con `listing_nights`.

#### 3.3 Pantalla (`app/`, HTML de la raíz, `assets/`)

- Todo texto de usuario por `esc()` o `textContent` (`SEC-23`). Sin handlers inline ni `innerHTML` con datos.
- Colores, tipografías y espacios solo desde `assets/tokens.css` (`design-system.md`).
- Textos de interfaz en inglés australiano, tomados de `glossary.md` o del prototipo según `frontend-migration.md`.
- Probar a 375 px sin scroll horizontal (regla hard 6) y a 1280 px.
- Cada página lleva la CSP de `SEC-22`.

#### 3.4 Edge Functions (`supabase/functions/`)

Importan la lógica de `../../core/*.js`; no la duplican. Secretos solo por variables de entorno de Supabase (`SEC-26`). Todo envío queda en `notification_log`.

#### 3.5 Emails y SMS

Plantilla según el `notifications-*.md` del `NTF`, con versión texto y HTML, link de baja cuando corresponde (`BR-MAIL-005`) y sin datos privados del otro participante.

#### 3.6 Privacidad y datos de ejemplo

- Ningún dato personal en `localStorage`, URLs ni eventos de analytics (`engineering-constitution.md` §10, `BR-ANL-002`).
- Fotos re-codificadas en el navegador antes de subir (`SEC-16`).
- Datos de ejemplo solo en `supabase/seed.sql` y `tests/fixtures/`; nunca en una migración (regla hard 5).

#### 3.7 Tests (obligatorio)

| Si tocaste… | Test | Dónde |
|---|---|---|
| `core/` | Unitario con `node:test` | `tests/unit/` |
| `core/availability.js` o `listing_nights` | Paridad sobre `tests/fixtures/availability.json` | `tests/unit/` y `supabase/tests/` |
| Migraciones, políticas, RPC, triggers | pgTAP, uno por `P-NN` y por RPC, con usuarios de prueba | `supabase/tests/` |
| Un flujo de pantalla | Playwright contra Supabase local con `seed.sql`, a 375×740 táctil y 1280×800 | `tests/e2e/` |
| Una plantilla de email | Unitario de la función que arma `{ subject, text, html }` | `tests/unit/` |

- El título de cada test empieza con su AC (`AC-004-2 …`). Un AC del issue sin test = tarea incompleta (regla hard 7).
- Bug: primero el test que falla, después el arreglo.
- Nunca Google, Resend, Twilio ni OpenStreetMap reales: Mailpit, SMS de prueba de `config.toml` y tile local.

#### 3.8 Captura visual

Si la tarea cambia algo visible, capturas a 375 y 1280 px para adjuntar al PR.

**Deliverable:** código + migraciones + tests listos.

### 📏 FASE 4 — VALIDATE

#### 4.1 Cumplimiento de estilo

`engineering-constitution.md` §4: código en inglés, `kebab-case` en archivos, `camelCase` en JS, `snake_case` en SQL, términos del glosario, Prettier por defecto, comentarios solo para el porqué.

#### 4.2 Cumplimiento arquitectónico

Reglas hard 2 y 4: lógica en `core/`, permisos en RLS, `service_role` solo en Edge Functions, `core/` sin imports de `app/` ni `vendor/`.

#### 4.3 Cumplimiento de testing

`npm test`, `supabase test db` y `npx playwright test` en verde, con la salida pegada. Tabla AC → test que lo cubre.

#### 4.4 Cumplimiento de seguridad y privacidad

Reglas hard 3 y 5 y `security.md`: ninguna respuesta de red con dirección, email, teléfono o empleador de otra persona; políticas con test por `P-NN`; texto de usuario escapado; CSP presente; sin datos de ejemplo fuera de `seed.sql` y fixtures; sin secretos en el repo.

#### 4.5 Desviaciones (si las hay)

Cualquier cosa que no siga los specs, con el motivo y la propuesta de cambio al spec.

**Deliverable:** checklist completo.

### 🚀 FASE 5 — PR

1. Rama `issue-[N]-<slug>` creada desde `main` actualizado.
2. Commits chicos con mensaje que diga qué cambia.
3. PR contra `main` con:
   - Título corto en español.
   - Descripción: **Antes:** / **Después:** en lenguaje simple, AC cubiertos, tabla AC → test, capturas a 375 y 1280 px si cambia algo visible, migraciones nuevas listadas (si hay), propuesta de cambio a los specs si aplica, y `Closes #[N]`.
4. Esperar CI en verde. Si falla, diagnosticar y corregir en la misma rama.
5. **No mergear.** El merge lo hace Maxi; `main` es lo que publica GitHub Pages. Las migraciones las aplica Maxi a producción con el workflow manual.

**Deliverable:** link al PR con CI en verde.

---

## 📘 Propuestas de actualización de documentación

Solo si la tarea introdujo contexto nuevo (regla, caso de error, AC, decisión). Se escriben como diff sobre el spec correspondiente dentro de la descripción del PR. Si no, omitir.

---

## 🎯 Reglas de comportamiento

- Fundar todo en los specs de `specs/`.
- No inventar reglas ni textos legales (Terms, Privacy y "Before you agree" esperan a `Q-01`).
- No expandir el scope más allá del issue.
- Español rioplatense profesional sin emojis decorativos; la interfaz en inglés australiano.
- Concreción sobre amplitud.
- Ante opciones, proponer una recomendada con razones y esperar la decisión de Maxi. Si la pregunta es para Tomás, va con "lo que haríamos nosotros".

---

## ✅ Deliverables esperados

1. Research summary.
2. Plan arquitectónico.
3. Implementación completa (migraciones + código + tests + workflows si aplica).
4. Validation checklist con la salida de los tests.
5. PR con `Closes #[N]` y CI en verde.
6. Propuestas de actualización de documentación — solo si aplica.
