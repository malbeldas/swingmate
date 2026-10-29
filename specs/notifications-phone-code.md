# Notification: Phone code — SwingMate

> **Parte del set de notifications.** Ver overview en [notifications.md](./notifications.md).
>
> **Propósito.** Verificar el celular del host para publicar, y de quien busca cuando un host lo pide.

---

## Identificación

- **ID:** NTF-008
- **Trigger:** "Send code" en UC-021.
- **Destinatario:** el celular australiano escrito.
- **Reglas referenciadas:** BR-LST-003, BR-TRU-004, SEC-09, SEC-14, T-07.

## Variables del template

| Variable | Origen | Ejemplo |
|---|---|---|
| `{{ .Code }}` | Supabase Auth | `482913` |

## Asunto

No aplica (SMS).

## From / Reply-To

Remitente alfanumérico `SwingMate` (`INT-003`). No acepta respuestas.

## Contenido — versión texto

```
{{ .Code }} is your SwingMate code. It expires in 10 minutes. Never share it with anyone.
```

Un solo segmento SMS (menos de 160 caracteres GSM).

## Contenido — versión HTML

No aplica.

## Implementación

Supabase Auth, proveedor Twilio, plantilla de SMS en `supabase/config.toml`. En local y CI se usan números de prueba con código fijo (`[auth.sms.test_otp]`).

## Criterios de aceptación

- AC-1: el SMS tiene un solo segmento.
- AC-2: un número no australiano se rechaza antes de llamar al proveedor.

---

*Detalle de NTF-008. Si cambia el trigger o el destinatario, se actualiza la tabla de inventario en notifications.md.*
