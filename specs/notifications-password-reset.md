# Notification: Password reset — SwingMate

> **Parte del set de notifications.** Ver overview en [notifications.md](./notifications.md).
>
> **Propósito.** Permitir elegir una contraseña nueva a quien la olvidó.

---

## Identificación

- **ID:** NTF-002
- **Trigger:** "Forgot password?" (UC-031).
- **Destinatario:** el email escrito, solo si existe una cuenta con contraseña.
- **Reglas referenciadas:** UC-031, SEC-06, SEC-08.

## Variables del template

| Variable | Origen | Ejemplo |
|---|---|---|
| `{{ .ConfirmationURL }}` | Supabase Auth | `https://swingmate.au/account.html#reset…` |

## Asunto

`Reset your SwingMate password`

## From / Reply-To

Ver reglas transversales del overview.

## Contenido — versión texto

```
Hi,

Someone asked to reset the password for your SwingMate account.

Choose a new password: {{ .ConfirmationURL }}

This link works once and expires in 1 hour. If it wasn't you, ignore this email: your password stays the same.

The SwingMate team
```

## Contenido — versión HTML

Botón "Choose a new password" y el link en texto debajo.

## Implementación

Plantilla "Reset password" de Supabase Auth en `supabase/templates/password-reset.html`. Para cuentas solo con Google, Supabase no envía nada; la pantalla muestra siempre el mismo mensaje (`AC-031-1`).

## Criterios de aceptación

- AC-1: el link funciona una sola vez.
- AC-2: después de cambiar la contraseña se cierran las otras sesiones.

---

*Detalle de NTF-002. Si cambia el trigger o el destinatario, se actualiza la tabla de inventario en notifications.md.*
