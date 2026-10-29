# Notifications — SwingMate

> **Propósito.** Define qué avisos manda SwingMate, a quién, por qué canal y con qué reglas comunes.
>
> **Cómo se usa.** Este archivo es el overview. Cada notificación tiene su archivo de detalle con el texto exacto; ver la tabla de inventario.
>
> **Qué NO va en este documento.** Cuándo corresponde cada aviso como regla de negocio (`business-rules.md` §10), la configuración de los proveedores (`integrations-email.md`, `integrations-sms.md`) y los flujos de sistema (`use-cases.md` UC-050 a UC-054).

---

## Inventario

| ID | Notificación | Canal | Trigger | Destinatario | Archivo de detalle |
|---|---|---|---|---|---|
| NTF-001 | Código de verificación de email | Email | Registro con email (UC-030) | Quien se registra | [notifications-email-code.md](./notifications-email-code.md) |
| NTF-002 | Reseteo de contraseña | Email | "Forgot password?" (UC-031) | Quien lo pide | [notifications-password-reset.md](./notifications-password-reset.md) |
| NTF-003 | Mensaje nuevo | Email | Mensaje sin leer 10 min (UC-050) | Quien lo recibe | [notifications-new-message.md](./notifications-new-message.md) |
| NTF-004 | Recordatorio al host | Email | 48 h sin respuesta (UC-051) | Host | [notifications-host-reminder.md](./notifications-host-reminder.md) |
| NTF-005 | Pregunta de resultado | Email | 14 días desde la primera consulta (UC-052) | Quien buscó | [notifications-outcome-question.md](./notifications-outcome-question.md) |
| NTF-006 | Confirmar calendario | Email | 30 días sin cambios de calendario (UC-054) | Host | [notifications-calendar-check.md](./notifications-calendar-check.md) |
| NTF-007 | Alertas de avisos nuevos | Email | Corrida diaria (UC-053) | Quien creó la alerta | [notifications-alert-digest.md](./notifications-alert-digest.md) |
| NTF-008 | Código de verificación de celular | SMS | "Send code" (UC-021) | Quien verifica | [notifications-phone-code.md](./notifications-phone-code.md) |
| NTF-009 | Reporte nuevo | Email | Reporte creado (UC-034) | Admins | [notifications-admin-report.md](./notifications-admin-report.md) |

## Reglas transversales

1. **Idioma y tono.** Inglés australiano, frases cortas, sin signos de exclamación salvo en el saludo. Firma "The SwingMate team".
2. **Remitente.** `SwingMate <hello@swingmate.au>`, con `Reply-To` a `support@swingmate.au`. Mientras el dominio no esté verificado, solo se envía en local (Mailpit).
3. **Datos personales mínimos.** Un email nunca incluye el email ni el teléfono de la otra persona, ni la dirección del aviso. Puede incluir el nombre visible y el suburbio.
4. **Links con token.** Los botones de un toque (NTF-005, NTF-006) llevan un token firmado de un solo propósito, vigente 60 días. El resto de los links lleva a la web y pide sesión.
5. **Darse de baja.** Todos los emails de producto (NTF-003, 004, 006, 007) llevan "Manage email settings" a `account.html#notifications` y un header `List-Unsubscribe` (`BR-MAIL-005`). NTF-001, 002, 008 y 009 no se pueden apagar.
6. **Reintentos.** Ante un error del proveedor se reintenta 3 veces (1, 5 y 30 minutos). Cada intento final queda en `notification_log` con `status` y sin datos personales en `error`.
7. **Idempotencia.** Antes de enviar se chequea `notification_log` (o la columna de la tabla, como `reminder_sent_at`) para no mandar dos veces lo mismo.
8. **Formato.** Cada email tiene versión texto y HTML. El HTML usa una sola columna de 600 px, colores de marca y el logo existente; funciona sin imágenes.
9. **Analytics.** Los clicks en emails llevan `?src=email&ntf=NTF-00X` y la página registra `email_clicked` (`observability.md`).

## Configuración compartida

- Emails de auth (NTF-001, NTF-002): plantillas de Supabase Auth, enviadas por el SMTP de Resend (`INT-002`). Se editan en `supabase/templates/` y se aplican con la CLI.
- Emails de producto (NTF-003 a 007, 009): Edge Function `send-email` con la API de Resend. Plantillas en `supabase/functions/_shared/emails/`, una función por plantilla que recibe datos y devuelve `{ subject, text, html }`. Se testean con `node:test`.
- SMS (NTF-008): Supabase Auth con Twilio (`INT-003`).

## Items descartados (fase 2)

- Email al host cuando su aviso recibe muchas visitas.
- Resumen semanal para hosts.
- Notificaciones push o SMS de mensajes nuevos (`Messaging & Registration Flow` §11: SMS tiene costo por mensaje).
- Email de bienvenida: el registro ya devuelve a la persona a lo que estaba haciendo; no suma.

---

*Documento vivo. Cuando se suma una notificación, se agrega a la tabla de inventario y se crea su archivo de detalle.*
