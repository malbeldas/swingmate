# Notification: Email code — SwingMate

> **Parte del set de notifications.** Ver overview en [notifications.md](./notifications.md).
>
> **Propósito.** Confirmar que el email es de quien se registra, con un código de 6 dígitos que se escribe en la misma pantalla.

---

## Identificación

- **ID:** NTF-001
- **Trigger:** registro con email y contraseña (UC-030, paso 3) o "Send again".
- **Destinatario:** el email que se registra.
- **Reglas referenciadas:** BR-ACC-002, SEC-08.

## Variables del template

| Variable | Origen | Ejemplo |
|---|---|---|
| `{{ .Token }}` | Supabase Auth | `482913` |

## Asunto

`Your SwingMate code: {{ .Token }}`

## From / Reply-To

Ver reglas transversales del overview.

## Contenido — versión texto

```
Hi,

Your SwingMate code is {{ .Token }}

Type it on the sign-up screen to confirm this is your email. It expires in 1 hour.

If you didn't try to sign up, you can ignore this email.

The SwingMate team
```

## Contenido — versión HTML

Logo arriba, el código en grande y con espacio entre dígitos, una línea de explicación y la línea de "ignore this email" en gris.

## Implementación

Plantilla "Confirm signup" de Supabase Auth en modo OTP, en `supabase/templates/email-code.html`. Envío por SMTP de Resend (`INT-002`).

## Criterios de aceptación

- AC-1: el email llega con el código en el asunto y en el cuerpo, y no incluye un link de confirmación.
- AC-2: un código vencido o usado se rechaza en la pantalla.

---

*Detalle de NTF-001. Si cambia el trigger o el destinatario, se actualiza la tabla de inventario en notifications.md.*
