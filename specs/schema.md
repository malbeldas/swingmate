# Schema — SwingMate

> **Propósito.** Define cómo se guardan los datos: tablas, campos, tipos, constraints, índices y las reglas que garantiza la base.
>
> **Cómo se usa.** Cada migración en `supabase/migrations/` implementa lo que dice este documento. Si una migración necesita algo distinto, primero se cambia acá. Los permisos por fila (RLS) de cada tabla están en `roles-permissions.md`.
>
> **Qué NO va en este documento.** Por qué existe cada regla (`business-rules.md`), los permisos (`roles-permissions.md`), la configuración de Supabase (`infrastructure.md`) y los eventos de analytics (`observability.md`).
>
> **Motor.** PostgreSQL 15+ en Supabase, región Sídney. El login lo maneja Supabase Auth (`auth.users`); este esquema vive en `public`.

---

## Índice

1. Convenciones
2. Diagrama de relaciones
3. Referencia: suburbios
4. Personas: perfiles y roster
5. Avisos y disponibilidad
6. Guardados y alertas
7. Conversaciones
8. Confianza y moderación
9. Notificaciones y analytics
10. Funciones (RPC) y triggers
11. Almacenamiento de fotos
12. Fuera de scope

---

## 1. Convenciones

| Tema | Decisión |
|---|---|
| IDs | `uuid` con `gen_random_uuid()`. El perfil usa el mismo id que `auth.users`. `suburbs` y `analytics_events` usan enteros. |
| Fechas y horas | Momentos en `timestamptz` (UTC). Noches en `date`, interpretadas en la zona del aviso (`BR-AVL-005`). |
| Rangos de noches | Siempre `[desde, hasta)`: la fecha de salida no es una noche. |
| Dinero | AUD en enteros (dólares enteros, sin centavos). El mercado publica precios redondos. |
| Listas cerradas | `text` con `CHECK (... IN (...))`, no `enum` de Postgres, para poder sumar valores con una migración simple. |
| Borrado | Los avisos se borran lógicamente (`status = 'removed'`, `removed_at`) y una tarea los elimina a los 90 días (`BR-PRV-003`). Las cuentas se borran de verdad (`BR-ACC-007`); las referencias pasan a `NULL` y la interfaz muestra "Deleted user". |
| Timestamps comunes | `created_at timestamptz NOT NULL DEFAULT now()` en todas las tablas; `updated_at` mantenido por trigger donde hay ediciones. |
| Nombres | Tablas en plural y `snake_case`; columnas en `snake_case`. |

## 2. Diagrama de relaciones

```
auth.users 1─1 profiles 1─0..1 rosters
profiles 1─N listings 1─1 listing_private
listings 1─N listing_photos
listings 1─N listing_availability_ranges
listings 1─N listing_availability_exceptions
profiles N─N listings            (saved_listings)
profiles 1─N search_alerts 1─N alert_deliveries
listings 1─N conversations N─1 profiles (seeker)  ·  N─1 profiles (host)
conversations 1─N messages
conversations 1─0..1 outcome_responses
profiles N─N profiles            (blocks)
profiles 1─N reports  ·  moderation_actions (registro)
suburbs 1─N profiles (base) · 1─N listings · 1─N search_alerts
```

## 3. Referencia: suburbios

### `suburbs`

Lista de suburbios y localidades de Australia, cargada desde el dataset del ABS (`INT-006`). Solo lectura para todos.

| Campo | Tipo | Constraints | Nota |
|---|---|---|---|
| id | `integer` | PK | Código SAL del ABS. |
| name | `text` | NOT NULL | "Baldivis". |
| state | `text` | NOT NULL, CHECK IN (`WA`,`NSW`,`VIC`,`QLD`,`SA`,`TAS`,`NT`,`ACT`) | |
| postcode | `text` | NULL | Postcode principal. |
| lat, lng | `double precision` | NOT NULL | Centroide. |
| timezone | `text` | NOT NULL | IANA, por ejemplo `Australia/Perth`. |
| is_city | `boolean` | NOT NULL DEFAULT false | Ciudades capitales y regionales grandes, que buscan con 40 km (`BR-SRC-003`). |

Índices: `(lower(name) text_pattern_ops)` para el autocompletado; `(lat, lng)`.

## 4. Personas: perfiles y roster

### `profiles`

| Campo | Tipo | Constraints | Nota |
|---|---|---|---|
| id | `uuid` | PK, FK `auth.users(id)` ON DELETE CASCADE | |
| display_name | `text` | NOT NULL, CHECK largo 1–40 | `BR-ACC-003`. |
| base_suburb_id | `integer` | FK `suburbs(id)`, NULL hasta completar el perfil | `BR-ACC-003`. |
| bio | `text` | NULL, CHECK largo ≤ 300 | `BR-ACC-004`. |
| photo_path | `text` | NULL | Ruta en Storage (`§11`). |
| work_type | `text` | NULL, CHECK IN (`fifo`,`dido`,`bibo`,`other`) | |
| is_seeking | `boolean` | NOT NULL DEFAULT true | Intención (`BR-ACC-001`). |
| is_hosting | `boolean` | NOT NULL DEFAULT false | |
| terms_version | `text` | NULL | Versión aceptada. |
| terms_accepted_at | `timestamptz` | NULL | |
| message_rule | `text` | NOT NULL DEFAULT `'email'`, CHECK IN (`email`,`phone`) | `BR-TRU-004`. |
| listing_limit | `smallint` | NOT NULL DEFAULT 5 | `BR-LST-007`. |
| status | `text` | NOT NULL DEFAULT `'active'`, CHECK IN (`active`,`suspended`) | `BR-MSG-006`. |
| last_active_at | `timestamptz` | NULL | Para la actividad en la ficha. |
| created_at, updated_at | `timestamptz` | | |

El email, su verificación y el celular verificado viven en `auth.users` (`email_confirmed_at`, `phone`, `phone_confirmed_at`). Supabase garantiza que un celular no esté en dos cuentas (`AC-021-1`). El rol admin vive en `auth.users.raw_app_meta_data.role` (`roles-permissions.md`).

"Perfil mínimo completo" = `display_name`, `base_suburb_id`, `terms_accepted_at` no nulos y email confirmado. Se expone como la función `profile_is_ready(uid)`.

### `rosters`

| Campo | Tipo | Constraints | Nota |
|---|---|---|---|
| user_id | `uuid` | PK, FK `profiles(id)` ON DELETE CASCADE | Un roster por persona. |
| days_on | `smallint` | NOT NULL, CHECK 1–42 | `BR-ROS-002`. |
| days_off | `smallint` | NOT NULL, CHECK 1–42 | |
| anchor_date | `date` | NOT NULL | Primer día de un swing. |
| fly_home_last_day | `boolean` | NOT NULL DEFAULT true | `BR-ROS-003`. |
| fly_out_first_day | `boolean` | NOT NULL DEFAULT true | |
| created_at, updated_at | `timestamptz` | | |

"No fixed roster" = no hay fila.

## 5. Avisos y disponibilidad

### `listings`

| Campo | Tipo | Constraints | Nota |
|---|---|---|---|
| id | `uuid` | PK | |
| owner_id | `uuid` | NOT NULL, FK `profiles(id)` ON DELETE CASCADE | |
| status | `text` | NOT NULL DEFAULT `'draft'`, CHECK IN (`draft`,`active`,`paused`,`filled`,`hidden`,`removed`) | `BR-LST-002`. |
| title | `text` | CHECK largo 5–80 | Obligatorio para publicar. |
| description | `text` | CHECK largo ≤ 2000 | |
| suburb_id | `integer` | FK `suburbs(id)` | |
| public_lat, public_lng | `double precision` | | Centro del círculo, desplazado (`BR-LST-004`). |
| place_type | `text` | CHECK IN (`private_room`,`entire_place`) | |
| bathroom | `text` | CHECK IN (`own`,`ensuite`,`shared`) | |
| weekly_price | `integer` | CHECK 1–5000 | AUD. |
| bills_included | `boolean` | | |
| bond | `integer` | CHECK 0–20000 | AUD. |
| furnished | `boolean` | | |
| min_stay_weeks | `smallint` | NULL, CHECK 1–52 | NULL = sin mínimo. |
| household_size | `smallint` | NULL, CHECK 1–12 | Personas que viven, sin contar a quien llega. |
| household_on_roster | `smallint` | NULL, CHECK ≤ household_size | |
| host_lives_onsite | `boolean` | NULL | |
| airport_minutes | `smallint` | NULL, CHECK 1–240 | |
| couples_ok, pets_ok | `boolean` | NULL | |
| smoking | `text` | NULL, CHECK IN (`no`,`outside`,`yes`) | |
| parking | `text` | NULL, CHECK IN (`none`,`street`,`off_street`,`garage`) | |
| features | `text[]` | NOT NULL DEFAULT `'{}'` | Valores de una lista fija en el código. |
| perks | `text[]` | NOT NULL DEFAULT `'{}'` | Extras FIFO fijos. |
| custom_items | `text[]` | NOT NULL DEFAULT `'{}'`, CHECK cardinalidad ≤ 10 y cada ítem ≤ 40 | `BR-LST-006`. |
| other_rules | `text` | NULL, CHECK largo ≤ 200 | `BR-LST-005`. |
| availability_type | `text` | CHECK IN (`roster`,`from_date`,`ranges`) | `BR-AVL-003`. |
| available_from | `date` | NULL | Para `from_date`. |
| calendar_confirmed_at | `timestamptz` | | `BR-AVL-006`. Se actualiza con cada cambio de disponibilidad. |
| accuracy_declared_at | `timestamptz` | NULL | `BR-LST-003`. |
| published_at | `timestamptz` | NULL | Primera publicación. |
| hidden_reason | `text` | NULL | Lo escribe un admin. |
| removed_at | `timestamptz` | NULL | |
| created_at, updated_at | `timestamptz` | | |

Constraint de publicación (CHECK compuesto o trigger): si `status IN ('active','paused','filled')`, entonces los campos obligatorios de `BR-LST-001` no son nulos, `accuracy_declared_at` no es nulo y el dueño tiene celular confirmado (`BR-LST-003`). Si `availability_type = 'roster'`, el dueño tiene fila en `rosters`.

Índices: `(status, public_lat, public_lng)` para la búsqueda por radio; `(owner_id)`.

### `listing_private`

Separada de `listings` para que la dirección nunca viaje con el aviso. Solo la lee el dueño (`roles-permissions.md`).

| Campo | Tipo | Constraints |
|---|---|---|
| listing_id | `uuid` | PK, FK `listings(id)` ON DELETE CASCADE |
| address_line | `text` | NOT NULL, CHECK largo ≤ 200 |
| lat, lng | `double precision` | NOT NULL |

### `listing_photos`

| Campo | Tipo | Constraints | Nota |
|---|---|---|---|
| id | `uuid` | PK | |
| listing_id | `uuid` | NOT NULL, FK ON DELETE CASCADE | |
| storage_path | `text` | NOT NULL, UNIQUE | |
| position | `smallint` | NOT NULL | 0 = portada. UNIQUE `(listing_id, position)`. |
| width, height | `smallint` | NOT NULL | |
| created_at | `timestamptz` | | |

### `listing_availability_ranges`

Para `availability_type = 'ranges'`.

| Campo | Tipo | Constraints |
|---|---|---|
| id | `uuid` | PK |
| listing_id | `uuid` | NOT NULL, FK ON DELETE CASCADE |
| start_night | `date` | NOT NULL |
| end_exclusive | `date` | NOT NULL, CHECK `end_exclusive > start_night` |

### `listing_availability_exceptions`

| Campo | Tipo | Constraints |
|---|---|---|
| listing_id | `uuid` | FK ON DELETE CASCADE |
| night | `date` | |
| available | `boolean` | NOT NULL |
| | | PK `(listing_id, night)` |

Una tarea diaria borra excepciones de noches pasadas.

## 6. Guardados y alertas

### `saved_listings`

| Campo | Tipo | Constraints |
|---|---|---|
| user_id | `uuid` | FK `profiles(id)` ON DELETE CASCADE |
| listing_id | `uuid` | FK `listings(id)` ON DELETE CASCADE |
| created_at | `timestamptz` | |
| | | PK `(user_id, listing_id)` |

### `search_alerts`

| Campo | Tipo | Constraints | Nota |
|---|---|---|---|
| id | `uuid` | PK | |
| user_id | `uuid` | NOT NULL, FK ON DELETE CASCADE | Máximo 5 activas por usuario (trigger). |
| suburb_id | `integer` | NOT NULL, FK | |
| radius_km | `smallint` | NOT NULL, CHECK IN (5,15,25,40,50) | |
| stay_from, stay_to | `date` | NULL | Si hay fechas. |
| use_roster | `boolean` | NOT NULL | Si no hay fechas, usa el roster vigente del usuario. |
| place_type | `text` | NULL | |
| max_price | `integer` | NULL | |
| paused | `boolean` | NOT NULL DEFAULT false | |
| expires_at | `timestamptz` | NOT NULL DEFAULT now() + 90 days | `BR-MAIL-004`. |
| created_at | `timestamptz` | | |

### `alert_deliveries`

| Campo | Tipo | Constraints |
|---|---|---|
| alert_id | `uuid` | FK ON DELETE CASCADE |
| listing_id | `uuid` | FK ON DELETE CASCADE |
| sent_at | `timestamptz` | NOT NULL |
| | | PK `(alert_id, listing_id)` — un aviso no se avisa dos veces |

## 7. Conversaciones

### `conversations`

| Campo | Tipo | Constraints | Nota |
|---|---|---|---|
| id | `uuid` | PK | |
| listing_id | `uuid` | NOT NULL, FK `listings(id)` ON DELETE CASCADE | |
| seeker_id | `uuid` | FK `profiles(id)` ON DELETE SET NULL | NULL = "Deleted user". |
| host_id | `uuid` | FK `profiles(id)` ON DELETE SET NULL | Copia del dueño al crear. |
| stay_from, stay_to | `date` | NOT NULL | Fechas de la última consulta (`BR-MSG-002`). |
| roster_summary | `text` | NULL | "14:7 · next swing 19 Oct · flies home last day", congelado al enviar. |
| last_message_at | `timestamptz` | NOT NULL | |
| first_reply_at | `timestamptz` | NULL | Primera respuesta del host. |
| seeker_read_at, host_read_at | `timestamptz` | NULL | Para no leídos. |
| reminder_sent_at | `timestamptz` | NULL | `BR-MAIL-002`. |
| outcome_asked_at | `timestamptz` | NULL | `BR-MAIL-003`. |
| created_at | `timestamptz` | | |
| | | UNIQUE `(listing_id, seeker_id)` | `BR-MSG-001`. |

Índices: `(seeker_id, last_message_at DESC)`, `(host_id, last_message_at DESC)`.

### `messages`

| Campo | Tipo | Constraints | Nota |
|---|---|---|---|
| id | `uuid` | PK | |
| conversation_id | `uuid` | NOT NULL, FK ON DELETE CASCADE | |
| sender_id | `uuid` | FK `profiles(id)` ON DELETE SET NULL | |
| kind | `text` | NOT NULL, CHECK IN (`inquiry`,`text`,`system`) | `inquiry` lleva fechas. |
| body | `text` | NOT NULL, CHECK largo 1–1000 | `BR-MSG-003`. |
| stay_from, stay_to | `date` | NULL | Solo en `inquiry`. |
| risk_flag | `boolean` | NOT NULL DEFAULT false | Lo pone un trigger (`BR-MSG-008`). |
| emailed_at | `timestamptz` | NULL | Lo marca UC-050. |
| created_at | `timestamptz` | | |

Los mensajes no se editan ni se borran desde la web. Índice: `(conversation_id, created_at)`.

## 8. Confianza y moderación

### `blocks`

| Campo | Tipo | Constraints |
|---|---|---|
| blocker_id | `uuid` | FK ON DELETE CASCADE |
| blocked_id | `uuid` | FK ON DELETE CASCADE, CHECK `blocker_id <> blocked_id` |
| created_at | `timestamptz` | |
| | | PK `(blocker_id, blocked_id)` |

### `reports`

| Campo | Tipo | Constraints | Nota |
|---|---|---|---|
| id | `uuid` | PK | |
| reporter_id | `uuid` | FK ON DELETE SET NULL | |
| target_type | `text` | NOT NULL, CHECK IN (`listing`,`user`,`conversation`) | |
| target_id | `uuid` | NOT NULL | |
| reason | `text` | NOT NULL, CHECK IN (`scam`,`fake`,`offensive`,`unsafe`,`spam`,`other`) | `BR-TRU-005`. |
| details | `text` | NULL, CHECK largo ≤ 500 | |
| status | `text` | NOT NULL DEFAULT `'open'`, CHECK IN (`open`,`closed`) | |
| closed_at | `timestamptz` | NULL | |
| created_at | `timestamptz` | | |

### `moderation_actions`

Registro inmutable: sin permisos de `UPDATE` ni `DELETE` para nadie, incluido admin (`BR-ADM-001`).

| Campo | Tipo | Constraints | Nota |
|---|---|---|---|
| id | `uuid` | PK | |
| admin_id | `uuid` | NOT NULL | Sin FK para que sobreviva a la baja del admin. |
| action | `text` | NOT NULL, CHECK IN (`hide_listing`,`unhide_listing`,`suspend_user`,`unsuspend_user`,`warn_user`,`dismiss`,`read_conversation`,`grant_admin`,`revoke_admin`) | |
| target_type | `text` | NOT NULL | |
| target_id | `uuid` | NOT NULL | |
| report_id | `uuid` | NULL | |
| note | `text` | NOT NULL, CHECK largo ≥ 3 | |
| created_at | `timestamptz` | | |

### `outcome_responses`

| Campo | Tipo | Constraints |
|---|---|---|
| conversation_id | `uuid` | PK, FK ON DELETE CASCADE |
| answer | `text` | NOT NULL, CHECK IN (`found_here`,`found_elsewhere`,`not_yet`) |
| source | `text` | NOT NULL, CHECK IN (`email`,`chat`) |
| answered_at | `timestamptz` | NOT NULL |

## 9. Notificaciones y analytics

### `notification_preferences`

| Campo | Tipo | Constraints |
|---|---|---|
| user_id | `uuid` | PK, FK ON DELETE CASCADE |
| new_messages | `boolean` | NOT NULL DEFAULT true |
| alerts | `boolean` | NOT NULL DEFAULT true |
| reminders | `boolean` | NOT NULL DEFAULT true |

### `notification_log`

| Campo | Tipo | Constraints | Nota |
|---|---|---|---|
| id | `uuid` | PK | |
| user_id | `uuid` | NULL | |
| template | `text` | NOT NULL | `NTF-003`, etc. |
| ref_id | `uuid` | NULL | Conversación, aviso o alerta. |
| status | `text` | NOT NULL, CHECK IN (`sent`,`failed`) | |
| provider_message_id | `text` | NULL | |
| error | `text` | NULL | Sin datos personales. |
| created_at | `timestamptz` | | |

### `analytics_events`

| Campo | Tipo | Constraints | Nota |
|---|---|---|---|
| id | `bigint` | PK identity | |
| name | `text` | NOT NULL, CHECK IN (lista de `observability.md` §2) | |
| session_id | `uuid` | NOT NULL | Anónimo, generado en el navegador por pestaña. |
| user_id | `uuid` | NULL | Sin FK: los eventos sobreviven a la baja como anónimos (se pone NULL al borrar la cuenta). |
| props | `jsonb` | NOT NULL DEFAULT `'{}'` | Solo las propiedades permitidas (`BR-ANL-002`). |
| created_at | `timestamptz` | | |

Solo se inserta (desde la web, con RLS) y solo la leen los admins.

## 10. Funciones (RPC) y triggers

| Función | Tipo | Qué hace | Reglas |
|---|---|---|---|
| `listing_nights(listing_id, start date, n int)` | SQL, `security definer` | Devuelve un texto de `n` caracteres `1`/`0` con la disponibilidad desde `start`. Implementa `BR-AVL-003` y las excepciones. Su gemela en JS es `core/availability.js`; un test de paridad corre los mismos casos contra las dos. | BR-AVL-002/003/004 |
| `search_listings(lat, lng, radius_km, start date)` | SQL, `security definer` | Avisos `active` dentro del radio con sus campos públicos, foto de portada, datos del host para la card y `listing_nights(..., start, 84)`. El fit lo calcula la web con `core/fit.js`. | BR-SRC-001/003 |
| `get_listing(id, start date)` | SQL, `security definer` | Un aviso público con fotos, noches, ficha pública del host (`BR-TRU-002`) y "Calendar updated". Nunca toca `listing_private`. | BR-TRU-002/003, BR-LST-004 |
| `start_conversation(listing_id, body, stay_from, stay_to)` | SQL, `security definer` | Valida perfil mínimo, aviso activo, que no sea el dueño, bloqueos, regla del host, límite diario; crea o reutiliza la conversación e inserta la consulta. | BR-ACC-003, BR-MSG-001/002/006/007, BR-TRU-004, BR-LST-008 |
| `inquirer_card(conversation_id)` | SQL, `security definer` | Ficha de quien consulta para el host de esa conversación. | BR-TRU-001 |
| `publish_listing(listing_id)` | SQL, `security definer` | Verifica `BR-LST-001/003/007`, calcula el círculo público desde `listing_private` y pasa a `active`. | BR-LST-001/003/004/007 |
| trigger `messages_before_insert` | trigger | Rechaza si el remitente está suspendido o bloqueado; marca `risk_flag`; actualiza `last_message_at`, `first_reply_at` y el leído del remitente. | BR-MSG-006/008 |
| trigger `availability_touch` | trigger | Actualiza `calendar_confirmed_at` cuando cambian reglas o excepciones. | BR-AVL-006 |
| trigger `alerts_limit` | trigger | Máximo 5 alertas activas por usuario. | UC-006 E1 |

Las tareas programadas (emails, limpieza, alertas) son Edge Functions disparadas por `pg_cron` (`infrastructure.md`).

## 11. Almacenamiento de fotos

| Bucket | Lectura | Escritura | Ruta | Límites |
|---|---|---|---|---|
| `listing-photos` | Pública por URL | Solo el dueño del aviso | `{listing_id}/{uuid}.jpg` | JPEG o WebP, ≤ 5 MB, re-codificada sin EXIF en el navegador (`BR-PRV-002`). |
| `avatars` | Pública por URL | Solo el dueño | `{user_id}/{uuid}.jpg` | Igual. |

Las rutas usan uuid, así que no se pueden adivinar. Al eliminar un aviso o una cuenta, una Edge Function borra sus archivos.

## 12. Fuera de scope

- Tablas de pagos, reservas, bonds o contratos.
- Verificación de identidad con documento (cuando llegue: tabla `identity_verifications` con estado y referencia del proveedor, nunca la imagen del documento).
- Reseñas.
- Perfiles públicos de quien busca para el reverse marketplace.
- Materializar el fit en una tabla (`MatchEvaluation` de las Reglas §23): con el volumen del piloto se calcula al consultar. Se agrega si la búsqueda tarda más de 2 s (`AC-001`, `observability.md`).

---

*Documento vivo. Cada cambio de tabla entra primero acá y después como migración; una migración aplicada no se edita, se agrega otra.*
