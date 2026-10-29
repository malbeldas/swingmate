# Notification: New message — SwingMate

> **Parte del set de notifications.** Ver overview en [notifications.md](./notifications.md).
>
> **Propósito.** Que quien recibe un mensaje vuelva a responder. Es el email más importante del producto: la reunión del 25 Sep marcó que el mayor riesgo del chat es que la gente no vuelva.

---

## Identificación

- **ID:** NTF-003
- **Trigger:** mensaje sin leer 10 minutos después de enviado (UC-050), con el límite de un email por conversación por hora.
- **Destinatario:** el otro participante de la conversación.
- **Reglas referenciadas:** BR-MAIL-001, BR-MAIL-005, BR-TRU-003.

## Variables del template

| Variable | Origen | Ejemplo |
|---|---|---|
| `recipientName` | `profiles.display_name` | Matt |
| `senderName` | `profiles.display_name` | Alex |
| `listingTitle` | `listings.title` | Modern room in Baldivis |
| `isInquiry` | primer mensaje de la conversación | true |
| `stayLabel` | `conversations.stay_from/to` | 12 – 19 Oct (7 nights) |
| `fitLine` | `core/fit.js` contra el calendario actual | Your room is free all 7 nights |
| `rosterSummary` | `conversations.roster_summary` | FIFO 14:7 |
| `messages` | Mensajes sin leer, hasta 3, cada uno hasta 300 caracteres | — |
| `conversationUrl` | `messages.html?c=<id>&src=email&ntf=NTF-003` | — |

## Asunto

- Primera consulta: `{{senderName}} wants to stay at {{listingTitle}}`
- Siguientes: `New message from {{senderName}}`

## From / Reply-To

Ver reglas transversales del overview. Responder al email **no** contesta en el chat: el pie lo dice.

## Contenido — versión texto

```
Hi {{recipientName}},

{{senderName}} sent you a message about {{listingTitle}}.

[Si es consulta]
Dates: {{stayLabel}}
{{fitLine}}
Roster: {{rosterSummary}}

"{{message 1}}"
[...]

Reply on SwingMate: {{conversationUrl}}

A quick reply, even a "sorry, not available", helps them keep looking.
Replying to this email won't reach {{senderName}}.

Manage email settings: {{settingsUrl}}
The SwingMate team
```

## Contenido — versión HTML

Bloque de la consulta con fechas y fit arriba (solo si es consulta), los mensajes en burbujas grises y el botón "Reply on SwingMate".

## Implementación

Edge Function `notify-messages` disparada cada 5 minutos por `pg_cron`. Busca mensajes con `emailed_at IS NULL`, sin leer por el destinatario y con más de 10 minutos; agrupa por conversación; respeta `notification_preferences.new_messages` salvo la primera consulta; envía por `send-email`; marca `emailed_at`.

## Criterios de aceptación

- AC-1 (= AC-050-1): tres mensajes en 5 minutos generan un solo email.
- AC-2 (= AC-050-2): un mensaje leído antes de los 10 minutos no genera email.
- AC-3: el email no agrega ningún dato privado de las cuentas (email, celular verificado, dirección del aviso). El texto del mensaje se muestra tal cual, recortado a 300 caracteres, aunque la persona haya escrito su contacto (`BR-MSG-004`).
- AC-4: con la notificación apagada, solo llega el email de una conversación nueva.

---

*Detalle de NTF-003. Si cambia el trigger o el destinatario, se actualiza la tabla de inventario en notifications.md.*
