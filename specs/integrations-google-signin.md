# Integration: Google sign-in — SwingMate

> **Parte del set de integrations.** Ver overview en [integrations.md](./integrations.md).
>
> **Propósito.** Registro e inicio de sesión de un toque, que la reunión del 6 Oct pidió para el momento de enviar el primer mensaje.

---

## Identificación

- **ID:** INT-001
- **Proveedor:** Google Identity (OAuth 2.0) a través de Supabase Auth.
- **Use cases:** UC-030.
- **Reglas:** BR-ACC-002, BR-ACC-006, SEC-05.

## Flujo

1. La web llama `signInWithOAuth({ provider: 'google', options: { redirectTo } })`, con `redirectTo` igual a la página actual.
2. Google pide permiso para nombre, email y foto (scopes `openid email profile`).
3. Supabase crea o vincula la cuenta por email (`BR-ACC-006`) y redirige.
4. La web completa el perfil mínimo si falta (`BR-ACC-003`). El nombre de Google viene precargado.

## Configuración

- Proyecto de Google Cloud a nombre de SwingMate con la pantalla de consentimiento "SwingMate", logo existente, links a Terms y Privacy.
- URIs de redirección: las de Supabase de producción y local.
- Mientras la app no esté verificada por Google, solo pueden entrar usuarios de prueba; la verificación tarda días. Se pide con tiempo antes del piloto.

## Errores

| Caso | Qué ve la persona |
|---|---|
| Canceló en Google | Vuelve a la misma pantalla sin cambios. |
| Google caído | "Google sign-in isn't working right now. Use your email instead." |

## Modo local

Supabase local sin Google: los E2E usan email y contraseña; el botón de Google se testea solo hasta la redirección.

## Criterios de aceptación

- AC-1: después del login con Google, la persona vuelve a la página y al borrador donde estaba.
- AC-2: un email ya registrado con contraseña entra a la misma cuenta.

---

*Detalle de INT-001. Si cambia el proveedor o los datos que recibe, se actualiza la tabla de inventario.*
