# Notification: Alert digest — SwingMate

> **Parte del set de notifications.** Ver overview en [notifications.md](./notifications.md).
>
> **Propósito.** Avisar a quien busca cuando aparece un aviso que encaja, para no perderlo en un mercado con pocos avisos al principio.

---

## Identificación

- **ID:** NTF-007
- **Trigger:** corrida diaria a las 7:00 hora de Perth (UC-053), si hay al menos un aviso nuevo full o strong para alguna alerta del usuario.
- **Destinatario:** dueño de la alerta.
- **Reglas referenciadas:** BR-MAIL-004, BR-FIT-001, BR-FIT-002.

## Variables del template

| Variable | Origen | Ejemplo |
|---|---|---|
| `name` | `profiles.display_name` | Alex |
| `items[]` | Avisos nuevos con foto, título, suburbio, precio, etiqueta y línea de fit | Modern room in Baldivis · $320/week · Great roster fit |
| `alertLabel` | Ubicación + fechas o roster | Rockingham + 15 km · your 14:7 roster |
| `manageUrl` | `account.html#alerts` | — |

## Asunto

- Un aviso: `A home that fits: {{items[0].title}}`
- Varios: `{{n}} homes that fit your roster`

## From / Reply-To

Ver reglas transversales del overview.

## Contenido — versión texto

```
Hi {{name}},

New on SwingMate for {{alertLabel}}:

{{#items}}
{{title}}, {{suburb}} · ${{price}}/week · {{fitLabel}}
{{fitLine}}
{{url}}
{{/items}}

Manage your alerts: {{manageUrl}}
The SwingMate team
```

## Contenido — versión HTML

Hasta 5 cards con foto, una debajo de otra; si hay más, "See all N homes".

## Implementación

Edge Function `alerts` diaria. Para cada alerta vigente, evalúa los avisos publicados desde la última corrida con `core/fit.js` (la misma función de la búsqueda, `AC-053-1`), descarta los ya enviados (`alert_deliveries`), junta por usuario y envía uno solo.

## Criterios de aceptación

- AC-1 (= AC-006-1): varios avisos nuevos el mismo día generan un solo email.
- AC-2 (= AC-006-2): una alerta vencida o pausada no envía.
- AC-3: un aviso no se repite en dos emails de la misma alerta.

---

*Detalle de NTF-007. Si cambia el trigger o el destinatario, se actualiza la tabla de inventario en notifications.md.*
