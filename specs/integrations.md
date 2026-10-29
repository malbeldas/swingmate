# Integrations — SwingMate

> **Propósito.** Lista los servicios externos con los que habla SwingMate, qué datos les pasa y qué pasa si fallan.
>
> **Cómo se usa.** Este archivo es el overview. Cada integración tiene su archivo de detalle: ver la tabla de inventario.
>
> **Qué NO va en este documento.** Supabase, que es la plataforma y no una integración (`engineering-constitution.md` §2, `infrastructure.md`); los textos de los mensajes (`notifications-*.md`); los costos totales (`infrastructure.md` §5).

---

## Inventario

| ID | Sistema | Para qué | Datos que recibe | Costo en el piloto | Archivo de detalle |
|---|---|---|---|---|---|
| INT-001 | Google (OAuth) | "Continue with Google" | Nada nuestro; nos devuelve nombre, email y foto | Gratis | [integrations-google-signin.md](./integrations-google-signin.md) |
| INT-002 | Resend | Enviar emails (auth y producto) | Email de destino y contenido | Gratis hasta 3.000/mes y 100/día | [integrations-email.md](./integrations-email.md) |
| INT-003 | Twilio | SMS con código para verificar el celular | Número y código | Unos US$0,05 por SMS a Australia | [integrations-sms.md](./integrations-sms.md) |
| INT-004 | Cloudflare Turnstile | Captcha invisible | Señales del navegador | Gratis | [integrations-captcha.md](./integrations-captcha.md) |
| INT-005 | OpenStreetMap + Leaflet | Mapa de zona aproximada | Coordenadas del círculo (ya desplazado) en la URL de los tiles | Gratis | [integrations-map.md](./integrations-map.md) |
| INT-006 | ABS, Suburbs and Localities | Lista de suburbios de Australia con su centro | Nada (importación única) | Gratis | [integrations-suburbs.md](./integrations-suburbs.md) |

## Reglas transversales

1. **Ningún servicio externo recibe más datos de los necesarios.** En particular, ninguno recibe la dirección exacta de un aviso (`BR-TRU-003`).
2. **Las claves viven en secretos** de Supabase o GitHub, nunca en el repo (`SEC-26`). Las claves públicas (site key de Turnstile) van en `app/config.js`.
3. **Cada integración tiene un modo local.** CI y los tests nunca llaman al servicio real (`engineering-constitution.md` §7).
4. **Un servicio caído no rompe la búsqueda.** Si falla el mapa, el detalle muestra el suburbio en texto. Si falla el email, se reintenta (`notifications.md` regla 6). Si falla el SMS, se explica y se puede reintentar más tarde.
5. **Cuentas de servicio a nombre de SwingMate**, con un email del dominio (`admin@swingmate.au`) y 2FA, no las cuentas personales de Maxi o Tomás (`decision-log.md` Q-05).
6. **Responsable de mantenimiento:** Maxi, con Claude Code. Si un proveedor cambia su API, se abre un issue con la etiqueta `integración`.

## Configuración compartida

| Variable | Dónde | Usada por |
|---|---|---|
| `RESEND_API_KEY` | Secretos de Supabase | INT-002 |
| `SMTP_*` | Configuración de Auth en Supabase | INT-002 |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGE_SERVICE_SID` | Configuración de Auth en Supabase | INT-003 |
| `TURNSTILE_SECRET` | Configuración de Auth en Supabase | INT-004 |
| `TURNSTILE_SITE_KEY` | `app/config.js` (público) | INT-004 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Configuración de Auth en Supabase | INT-001 |
| `EMAIL_TOKEN_SECRET` | Secretos de Supabase | Tokens de NTF-005 y NTF-006 |

## Items descartados (fase 2)

- Verificación de identidad (greenID, FrankieOne, Stripe Identity): fuera de v0.1 (`business-rules.md` §14).
- Geocodificación de direcciones con un servicio externo: el host marca el punto en el mapa del suburbio, así la dirección no sale a terceros.
- Analytics de terceros (GA4, PostHog): se usa una tabla propia (`decision-log.md` DEC-105).
- Monitoreo de errores de terceros (Sentry): se usa la misma tabla (`observability.md` §4).

---

*Documento vivo. Cuando se suma una integración, se agrega a la tabla de inventario y se crea su archivo de detalle.*
