# Integration: SMS (Twilio) — SwingMate

> **Parte del set de integrations.** Ver overview en [integrations.md](./integrations.md).
>
> **Propósito.** Mandar el código para verificar el celular, obligatorio para que un host publique (D10, 18 Oct) y opcional para quien busca.

---

## Identificación

- **ID:** INT-003
- **Proveedor:** Twilio, a través del proveedor de SMS de Supabase Auth. Supabase también soporta MessageBird, Vonage y TextLocal (supabase.com/docs/guides/auth/phone-login).
- **Use cases:** UC-021.
- **Notificación:** NTF-008.
- **Reglas:** BR-LST-003, BR-TRU-004, SEC-09, T-07.

## Costo

Twilio cobra US$0,0515 por SMS a móviles de Australia (twilio.com/en-us/sms/pricing/au, consultado el 29 Oct 2026). Con reintentos, verificar un celular cuesta entre US$0,05 y US$0,15. Para 20 hosts del piloto son menos de US$5 en total. **Es el único costo variable del piloto**: lo tiene que aprobar Tomás (`decision-log.md` Q-03).

No se usa Twilio Verify (US$0,05 extra por verificación más el SMS): Supabase ya genera y valida el código.

## Flujo

1. La web llama `updateUser({ phone: '+614…' }, { captchaToken })`.
2. Supabase genera el código y lo manda por Twilio con remitente alfanumérico "SwingMate".
3. La web llama `verifyOtp({ phone, token, type: 'phone_change' })`.
4. `auth.users.phone_confirmed_at` queda con fecha.

## Configuración

- Cuenta de Twilio a nombre de SwingMate, con **límite de gasto** y alerta por email al llegar a US$10.
- Permisos geográficos de Twilio: solo Australia (corta el SMS pumping, T-07).
- Remitente alfanumérico "SwingMate". Si Australia exige registrarlo cuando salgamos del piloto, se registra.

## Errores y límites

| Caso | Comportamiento |
|---|---|
| Número no australiano | Lo rechaza la web antes de llamar (AC-2 de NTF-008). |
| Más de 5 códigos por número en el día | Se rechaza con "Try again tomorrow" (SEC-09). |
| Twilio caído | "We couldn't send the code. Try again in a few minutes." |

## Modo local

`[auth.sms.test_otp]` en `supabase/config.toml` con números de prueba y código fijo. Nunca se llama a Twilio desde CI.

## Criterios de aceptación

- AC-1: en CI ningún test usa credenciales de Twilio.
- AC-2: el límite diario por número funciona aunque se cambie de cuenta.

---

*Detalle de INT-003. Si cambia el proveedor o los datos que recibe, se actualiza la tabla de inventario.*
