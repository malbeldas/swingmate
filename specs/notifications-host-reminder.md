# Notification: Host reminder — SwingMate

> **Parte del set de notifications.** Ver overview en [notifications.md](./notifications.md).
>
> **Propósito.** Darle al host una segunda oportunidad de responder una consulta antes de que quien busca se vaya a otra plataforma.

---

## Identificación

- **ID:** NTF-004
- **Trigger:** 48 horas desde la primera consulta sin respuesta del host (UC-051). Una sola vez por conversación.
- **Destinatario:** host.
- **Reglas referenciadas:** BR-MAIL-002, BR-MAIL-005.

## Variables del template

| Variable | Origen | Ejemplo |
|---|---|---|
| `hostName` | `profiles.display_name` | Matt |
| `seekerName` | `profiles.display_name` | Alex |
| `listingTitle` | `listings.title` | Modern room in Baldivis |
| `stayLabel` | `conversations.stay_from/to` | 12 – 19 Oct |
| `conversationUrl` | `messages.html?c=<id>&src=email&ntf=NTF-004` | — |
| `pauseUrl` | `account.html#listings` | — |

## Asunto

`{{seekerName}} is still waiting for your reply`

## From / Reply-To

Ver reglas transversales del overview.

## Contenido — versión texto

```
Hi {{hostName}},

{{seekerName}} asked about {{listingTitle}} for {{stayLabel}} two days ago.

Reply on SwingMate: {{conversationUrl}}

Not a fit? A short "sorry, not available" helps them keep looking.
Room already taken? Mark your listing as filled: {{pauseUrl}}

Manage email settings: {{settingsUrl}}
The SwingMate team
```

## Contenido — versión HTML

Igual que NTF-003 pero sin los mensajes: un botón principal "Reply" y un link secundario "Mark as filled".

## Implementación

Edge Function `reminders` diaria por `pg_cron`. Selecciona conversaciones con `first_reply_at IS NULL`, `reminder_sent_at IS NULL`, primera consulta con más de 48 h y aviso `active`. Marca `reminder_sent_at`. Respeta `notification_preferences.reminders`.

## Criterios de aceptación

- AC-1 (= AC-051-1): el recordatorio sale una sola vez por conversación.
- AC-2: si el aviso pasó a paused o filled, no sale.

---

*Detalle de NTF-004. Si cambia el trigger o el destinatario, se actualiza la tabla de inventario en notifications.md.*
