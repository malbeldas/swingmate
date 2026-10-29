# Integration: Captcha (Cloudflare Turnstile) — SwingMate

> **Parte del set de integrations.** Ver overview en [integrations.md](./integrations.md).
>
> **Propósito.** Frenar bots en el registro y en el envío de códigos sin que una persona tenga que resolver nada.

---

## Identificación

- **ID:** INT-004
- **Proveedor:** Cloudflare Turnstile, soportado por Supabase Auth junto con hCaptcha (supabase.com/docs/guides/auth/auth-captcha).
- **Use cases:** UC-030, UC-031, UC-021.
- **Reglas:** BR-TRU-007, SEC-14.

## Flujo

1. La página de registro carga el widget de Turnstile en modo invisible.
2. Al enviar, la web pasa `captchaToken` a `signUp`, `signInWithPassword`, `resetPasswordForEmail` y al pedido de SMS.
3. Supabase valida el token con el secreto.

Hay que confirmar al implementar qué métodos de Supabase aceptan `captchaToken`: la documentación muestra el ejemplo solo con `signUp`.

## Configuración

- Sitio en Turnstile a nombre de SwingMate, dominios `swingmate.au` y `malbeldas.github.io`.
- CSP: `script-src` y `frame-src` incluyen `https://challenges.cloudflare.com` (`security.md` SEC-22). Es el único script externo permitido.

## Errores

| Caso | Comportamiento |
|---|---|
| Turnstile no carga | Se reintenta una vez; si sigue, "Something blocked our security check. Disable blockers or try another browser." |
| Token inválido | Supabase rechaza; se pide reintentar. |

## Modo local

Captcha desactivado en `config.toml` local.

## Criterios de aceptación

- AC-1: con el captcha activado, un `signUp` sin token falla.

---

*Detalle de INT-004. Si cambia el proveedor o los datos que recibe, se actualiza la tabla de inventario.*
