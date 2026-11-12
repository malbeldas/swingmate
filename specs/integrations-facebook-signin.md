# Integration: Facebook sign-in — SwingMate

> **Parte del set de integrations.** Ver overview en [integrations.md](./integrations.md).
>
> **Propósito.** Registro e inicio de sesión con Facebook, para probar en UAT si quienes llegan desde los grupos de Facebook lo prefieren. Si sale a producción se decide en `decision-log.md` Q-28.

---

## Identificación

- **ID:** INT-007
- **Proveedor:** Facebook Login (Meta, OAuth 2.0) a través de Supabase Auth.
- **Use cases:** UC-030, UC-035 (confirmar identidad).
- **Reglas:** BR-ACC-002, BR-ACC-006, SEC-05.

## Flujo

Igual que Google (`INT-001`):

1. La web llama `signInWithOAuth({ provider: 'facebook', options: { redirectTo } })`, con `redirectTo` igual a la página actual.
2. Facebook pide permiso para nombre, email y foto (`public_profile`, `email`).
3. Supabase crea o vincula la cuenta por email (`BR-ACC-006`) y redirige.
4. La web completa el perfil mínimo si falta (`BR-ACC-003`).

## Configuración

- App de Meta (developers.facebook.com) del tipo "Autenticar y solicitar datos de usuarios con Facebook Login". URI de redirección: la de Supabase (`https://<ref>.supabase.co/auth/v1/callback`).
- En modo desarrollo solo entran las personas con un rol en la app (administradores, desarrolladores o testers). Alcanza para UAT.
- Para pasar a modo activo, Meta pide URL de Privacy, URL o instrucciones de borrado de datos y un ícono. Esos textos esperan a `Q-01`.
- El botón se muestra solo si `facebook` está en `providers` de `app/config.js`.

## Errores

| Caso | Qué ve la persona |
|---|---|
| Canceló en Facebook | Vuelve a la misma pantalla sin cambios. |
| Facebook caído | "Facebook sign-in isn't working right now. Use your email instead." |
| La cuenta de Facebook no tiene email | Supabase no crea la cuenta y la persona vuelve con un error; puede usar Google o email. |

## Modo local

Supabase local sin Facebook y `providers` local sin `facebook`. El E2E prende el botón cambiando la configuración y lo testea solo hasta la redirección.

## Criterios de aceptación

- AC-1: con `facebook` en la configuración, el registro y el login muestran el botón, y después del login la persona vuelve a la página donde estaba.
- AC-2: sin `facebook` en la configuración, no hay botón de Facebook.
- AC-3: `signup_completed` registra `method` `facebook`.

---

*Detalle de INT-007. Si cambia el proveedor o los datos que recibe, se actualiza la tabla de inventario.*
