# Notification: Calendar check — SwingMate

> **Parte del set de notifications.** Ver overview en [notifications.md](./notifications.md).
>
> **Propósito.** Evitar que un calendario viejo genere fits falsos (Reglas §24: no podemos prometer disponibilidad si el host no actualiza).

---

## Identificación

- **ID:** NTF-006
- **Trigger:** aviso `active` con `calendar_confirmed_at` de hace más de 30 días (UC-054). Se repite cada 30 días mientras no confirme.
- **Destinatario:** host.
- **Reglas referenciadas:** BR-AVL-006.

## Variables del template

| Variable | Origen | Ejemplo |
|---|---|---|
| `hostName` | `profiles.display_name` | Priya |
| `listingTitle` | `listings.title` | Room with pool in Scarborough |
| `nextFree` | `core/availability.js` | Free from 3 Nov, 12 nights in the next 4 weeks |
| `confirmUrl` | `calendar-confirm` con token | — |
| `editUrl` | `account.html#listings` | — |

## Asunto

`Is your calendar for {{listingTitle}} still right?`

## From / Reply-To

Ver reglas transversales del overview.

## Contenido — versión texto

```
Hi {{hostName}},

People search by dates on SwingMate, so an up-to-date calendar gets you better matches.

Right now {{listingTitle}} shows: {{nextFree}}.

Yes, it's up to date: {{confirmUrl}}
Update my calendar: {{editUrl}}

Manage email settings: {{settingsUrl}}
The SwingMate team
```

## Contenido — versión HTML

Mini calendario de 4 semanas como imagen-tabla en HTML (sin imágenes externas) y dos botones.

## Implementación

Edge Function `calendar-checks` diaria. Token JWT `{ listing_id, purpose: 'calendar' }`, 60 días. La confirmación actualiza `calendar_confirmed_at`.

## Criterios de aceptación

- AC-1 (= AC-054-1): confirmar desde el email actualiza la fecha sin login.
- AC-2: no sale para avisos paused, filled, hidden o removed.

---

*Detalle de NTF-006. Si cambia el trigger o el destinatario, se actualiza la tabla de inventario en notifications.md.*
