# Frontend migration — SwingMate

> **Propósito.** Define qué se lleva del prototipo navegable v10 a la web real, qué se reescribe y qué se descarta.
>
> **Cómo se usa.** Cada issue que construye una pantalla cita la fila de §2 que le corresponde y usa el prototipo como referencia visual y de textos. Lo que el prototipo hace distinto de los specs se resuelve a favor de los specs (§4).
>
> **Qué NO va en este documento.** El diseño visual en tokens (`design-system.md`), los flujos (`use-cases.md`) y el stack (`engineering-constitution.md`).
>
> **Origen.** Prototipo v10, publicado el 27 Oct 2026 en claude.ai/artifact/9FtEvpdcmrZgqTbKH6ZRQw. Son tres plantillas de un canvas de diseño (`Main.dc.html` para quien busca, `Host.dc.html` y `Admin.dc.html`) con lógica en una clase JavaScript. No es código de producción: no hay base, ni login real, ni red.

---

## Índice

1. Criterio de fidelidad
2. Inventario de pantallas
3. Lógica que se porta
4. Desvíos del prototipo respecto de los specs
5. Lo que se descarta
6. Fuera de scope

---

## 1. Criterio de fidelidad

- **Textos:** se copian tal cual del prototipo (están en inglés australiano y ya los revisamos con Tomás), salvo donde §4 indica un cambio.
- **Visual:** adaptable, no pixel-perfect. Se respetan la estructura, la jerarquía y los tokens (`design-system.md`); el detalle visual lo puede ajustar Tomás.
- **Celular:** el prototipo se pensó para escritorio. Cada pantalla se rehace mobile first (`engineering-constitution.md` §6). El prototipo es la referencia de escritorio.

## 2. Inventario de pantallas

| Pantalla del prototipo | Archivo nuevo | UC | Qué se porta | Qué cambia |
|---|---|---|---|---|
| Home: hero, gráfico You / Your housemate, buscador, cards 2 por fila | `index.html` | UC-001 | Textos, estructura, gráfico | Datos reales; autocompletar de suburbios (`INT-006`). |
| Modal de roster | `app/ui/roster-modal.js` | UC-002 | Patrones, preguntas de vuelo, vista previa de 4 semanas | "Other pattern" (`BR-ROS-002`); fecha libre real. |
| Resultados con filtros y near matches | `search.html` | UC-001 | Estructura, filtros, estado vacío, nota de poor | Radio (`BR-SRC-003`), alertas reales. |
| Detalle: galería, fit, facts con íconos, mapa, calendario, host, caja de mensaje | `listing.html` | UC-003, UC-004 | Todo | Mapa con Leaflet y OSM (`INT-005`); fechas reales; "Calendar updated". |
| Hojas de registro: email + contraseña, código, perfil, celular, oferta de publicar | `app/ui/auth-sheet.js` | UC-030, UC-021 | Pasos y textos | Supabase Auth real; Google real; captcha. |
| My account: profile, my roster 12 semanas, saved, alerts, messages, notifications, privacy | `account.html` | UC-032, UC-002, UC-005, UC-006, UC-035 | Secciones y textos | Datos reales; descarga y baja reales. |
| Inbox y conversación de quien busca | `messages.html` | UC-033 | Lista, burbujas, "Before you agree", pregunta de resultado | Tiempo real; aviso de riesgo (`BR-MSG-008`). |
| Host: wizard de 5 pasos | `list.html` | UC-020 | Pasos, chips, "+ Add your own", "Other house rules", verificación de celular | Guardar borrador; fotos reales sin EXIF; marcar la casa en el mapa. |
| Host: my listings y calendario | `account.html#listings` | UC-022 | Acciones y textos | Excepciones por noche reales. |
| Host: inbox con "About {name}" | `messages.html` | UC-023 | Ficha, guía | `inquirer_card` real. |
| Host: email de mensaje nuevo (maqueta) | `supabase/functions/_shared/emails/` | UC-050 | Texto y estructura | `NTF-003`. |
| Host: account con "Who can message you" | `account.html#profile` | UC-024 | Radio y textos | — |
| Admin: cola de reportes con nota obligatoria y log | `admin.html` | UC-040 | Acciones, nota, registro | Lectura de conversaciones solo con reporte (`BR-ADM-002`); búsqueda de usuarios y avisos (UC-041), que no estaba. |
| How it works, Terms, Privacy, Safety | `how-it-works.html`, `terms.html`, `privacy.html`, `safety.html` | — | No existen en el prototipo | Se escriben nuevas; Terms y Privacy dependen del abogado (`decision-log.md` Q-01). |

## 3. Lógica que se porta

| Función del prototipo | Destino | Ajuste |
|---|---|---|
| `rosterCfg`, `isRRFor`, `needNightFor`, `isTravelDay` | `core/roster.js` | Ancla como fecha real en lugar de índice relativo al 12 Oct 2026; patrones libres. |
| `status(l, d)` | `core/availability.js` + `listing_nights` en SQL | El prototipo usa ciclos y días bloqueados ficticios; la versión real implementa las tres reglas de `BR-AVL-003` y excepciones. |
| `searchWindow`, `needDays`, `blocks` | `core/dates.js`, `core/fit.js` | Fechas reales en la zona del aviso (`BR-AVL-005`); horizonte desde la fecha de entrada (`BR-SRC-002`). |
| `fit(l, need, byDates, budget)` | `core/fit.js` | Separar cálculo (clase, faltantes) de textos (razones) para testear cada uno. |
| `weeks`, `calendar` | `app/ui/calendar.js` | Usa el resultado de `core/`; no calcula. |
| Chequeo de largo y chips de "Other house rules" | `core/text-checks.js` | Suma los chequeos de riesgo y de discriminación (`BR-LST-005`, `BR-MSG-008`). |

Los casos de prueba del prototipo (Baldivis y Scarborough full, Wellard strong, Rockingham y Success partial, Mandurah poor, con un 14:7 que arranca el 19 Oct) pasan a `tests/fixtures/fit.json` con fechas absolutas, para no perder la regresión.

## 4. Desvíos del prototipo respecto de los specs

| Prototipo v10 | Spec | Qué se hace |
|---|---|---|
| Fecha "hoy" fija en 12 Oct 2026 | Hoy real | Se usa la fecha real. |
| Seis avisos y personas de ejemplo con fotos generadas | `BR-TRU-006` | Solo en `supabase/seed.sql` para local y tests, rotulados "Sample". |
| Barra "View as" y botón "Open my account (demo)" | No existen | Se descartan. |
| Código de email y SMS simulados (cualquier código vale) | `BR-ACC-002`, `INT-003` | Códigos reales; en tests, los fijos de Supabase. |
| Búsqueda sin radio (todos los avisos de Perth) | `BR-SRC-003` | Radio desde el suburbio. |
| Sin borrador de aviso | `BR-LST-002` | "Save and finish later". |
| Mínimo de fotos no exigido | `BR-LST-001` | 3 fotos. |
| Sin "Calendar updated" | `BR-AVL-006` | Se agrega en el detalle. |
| Sin perfil público del host | Fuera de scope v0.1 | Queda el bloque del host en el detalle. |
| Pensado para escritorio | `engineering-constitution.md` §6 | Mobile first. |

## 5. Lo que se descarta

- La clase de lógica del canvas y su sistema de plantillas (`sc-if`, `sc-for`, `{{…}}`).
- Los estados de demo (`loggedIn`, `offerSent`, `sentFor`) y cualquier dato guardado solo en memoria.
- Las imágenes de ejemplo de los avisos (`/_blob/…`). La foto del hero se reemplaza por una con licencia de uso comercial o una propia.

## 6. Fuera de scope

- Migrar el canvas de diseño a otra herramienta: el prototipo queda como referencia y se congela en v10. Los cambios visuales nuevos se hacen directo en la web.
- Portar el mapa de flujos de draw.io: se actualiza en Drive por separado.

---

*Documento vivo. Cuando una pantalla del inventario se termina, su fila se marca con el número del PR que la cerró.*
