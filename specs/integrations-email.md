# Integration: Email (Resend) — SwingMate

> **Parte del set de integrations.** Ver overview en [integrations.md](./integrations.md).
>
> **Propósito.** Enviar los emails de login (códigos y reseteo) y de producto (mensajes, recordatorios, alertas).

---

## Identificación

- **ID:** INT-002
- **Proveedor:** Resend. Plan gratuito: 3.000 emails por mes, 100 por día, 3 dominios (resend.com/pricing, consultado el 29 Oct 2026).
- **Use cases:** UC-030, UC-031, UC-050 a UC-054, UC-034.
- **Notificaciones:** NTF-001 a NTF-007 y NTF-009.

## Por qué hace falta

El email que trae Supabase de fábrica es para pruebas y tiene límites muy bajos; para usuarios reales hay que configurar un SMTP propio (la página de precios de Supabase lo lista como incluido en todos los planes).

## Flujo

- **Auth:** Supabase Auth usa el SMTP de Resend (`smtp.resend.com`).
- **Producto:** la Edge Function `send-email` llama a la API de Resend con `{ from, to, subject, text, html, headers: { 'List-Unsubscribe' } }` y guarda el resultado en `notification_log`.

## Configuración

- Dominio `swingmate.au` verificado en Resend con los registros SPF, DKIM y DMARC que pide. **Requiere acceso al DNS del dominio**, que está a nombre de Tomás (`decision-log.md` Q-04).
- Remitentes: `hello@swingmate.au` (producto y auth), respuestas a `support@swingmate.au`.

## Errores y límites

| Caso | Comportamiento |
|---|---|
| Error 5xx o timeout | Reintento a 1, 5 y 30 minutos; después `failed` en el log. |
| Límite diario de 100 alcanzado | Los emails de auth tienen prioridad; los de producto esperan a la próxima corrida. Se avisa a los admins. |
| Rebote o queja de spam | Se registra; tres rebotes seguidos apagan los emails de producto de esa persona. |

**Cuándo deja de alcanzar el plan gratuito:** con unos 30 usuarios activos por día que reciben 3 emails cada uno. Pasar al plan pago es una decisión (`infrastructure.md` §5).

## Modo local

Supabase local envía todo a Mailpit. `send-email` con `EMAIL_PROVIDER=log` guarda el email en `notification_log` en lugar de enviarlo, y los E2E lo leen de ahí.

## Criterios de aceptación

- AC-1: un email de producto sin `List-Unsubscribe` no pasa los tests de plantillas.
- AC-2: con el proveedor caído, el email se reintenta 3 veces y queda `failed` sin datos personales en `error`.

---

*Detalle de INT-002. Si cambia el proveedor o los datos que recibe, se actualiza la tabla de inventario.*
