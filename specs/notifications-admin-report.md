# Notification: Admin report — SwingMate

> **Parte del set de notifications.** Ver overview en [notifications.md](./notifications.md).
>
> **Propósito.** Que un admin se entere de un reporte en el momento y pueda cumplir las 24 h de `BR-ADM-003`.

---

## Identificación

- **ID:** NTF-009
- **Trigger:** se crea un reporte (UC-034).
- **Destinatario:** todos los admins.
- **Reglas referenciadas:** BR-ADM-003, BR-TRU-005.

## Variables del template

| Variable | Origen | Ejemplo |
|---|---|---|
| `reason` | `reports.reason` | Scam or asking for money |
| `targetType` | `reports.target_type` | listing |
| `targetLabel` | Título del aviso o nombre visible | Modern room in Baldivis |
| `openReports` | Reportes abiertos en total | 3 |
| `adminUrl` | `admin.html#report=<id>` | — |

## Asunto

`[SwingMate] New report: {{reason}}`

## From / Reply-To

Ver reglas transversales del overview.

## Contenido — versión texto

```
New report about a {{targetType}}: {{targetLabel}}
Reason: {{reason}}
Open reports: {{openReports}}

Review it: {{adminUrl}}
```

No incluye el detalle escrito por quien reporta ni datos de las personas: se leen en el panel.

## Contenido — versión HTML

El mismo texto con un botón.

## Implementación

Trigger `after insert` en `reports` que llama a la Edge Function `send-email` vía `pg_net`.

## Criterios de aceptación

- AC-1: cada reporte genera un email por admin en menos de 2 minutos.
- AC-2: el email no contiene el texto del reporte ni emails o teléfonos.

---

*Detalle de NTF-009. Si cambia el trigger o el destinatario, se actualiza la tabla de inventario en notifications.md.*
