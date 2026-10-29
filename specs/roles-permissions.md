# Roles & permissions — SwingMate

> **Propósito.** Define quién puede hacer qué sobre cada dato, y cómo se implementa con RLS de Postgres y el rol admin de Supabase Auth.
>
> **Cómo se usa.** Cada política RLS de `supabase/migrations/` implementa una fila de la matriz de §3, y tiene un test pgTAP con el mismo ID de fila (`P-xx`). Si una pantalla necesita un permiso que no está acá, se agrega primero acá.
>
> **Qué NO va en este documento.** Las amenazas y mitigaciones generales (`security.md`), las tablas (`schema.md`) y las reglas de negocio que justifican cada permiso (`business-rules.md`, citadas en la matriz).

---

## Índice

1. Roles
2. Cómo viaja el rol
3. Matriz de permisos
4. Funciones con permisos elevados
5. Fuera de scope

---

## 1. Roles

| Rol | Quién | Cómo se reconoce |
|---|---|---|
| `anon` | Visitante sin sesión | Sin JWT de usuario (solo anon key). |
| `user` | Cualquier persona con sesión | `auth.uid()` no nulo. |
| `owner` | El dueño de una fila (su perfil, su aviso, su alerta) | `auth.uid() = owner_id` / `user_id` / `id`. No es un rol guardado: es una condición por fila. |
| `participant` | Quien busca o el host de una conversación | `auth.uid() IN (seeker_id, host_id)`. |
| `admin` | Equipo de moderación (Maxi y Tomás en el piloto) | `auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'`. |
| `service` | Edge Functions | `service_role`; ignora RLS. Solo en el servidor. |

Un usuario suspendido (`profiles.status = 'suspended'`) mantiene el rol `user` para leer, pero las políticas de escritura lo excluyen (`BR-MSG-006`).

## 2. Cómo viaja el rol

- El rol admin vive en `app_metadata`, que el usuario **no** puede modificar desde el navegador.
- Solo la Edge Function `admin-grant` (llamada por un admin) lo asigna o lo quita, y escribe `grant_admin` / `revoke_admin` en `moderation_actions` (`BR-ADM-004`).
- La función SQL `is_admin()` lee el claim del JWT. Si se le quita el rol a alguien, el cambio aplica cuando su token se renueva (como máximo 1 hora); para un retiro urgente se cierra su sesión desde el panel de Supabase.

## 3. Matriz de permisos

Leyenda: ✅ permitido · ❌ no permitido · *(cond.)* permitido con la condición indicada.

| ID | Tabla / recurso | Acción | anon | user | owner | participant | admin | Regla |
|---|---|---|---|---|---|---|---|---|
| P-01 | `suburbs` | leer | ✅ | ✅ | — | — | ✅ | — |
| P-02 | `profiles` | leer fila completa | ❌ | ❌ | ✅ | ❌ | ✅ | BR-TRU-003 |
| P-03 | `profiles` | leer datos públicos de otro | Solo vía `get_listing` / `inquirer_card` | ← | — | ✅ (vía RPC) | ✅ | BR-TRU-001/002 |
| P-04 | `profiles` | crear / editar | ❌ | ❌ | ✅ salvo `status`, `listing_limit` | — | ✅ | BR-ACC-004 |
| P-05 | `rosters` | leer / escribir | ❌ | ❌ | ✅ | ❌ | ❌ | BR-ROS-001 |
| P-06 | `listings` | leer activos de otros | Solo vía `search_listings` / `get_listing` | ← | — | — | ✅ | BR-LST-002 |
| P-07 | `listings` | crear | ❌ | ✅ *(perfil listo, no suspendido)* | — | — | ✅ | BR-LST-003 |
| P-08 | `listings` | editar / pausar / filled / remove | ❌ | ❌ | ✅ *(si no está `hidden`)* | — | ✅ | BR-LST-002 |
| P-09 | `listings` | pasar a `active` | ❌ | ❌ | Solo vía `publish_listing` | — | ✅ | BR-LST-003 |
| P-10 | `listings` | pasar a `hidden` | ❌ | ❌ | ❌ | — | ✅ con nota | BR-ADM-001 |
| P-11 | `listing_private` | leer / escribir | ❌ | ❌ | ✅ | ❌ | ❌ | BR-TRU-003 |
| P-12 | `listing_photos`, ranges, exceptions | escribir | ❌ | ❌ | ✅ | — | ✅ | BR-AVL-003 |
| P-13 | `saved_listings`, `search_alerts`, `notification_preferences` | leer / escribir | ❌ | ❌ | ✅ | — | ❌ | UC-005/006 |
| P-14 | `conversations` | leer | ❌ | ❌ | — | ✅ | ✅ *(con reporte abierto)* | BR-ADM-002 |
| P-15 | `conversations` | crear | ❌ | Solo vía `start_conversation` | — | — | ❌ | BR-MSG-001 |
| P-16 | `conversations` | marcar leído | ❌ | ❌ | — | ✅ *(solo su `*_read_at`)* | ❌ | UC-033 |
| P-17 | `messages` | leer | ❌ | ❌ | — | ✅ | ✅ *(con reporte abierto, queda registro)* | BR-ADM-002 |
| P-18 | `messages` | crear | ❌ | ❌ | — | ✅ *(no suspendido, no bloqueado)* | ❌ | BR-MSG-006 |
| P-19 | `messages` | editar / borrar | ❌ | ❌ | ❌ | ❌ | ❌ | — |
| P-20 | `blocks` | leer / crear / borrar | ❌ | ❌ | ✅ *(como `blocker_id`)* | — | ✅ leer | BR-TRU-005 |
| P-21 | `reports` | crear | ❌ | ✅ | — | — | — | BR-TRU-005 |
| P-22 | `reports` | leer / cerrar | ❌ | ❌ | ❌ *(el que reporta no los ve)* | — | ✅ | BR-ADM-001 |
| P-23 | `moderation_actions` | crear | ❌ | ❌ | ❌ | — | ✅ | BR-ADM-001 |
| P-24 | `moderation_actions` | editar / borrar | ❌ | ❌ | ❌ | — | ❌ | BR-ADM-001 |
| P-25 | `outcome_responses` | crear / editar | ❌ *(sí con token del email, vía Edge Function)* | ❌ | — | ✅ *(solo quien buscó)* | ❌ | BR-MAIL-003 |
| P-26 | `analytics_events` | crear | ✅ | ✅ | — | — | — | BR-ANL-001 |
| P-27 | `analytics_events` | leer | ❌ | ❌ | ❌ | — | ✅ | BR-ANL-002 |
| P-28 | `notification_log` | leer | ❌ | ❌ | ❌ | — | ✅ | — |
| P-29 | Storage `listing-photos` | subir / borrar | ❌ | ❌ | ✅ *(carpeta de su aviso)* | — | ✅ | BR-PRV-002 |
| P-30 | Storage `avatars` | subir / borrar | ❌ | ❌ | ✅ *(su carpeta)* | — | ✅ | — |

## 4. Funciones con permisos elevados

Son `security definer` porque leen datos que el usuario no puede leer directo. Cada una valida el caso de uso antes de devolver nada.

| Función | Quién la llama | Qué valida | Qué nunca devuelve |
|---|---|---|---|
| `search_listings` | anon, user | Nada; solo devuelve avisos `active` | `listing_private`, email, teléfono, roster crudo del host |
| `get_listing` | anon, user | Aviso visible según `BR-LST-002`; el dueño ve también su borrador | Lo mismo |
| `start_conversation` | user | `BR-ACC-003`, `BR-MSG-001/002/006/007`, `BR-TRU-004`, `BR-LST-008` | — |
| `inquirer_card` | user | Que sea el host de esa conversación | Email, teléfono |
| `publish_listing` | owner | `BR-LST-001/003/007` | — |
| Edge `admin-*` | admin | `is_admin()` y nota no vacía | — |
| Edge `outcome` | anon con token | Token firmado, vigente 60 días, de esa conversación | — |
| Edge `calendar-confirm` | anon con token | Token firmado del host y aviso | — |
| Edge `delete-account`, `export-data` | owner | Sesión vigente y reautenticación reciente (5 min) | Datos de otras personas |

## 5. Fuera de scope

- Roles intermedios (moderador de solo lectura, soporte).
- Cuentas de empresa, agencias o property managers con varios usuarios.
- Permisos por estado o región para admins.

---

*Documento vivo. Cada fila nueva de la matriz lleva su ID `P-xx` y su test pgTAP.*
