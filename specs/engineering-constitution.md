# Engineering constitution — SwingMate

> **Propósito.** Define cómo se construye SwingMate: stack, estructura de carpetas, convenciones, testing, CI y prácticas prohibidas.
>
> **Cómo se usa.** Es la referencia para cualquier decisión técnica de un issue. Si una tarea necesita romper una regla de acá, se propone el cambio en el PR y se espera la decisión de Maxi antes de codear.
>
> **Qué NO va en este documento.** Qué hace el producto (`use-cases.md`, `business-rules.md`), las tablas (`schema.md`), los permisos (`roles-permissions.md`), los servicios externos (`integrations.md`), los ambientes y costos (`infrastructure.md`) y por qué se eligió este stack (`decision-log.md` DEC-101).

---

## Índice

1. Principios
2. Stack por capa
3. Estructura de carpetas
4. Convenciones de código
5. Acceso a datos y seguridad
6. Interfaz
7. Testing
8. CI y deploy
9. Reglas hard
10. Prácticas prohibidas

---

## 1. Principios

1. **Lo más simple que llega al piloto del 6 Dic.** Sin framework ni paso de build, igual que `catalogo-web`: HTML, CSS y JavaScript con ES modules nativos.
2. **La base es la frontera de seguridad.** La web habla directo con Supabase; lo que un usuario puede ver o hacer lo decide RLS en Postgres, no el JavaScript del navegador.
3. **La lógica del dominio es pura y está en un solo lugar.** Noches, disponibilidad, fit y chequeos de texto viven en `core/` sin DOM, con tests unitarios, y los usan la web y las Edge Functions.
4. **Costo cero hasta que haya usuarios que lo justifiquen.** Planes gratuitos; cada servicio pago es una decisión de Maxi y Tomás (`infrastructure.md` §5).

## 2. Stack por capa

| Capa | Elección | Versión | Nota |
|---|---|---|---|
| Web | HTML + CSS + JavaScript ES modules, sin build | ES2022 | Una página HTML por pantalla. |
| Hosting web | GitHub Pages desde `main` | — | Dominio `swingmate.au` cuando Tomás apunte el DNS (`decision-log.md` Q-04). |
| Base de datos | Supabase Postgres | 15+ | Región Sídney (`BR-PRV-001`). |
| Login | Supabase Auth | — | Email + contraseña con código, Google, celular para verificación. |
| Tiempo real | Supabase Realtime | — | Solo para mensajes de la conversación abierta. |
| Fotos | Supabase Storage | — | `schema.md` §11. |
| Servidor | Supabase Edge Functions (Deno + TypeScript) | — | Solo emails, tareas programadas, baja de cuenta y acciones de admin. |
| Tareas programadas | `pg_cron` + `pg_net` llamando Edge Functions | — | |
| Cliente JS | `@supabase/supabase-js` | 2.x, versión exacta vendorizada en `vendor/` | |
| Mapa | Leaflet + tiles de OpenStreetMap | 1.9.x vendorizado | `INT-005`. |
| Tests unitarios | `node:test` | Node 22 | Sin dependencias. |
| Tests de base | pgTAP con `supabase test db` | — | RLS, RPC y triggers. |
| Tests de pantalla | Playwright con Chromium | 1.56.x | Contra Supabase local. |
| Entorno local | Supabase CLI (`supabase start`) | Última estable al iniciar, fijada en CI | Incluye Mailpit para leer emails de prueba. |

## 3. Estructura de carpetas

```
/                         Raíz publicada por GitHub Pages
├── index.html            Home y búsqueda
├── search.html           Resultados
├── listing.html          Detalle (?id=)
├── list.html             Wizard para publicar (?id= para editar o retomar)
├── messages.html         Inbox y conversación (?c=)
├── account.html          Mi cuenta (#profile, #roster, #listings, #saved, #alerts, #notifications, #privacy)
├── admin.html            Panel de admin
├── how-it-works.html, safety.html, terms.html, privacy.html
├── outcome.html          Respuesta de un toque desde el email (?t=token)
├── core/                 Lógica pura, sin DOM ni red
│   ├── dates.js          Noches, rangos, formato de fechas
│   ├── roster.js         BR-ROS-003
│   ├── availability.js   BR-AVL-003 (gemela de listing_nights)
│   ├── fit.js            BR-FIT-001 a 006
│   ├── text-checks.js    BR-MSG-008, BR-LST-005, BR-TRU-007
│   └── geo.js            Distancias y círculo desplazado (BR-LST-004)
├── app/                  Pantalla: lee y escribe el DOM y la red
│   ├── config.js         URL y anon key según el host (local o producción)
│   ├── db.js             Único lugar que crea el cliente de Supabase
│   ├── session.js        Sesión, gate de registro, borrador (BR-ACC-005)
│   ├── track.js          Eventos de analytics (observability.md)
│   ├── ui/               Componentes: card, calendar, roster-modal, auth-sheet, map...
│   └── pages/            Un módulo por página HTML
├── assets/               tokens.css, base.css, íconos SVG, logo
├── vendor/               supabase-js y leaflet, versión exacta en el nombre
├── supabase/
│   ├── migrations/       SQL numerado; nunca se edita una migración aplicada
│   ├── functions/        Edge Functions (importan ../../core/*.js)
│   ├── tests/            pgTAP
│   ├── seed.sql          Datos de ejemplo SOLO para local y CI (BR-TRU-006)
│   └── config.toml
├── tests/
│   ├── fixtures/         Casos compartidos de roster, disponibilidad y fit (JSON)
│   ├── unit/             node:test sobre core/
│   └── e2e/              Playwright
├── specs/                Este set de specs
└── .github/workflows/    ci.yml, deploy-db.yml (manual), keepalive.yml
```

## 4. Convenciones de código

- **Idioma:** código, nombres y comentarios en inglés; textos de interfaz en inglés australiano; specs, issues y PRs en español.
- **Nombres:** archivos en `kebab-case`, funciones y variables en `camelCase`, columnas SQL en `snake_case`. Los términos salen de `glossary.md` (`night`, `needNights`, `fitClass`, `listing`, `inquiry`).
- **Módulos:** solo `import`/`export` nativos. Rutas relativas con extensión (`./fit.js`).
- **`core/`:** funciones puras exportadas; reciben datos simples y devuelven datos simples. No importan nada de `app/` ni de `vendor/`. Fechas como `YYYY-MM-DD` o índices de noche enteros; nunca `Date` con hora para noches.
- **Errores:** las funciones de `app/` devuelven `{ data, error }` como supabase-js. Ningún `catch` vacío: o se muestra al usuario, o se registra `client_error` (`observability.md` §4).
- **Comentarios:** solo para el porqué. Cuando una función implementa una regla, el comentario cita el ID (`// BR-ROS-003`).
- **Formato:** Prettier con su configuración por defecto, sin otras reglas de estilo.

## 5. Acceso a datos y seguridad

- La web usa solo la **anon key** y la sesión del usuario. La `service_role` vive únicamente en los secretos de las Edge Functions.
- Toda tabla de `public` tiene RLS activado y al menos una política. Una tabla sin políticas no pasa CI (test pgTAP que recorre el catálogo).
- Las lecturas públicas de avisos pasan por `search_listings` y `get_listing`; nunca un `select` directo de la web sobre `listings` de otro usuario.
- Toda función `security definer` empieza validando `auth.uid()` y fija `search_path = public`.
- Todo texto de usuario que entra al DOM pasa por `esc()` o por `textContent`. Prohibido `innerHTML` con datos sin escapar.
- Detalle de amenazas y límites: `security.md`. Matriz de permisos: `roles-permissions.md`.

## 6. Interfaz

- **Mobile first:** se diseña y prueba primero a 375 px y después a 1280 px. Sin scroll horizontal a 375 px.
- **Tokens:** colores, tipografías, espacios y radios salen de `assets/tokens.css` (`design-system.md`). Prohibido un color o tamaño escrito a mano fuera de los tokens.
- **Accesibilidad básica:** cada campo con `<label>`; foco visible; las hojas y modales atrapan el foco y cierran con Escape; contraste AA en textos; el calendario no depende solo del color (cada noche tiene `title` y texto alternativo con fecha y estado).
- **Sin scripts externos** salvo el widget de Cloudflare Turnstile (`INT-004`); la API de Supabase y los tiles de OpenStreetMap son conexiones, no scripts. Las fuentes (Manrope e Inter) se sirven desde `assets/fonts/`.
- **Rendimiento:** imágenes con `loading="lazy"`, `width` y `height`; la portada de la card en 800 px de ancho como máximo.

## 7. Testing

| Nivel | Qué cubre | Herramienta | Dónde |
|---|---|---|---|
| Unitario | Todo `core/`: noches, disponibilidad, fit, razones, chequeos de texto, geo | `node:test` | `tests/unit/` |
| Paridad | `core/availability.js` y `listing_nights` dan lo mismo para cada caso de `tests/fixtures/availability.json` | `node:test` + pgTAP | `tests/unit/`, `supabase/tests/` |
| Base | Cada política RLS, cada RPC y cada trigger, con usuarios de prueba | pgTAP | `supabase/tests/` |
| Pantalla | Cada flujo de `use-cases.md` contra Supabase local con `seed.sql` | Playwright, Chromium, 375×740 táctil y 1280×800 | `tests/e2e/` |

Reglas:

- El título de cada test empieza con el AC que cubre: `AC-004-2 el borrador sobrevive al registro con email`. Un AC sin test es una tarea incompleta.
- Un bug corregido suma un test que fallaba antes del arreglo.
- Los tests nunca llaman a Google, Resend, Twilio ni OpenStreetMap reales. Los emails se leen de Mailpit; el SMS usa el modo de prueba de Supabase con números y códigos fijos en `config.toml`; el mapa usa un tile local.
- Lo visual se revisa con capturas a 375 y 1280 px que se adjuntan al PR. No se testea automáticamente el aspecto.

## 8. CI y deploy

- **CI (`ci.yml`)** en cada PR y en `main`:
  1. Tests unitarios.
  2. `supabase start` y `supabase test db`.
  3. E2E con Playwright.
  4. Chequeo `no-sample-data`: falla si `seed.sql` se referencia fuera de local o si hay datos "Sample" en una migración (`BR-TRU-006`).
- **Deploy de la web:** GitHub Pages publica `main`. Un PR mergeado es un deploy.
- **Deploy de la base:** las migraciones se aplican a producción con `supabase db push` desde un workflow manual (`workflow_dispatch`) que solo Maxi dispara. Nunca automático al mergear.
- **Edge Functions:** `supabase functions deploy` desde el mismo workflow manual.
- **Ramas:** `issue-<N>-<slug>` desde `main` actualizado. PR con `Closes #N`. El merge lo hace Maxi.

## 9. Reglas hard

1. **Costo cero** salvo lo aprobado en `infrastructure.md` §5. Ningún servicio pago nuevo sin decisión de Maxi y Tomás.
2. **RLS en todo.** Ninguna tabla sin políticas y ninguna `service_role` fuera de Edge Functions.
3. **Datos privados no salen de la base hacia otra persona:** dirección exacta, email, teléfono, empleador (`BR-TRU-003`). Hay tests que lo prueban mirando las respuestas de red.
4. **Lógica pura en `core/`** con test unitario, compartida entre web y Edge Functions.
5. **Sin inventario falso en producción** (`BR-TRU-006`).
6. **Mobile first a 375 px** y sin scripts externos salvo Turnstile (`SEC-22`).
7. **Cada AC tiene su test** y nada se mergea con CI en rojo.
8. **El logo es el existente** (Instagram: círculo navy, "Swing" crema, "Mate" ámbar). No se proponen ni dibujan logos nuevos.

## 10. Prácticas prohibidas

- Frameworks de UI, bundlers o TypeScript en la web sin pasar por `decision-log.md`.
- `select *` desde la web; siempre columnas explícitas o RPC.
- Guardar datos personales en `localStorage`. El borrador del mensaje va en `sessionStorage` y se borra al enviar (`BR-ACC-005`).
- Poner datos personales en URLs o en eventos de analytics (`BR-ANL-002`).
- Editar una migración ya aplicada.
- Saltear, desactivar o marcar como `skip` un test para que CI pase.
- Copiar datos de ejemplo del prototipo a producción.

---

*Documento vivo. Un cambio de stack o de regla hard entra primero en `decision-log.md` y después acá.*
