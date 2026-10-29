# Observability — SwingMate

> **Propósito.** Define qué medimos para validar el piloto, cómo nos enteramos de que algo se rompió y quién recibe cada alerta.
>
> **Cómo se usa.** Un evento nuevo se agrega primero a la tabla de §2 y después al código. La lista es cerrada: la base rechaza nombres que no estén (`schema.md` `analytics_events`).
>
> **Qué NO va en este documento.** Qué datos personales no se miden (`BR-ANL-002`, `security.md` §7) y la infraestructura (`infrastructure.md`).
>
> **Origen.** Unifica los eventos que estaban repartidos en tres documentos: Web MVP §7, Reglas §25 y Messaging §16 (pendiente señalado en la Revisión integral del 18 Oct).

---

## Índice

1. Qué queremos saber
2. Catálogo de eventos
3. Métricas del piloto
4. Errores y alertas
5. Logs
6. Fuera de scope

---

## 1. Qué queremos saber

Las cuatro hipótesis del Web MVP §2, traducidas a preguntas medibles:

| Hipótesis | Pregunta | Métrica principal |
|---|---|---|
| H1: el roster reduce fricción | ¿Las búsquedas con roster o fechas encuentran más avisos que encajan? | % de búsquedas con al menos un full o strong |
| H2: hay oferta | ¿Cuántos hosts publican y mantienen el calendario? | Avisos activos; % con calendario confirmado en 30 días |
| H3: entienden el producto | ¿La gente carga su roster y escribe? | % de visitantes que buscan con roster o fechas; % que pasan del detalle al envío |
| H4: escriben cuando hay fit | ¿Las consultas reciben respuesta y terminan en acuerdo? | Tasa de respuesta en 48 h; respuestas "Yes, here" a la pregunta de resultado |

## 2. Catálogo de eventos

Propiedades permitidas: solo las de la tabla. Nunca texto de mensajes, nombres, emails, teléfonos ni direcciones (`BR-ANL-002`). Los ids de aviso y conversación sí se permiten porque no identifican a una persona fuera de la base.

| Evento | Cuándo | Propiedades |
|---|---|---|
| `landing_viewed` | Se abre cualquier página sin sesión previa en la pestaña | `page`, `src` (`direct`, `email`, `social`, `other`) |
| `search_performed` | Se muestran resultados | `has_dates`, `has_roster`, `radius_km`, `n_full`, `n_strong`, `n_partial`, `n_poor`, `state` |
| `near_matches_opened` | "Show near matches" | `n_partial` |
| `listing_viewed` | Se abre un detalle | `listing_id`, `fit_class` |
| `fit_reasons_opened` | Se despliegan las razones | `listing_id`, `fit_class` |
| `listing_saved` | Corazón activado | `listing_id` |
| `alert_created` | Alerta guardada | `has_dates`, `has_roster` |
| `roster_completed` | Se guarda un roster por primera vez | `pattern`, `fly_home_last_day`, `fly_out_first_day`, `logged_in` |
| `roster_updated` | Se cambia un roster | `pattern` |
| `message_draft_started` | Primera tecla en la caja de mensaje | `listing_id`, `logged_in` |
| `send_message_clicked` | Se toca "Send" | `listing_id`, `logged_in`, `dates_conflict` |
| `auth_gate_opened` | Se abre el registro | `source` (`header`, `message`, `save`, `alert`, `list_place`) |
| `signup_started` | Se elige método | `method` (`google`, `email`), `source` |
| `signup_completed` | Email verificado o Google OK | `method`, `source` |
| `profile_completed` | Perfil mínimo completo | `intent` |
| `phone_verified` | Celular verificado | `as_host` |
| `conversation_started` | Se crea una conversación | `conversation_id`, `listing_id`, `fit_class` |
| `message_sent` | Cualquier mensaje enviado | `conversation_id`, `role` (`seeker`, `host`), `risk_flag` |
| `first_reply_received` | Primera respuesta del host | `conversation_id`, `hours_to_reply` |
| `conversation_opened` | Se abre una conversación | `conversation_id`, `role` |
| `listing_created` | Se crea un borrador | `listing_id` |
| `listing_published` | Pasa a active por primera vez | `listing_id`, `availability_type`, `n_photos` |
| `availability_exception_added` | El host bloquea o abre noches | `listing_id`, `n_nights` |
| `calendar_confirmed` | El host confirma su calendario | `listing_id`, `source` (`email`, `web`) |
| `report_created` | Reporte enviado | `target_type`, `reason` |
| `user_blocked` | Bloqueo | — |
| `outcome_asked` | Sale la pregunta de resultado | `conversation_id` |
| `outcome_answered` | Respuesta | `conversation_id`, `answer`, `source` |
| `email_clicked` | Se llega desde un email | `ntf` (NTF-00X) |
| `client_error` | Error de JavaScript o de red no manejado | `page`, `kind`, `message` (hasta 200 caracteres, sin datos de usuario) |

Reemplazos respecto de los documentos anteriores: `roster_created` pasa a `roster_completed`; `search_with_roster` y `*_fit_returned` pasan a propiedades de `search_performed`; `*_from_message` pasan a la propiedad `source`; `match_result_viewed` pasa a `listing_viewed`.

## 3. Métricas del piloto

Una vista SQL `metrics_weekly`, visible solo para admins en `admin.html#metrics`, con una fila por semana:

| Métrica | Cálculo |
|---|---|
| Visitantes | Sesiones con `landing_viewed` |
| Registros | `signup_completed` |
| Perfiles completos | `profile_completed` |
| Avisos activos | `listings` en `active` al cierre de la semana |
| Búsquedas | `search_performed` |
| Búsquedas con fit | `search_performed` con `n_full + n_strong > 0` / búsquedas |
| Detalle → envío | `send_message_clicked` / `listing_viewed` |
| Gate → registro | `signup_completed` con `source = message` / `auth_gate_opened` con `source = message` |
| Conversaciones | `conversation_started` |
| Tasa de respuesta 48 h | Conversaciones con `first_reply_at` en menos de 48 h / conversaciones |
| Mediana de horas a primera respuesta | De `first_reply_received.hours_to_reply` |
| Acuerdos | `outcome_answered` con `answer = found_here` |

Objetivos del piloto: los define Tomás junto con Maxi antes del 6 Dic (`decision-log.md` Q-13). Sin objetivos escritos no se puede decir si el piloto funcionó.

## 4. Errores y alertas

| Qué falla | Cómo se detecta | Quién recibe la alerta | Cómo |
|---|---|---|---|
| Error de JavaScript en una página | `window.onerror` y `unhandledrejection` registran `client_error` | Admins | Resumen diario por email si hay más de 10 en el día |
| Envío de email | `notification_log.status = failed` | Admins | Email inmediato si hay 3 fallas seguidas |
| Tarea programada | Cada Edge Function de cron escribe su corrida en `notification_log` con `template = 'cron:<nombre>'` | Admins | Email si una tarea diaria no corrió en 26 h |
| Proyecto pausado o caído | Workflow `keepalive.yml` diario consulta un endpoint | Maxi | Falla del workflow, que GitHub avisa por email |
| Gasto de SMS | Alerta de Twilio en US$10 | Tomás y Maxi | Email de Twilio |
| Límite diario de emails | Respuesta 429 de Resend | Admins | Email inmediato |

## 5. Logs

- Supabase guarda los logs de API, base y Edge Functions 1 día en el plan gratuito y 7 días en Pro (supabase.com/pricing, consultado el 29 Oct).
- Las Edge Functions loguean en JSON con `fn`, `event`, `ref_id` y `ms`; nunca emails, teléfonos ni texto de mensajes.

## 6. Fuera de scope

- Herramientas de terceros (GA4, PostHog, Sentry): ver `decision-log.md` DEC-105.
- Mapas de calor, grabación de sesiones o A/B testing.
- Tracing distribuido.

---

*Documento vivo. Un evento nuevo entra a la tabla de §2 y a la lista del CHECK en la misma migración.*
