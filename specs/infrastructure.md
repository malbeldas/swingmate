# Infrastructure — SwingMate

> **Propósito.** Define dónde corre SwingMate, qué ambientes hay, cómo se despliega, qué tareas programadas existen y cuánto cuesta.
>
> **Cómo se usa.** Se consulta antes de tocar configuración de Supabase, DNS, secretos, workflows o planes pagos. Cualquier costo nuevo pasa por §5.
>
> **Qué NO va en este documento.** El stack y las convenciones (`engineering-constitution.md`), los servicios externos en detalle (`integrations-*.md`) y la seguridad (`security.md`).

---

## Índice

1. Ambientes
2. Hosting de la web
3. Supabase
4. Tareas programadas
5. Costos
6. Deploy
7. Backups y recuperación
8. Fuera de scope

---

## 1. Ambientes

| Ambiente | Web | Base | Datos | Quién lo usa |
|---|---|---|---|---|
| Local | `npx serve` o `python3 -m http.server` en `localhost` | `supabase start` (Docker) | `seed.sql` con datos "Sample" | Quien desarrolla y CI |
| CI | El mismo que local, dentro de GitHub Actions | `supabase start` | `seed.sql` | Tests |
| Producción | GitHub Pages: `malbeldas.github.io/swingmate`, después `swingmate.au` | Proyecto `swingmate-prod`, región Sídney | Solo reales (`BR-TRU-006`) | Usuarios del piloto |

No hay staging en el piloto: el plan gratuito permite dos proyectos y GitHub Pages publica un solo sitio por repo. Se agrega si aparece la necesidad de probar con datos reales sin usuarios.

`app/config.js` elige la base por el host: `localhost` usa la local y cualquier otro host usa producción.

## 2. Hosting de la web

- GitHub Pages desde `main`, carpeta raíz, con `.nojekyll`.
- Dominio: `swingmate.au` con un archivo `CNAME` en el repo cuando Tomás cargue el DNS (`decision-log.md` Q-04). HTTPS forzado.
- Sin headers propios: la seguridad de la web va por meta CSP (`security.md` SEC-22).

## 3. Supabase

| Tema | Configuración |
|---|---|
| Proyecto | `swingmate-prod`, región `ap-southeast-2` (Sídney), organización a nombre de SwingMate (`decision-log.md` Q-05) |
| Auth | Email con confirmación por código (OTP); Google; teléfono con Twilio; captcha Turnstile; redirecciones permitidas de `SEC-05` |
| SMTP | Resend (`INT-002`) |
| Storage | Buckets `listing-photos` y `avatars` (`schema.md` §11) |
| Extensiones | `pg_cron`, `pg_net`, `pgtap` (solo local y CI) |
| Edge Functions | `send-email`, `notify-messages`, `reminders`, `outcomes`, `outcome`, `calendar-checks`, `calendar-confirm`, `alerts`, `admin-grant`, `admin-action`, `delete-account`, `export-data`, `cleanup` |
| Secretos | `security.md` SEC-26 |

**Plan gratuito** (supabase.com/pricing, consultado el 29 Oct 2026): 50.000 usuarios activos por mes, 500 MB de base, 1 GB de archivos, 5 GB de transferencia, 500.000 invocaciones de funciones y 2 millones de mensajes de tiempo real. Pausa el proyecto tras 1 semana sin actividad y no incluye backups.

**Cuánto alcanza:** las fotos son lo primero que se llena. Con avisos de 6 fotos de unos 300 KB, 1 GB alcanza para unos 500 avisos. Para el piloto sobra.

## 4. Tareas programadas

| Tarea | Frecuencia (hora de Perth) | Qué hace | Ref. |
|---|---|---|---|
| `notify-messages` | Cada 5 min | Emails de mensajes sin leer | UC-050 |
| `reminders` | Diaria 9:00 | Recordatorio a hosts sin respuesta | UC-051 |
| `outcomes` | Diaria 10:00 | Pregunta de resultado | UC-052 |
| `alerts` | Diaria 7:00 | Alertas | UC-053 |
| `calendar-checks` | Diaria 8:00 | Pedido de confirmar calendario | UC-054 |
| `cleanup` | Diaria 3:00 | Borra excepciones pasadas, avisos `removed` de más de 90 días y sus fotos; anonimiza reportes de más de 2 años | BR-PRV-003 |
| `keepalive.yml` | Diaria (GitHub Actions) | Consulta liviana para que el plan gratuito no pause el proyecto | §7 |

## 5. Costos

| Servicio | Plan | Costo mensual en el piloto | Cuándo cambia |
|---|---|---|---|
| GitHub (repo público, Pages, Actions) | Gratis | 0 | — |
| Supabase | Gratis en desarrollo | 0 | Pro US$25/mes desde el 6 Dic si se aprueba `decision-log.md` Q-06 |
| Resend | Gratis (3.000/mes, 100/día) | 0 | Plan pago US$20/mes con más de unos 30 usuarios activos por día |
| Twilio | Pago por uso | Menos de US$5 en todo el piloto | Con cada host o persona que verifica su celular (Q-03) |
| Cloudflare Turnstile | Gratis | 0 | — |
| OpenStreetMap | Gratis | 0 | Si el uso crece (`INT-005`) |
| Dominio `swingmate.au` | Ya pagado por Tomás | — | Renovación |
| **Total** | | **US$0 a 5** en desarrollo; **US$25 a 30** desde el piloto si se aprueba Pro | |

Regla: ningún servicio pago nuevo sin decisión de Maxi y Tomás (`engineering-constitution.md` regla hard 1).

## 6. Deploy

| Qué | Cómo | Quién |
|---|---|---|
| Web | Merge a `main`; GitHub Pages publica solo | Maxi (merge) |
| Migraciones | Workflow manual `deploy-db.yml`: `supabase db push` contra producción, con confirmación | Maxi |
| Edge Functions | El mismo workflow: `supabase functions deploy` | Maxi |
| Configuración de Auth y plantillas | `supabase config push` desde el mismo workflow | Maxi |

Antes de cada deploy de base: CI verde en `main` y, en Pro, un backup de menos de 24 h.

## 7. Backups y recuperación

- **Plan gratuito:** no hay backups. Mitigación mientras no haya usuarios reales: la base se puede reconstruir con las migraciones y no hay datos que perder.
- **Desde el piloto:** se recomienda Pro con backups diarios por 7 días (`decision-log.md` Q-06). Restaurar es desde el panel de Supabase.
- **Fotos:** Storage no entra en los backups de la base. En el piloto se acepta el riesgo; los hosts tienen sus fotos originales.

## 8. Fuera de scope

- Staging con datos reales.
- Multi-región, SLA o alta disponibilidad propia.
- CDN propio para fotos (Supabase ya sirve con caché).

---

*Documento vivo. Cada servicio, tarea o costo nuevo se agrega a su tabla antes de configurarlo.*
