# Notification: Outcome question — SwingMate

> **Parte del set de notifications.** Ver overview en [notifications.md](./notifications.md).
>
> **Propósito.** Medir si SwingMate generó un acuerdo real, que es la métrica de éxito del piloto (Web MVP §7), sin procesar la transacción.

---

## Identificación

- **ID:** NTF-005
- **Trigger:** 14 días desde la primera consulta de la conversación (UC-052).
- **Destinatario:** quien buscó.
- **Reglas referenciadas:** BR-MAIL-003.

## Variables del template

| Variable | Origen | Ejemplo |
|---|---|---|
| `seekerName` | `profiles.display_name` | Alex |
| `listingTitle` | `listings.title` | Modern room in Baldivis |
| `hostName` | `profiles.display_name` | Matt |
| `answerUrl(answer)` | `outcome.html?t=<token>&a=<answer>` | — |

## Asunto

`Did you find a place, {{seekerName}}?`

## From / Reply-To

Ver reglas transversales del overview. Este email sí invita a responder por email con comentarios (`Reply-To: support@swingmate.au`).

## Contenido — versión texto

```
Hi {{seekerName}},

Two weeks ago you messaged {{hostName}} about {{listingTitle}}. Did you find a place?

Yes, through SwingMate: {{answerUrl(found_here)}}
Yes, somewhere else: {{answerUrl(found_elsewhere)}}
Not yet: {{answerUrl(not_yet)}}

One tap is enough. It helps us make SwingMate better for people on rosters.
If you want to tell us more, just reply to this email.

The SwingMate team
```

## Contenido — versión HTML

Tres botones del mismo tamaño, uno por respuesta.

## Implementación

Edge Function `outcomes` diaria. Marca `conversations.outcome_asked_at` y crea el mensaje `system` con la pregunta en la conversación. El token es un JWT firmado con `{ conversation_id, purpose: 'outcome' }` y 60 días de vigencia; `outcome.html` lo manda a la Edge Function `outcome`, que guarda en `outcome_responses` (`P-25`).

## Criterios de aceptación

- AC-1 (= AC-007-1): responder desde el email no pide login.
- AC-2 (= AC-052-1): sale el día 14 y una sola vez por conversación.
- AC-3: un token de otra conversación o vencido no guarda nada.

---

*Detalle de NTF-005. Si cambia el trigger o el destinatario, se actualiza la tabla de inventario en notifications.md.*
