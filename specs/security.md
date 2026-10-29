# Security — SwingMate

> **Propósito.** Define contra qué nos protegemos, cómo, y qué datos personales maneja SwingMate y bajo qué reglas.
>
> **Cómo se usa.** Cada issue que toca login, datos personales, fotos, mensajes o permisos revisa este documento en la fase LEARN. Las medidas con ID (`SEC-xx`) se citan en los PRs y tienen test cuando es posible.
>
> **Qué NO va en este documento.** La matriz de permisos por tabla (`roles-permissions.md`), las reglas de negocio de confianza (`business-rules.md` §9 y §12) y la configuración de los proveedores (`integrations-*.md`).
>
> **Contexto legal.** SwingMate opera en Australia. Aplica el Privacy Act 1988 y sus Australian Privacy Principles (APPs) cuando corresponda, la Australian Consumer Law en la publicidad, y la Equal Opportunity Act 1984 de WA en lo que se publica sobre quién puede vivir en una casa. **Nada de esto está validado todavía por un abogado** (`decision-log.md` Q-01).

---

## Índice

1. Qué protegemos
2. Modelo de amenazas
3. Autenticación y sesión
4. Autorización
5. Límites y antiabuso
6. Fotos y archivos
7. Datos personales
8. Web: headers, XSS y dependencias
9. Secretos
10. Respuesta a incidentes
11. Fuera de scope

---

## 1. Qué protegemos

| Activo | Por qué importa |
|---|---|
| Dirección exacta y ubicación de la casa | Junto con el calendario, revela cuándo está vacía o quién vive ahí. |
| Email y teléfono | Contacto no deseado y estafas fuera de la plataforma. |
| Mensajes privados | Conversaciones entre dos personas sobre su casa y su trabajo. |
| Cuentas | Una cuenta tomada puede estafar a otros en nombre de alguien real. |
| Confianza en el inventario | Un solo aviso falso descubierto daña la marca (reunión del 25 Sep). |

## 2. Modelo de amenazas

| ID | Amenaza | Ejemplo | Mitigación |
|---|---|---|---|
| T-01 | Estafa de alquiler | Aviso con fotos robadas que pide un depósito antes de ver el lugar. La investigación del 18 Oct la documenta en Facebook Marketplace. | Celular verificado para publicar (`BR-LST-003`), declaración de veracidad, aviso automático de riesgo (`BR-MSG-008`), "Before you agree" (`BR-TRU-008`), reportes con respuesta en 24 h. |
| T-02 | Bots y spam de mensajes | Cuenta nueva que escribe a todos los hosts. | Captcha invisible y emails descartables bloqueados (`BR-TRU-007`), límite de 10 conversaciones por día para cuentas nuevas (`BR-MSG-007`), email verificado obligatorio. |
| T-03 | Exponer la dirección | La web devuelve la dirección dentro del JSON del aviso, o una foto lleva GPS. | Tabla `listing_private` solo para el dueño (`P-11`), círculo desplazado (`BR-LST-004`), EXIF borrado (`BR-PRV-002`), test de red `AC-003-1`. |
| T-04 | Patrón de ausencia | Alguien cruza el calendario con la ubicación para saber cuándo la casa está vacía. | Sin dirección pública ni ubicación exacta, el calendario solo dice cuándo se puede ocupar la habitación, no cuándo la casa está vacía. Se documenta como riesgo residual aceptado. |
| T-05 | Acceso a datos de otro (IDOR) | Pedir `messages?conversation_id=<ajena>`. | RLS en todas las tablas (`engineering-constitution.md` §5), tests pgTAP por política (`roles-permissions.md`). |
| T-06 | Toma de cuenta | Contraseña reutilizada. | Mínimo 8 caracteres, límites de intentos de Supabase Auth, cierre de otras sesiones al resetear (UC-031), reautenticación para baja y exportación. |
| T-07 | SMS pumping | Bots piden códigos a números premium para generar costo. | Solo números móviles australianos (`+614…`), captcha antes de enviar, 1 código cada 60 s, máximo 5 por número por día, alerta de gasto en el proveedor (`integrations-sms.md`). |
| T-08 | XSS | Un título o mensaje con `<script>`. | Todo texto de usuario por `esc()` o `textContent`; CSP sin `unsafe-inline` para scripts (§8). |
| T-09 | Acoso o discriminación | Mensajes ofensivos; reglas de la casa que excluyen por origen. | Bloquear y reportar (`BR-TRU-005`), chequeo de términos discriminatorios en reglas (`BR-LST-005`), sin filtros por género, edad u origen. |
| T-10 | Abuso de admin | Un admin lee conversaciones por curiosidad. | Solo con reporte abierto y con registro inmutable (`BR-ADM-002`, `P-24`). |

## 3. Autenticación y sesión

- **SEC-01:** login con Supabase Auth: Google (OAuth) o email + contraseña con código de 6 dígitos por email (`BR-ACC-002`). Mientras el email no esté confirmado, las políticas de escritura de mensajes y avisos lo rechazan.
- **SEC-02:** la sesión es el JWT de Supabase con renovación automática. supabase-js la guarda en `localStorage` del dominio; es un token, no un dato personal, y se acepta como riesgo conocido (un XSS podría leerlo, por eso T-08 es crítica).
- **SEC-03:** duración del access token: 1 hora. Refresh token con rotación activada.
- **SEC-04:** celular: verificación con `updateUser({ phone })` + `verifyOtp({ type: 'phone_change' })`. El número queda en `auth.users.phone` y nunca se expone (`BR-TRU-003`).
- **SEC-05:** las URLs de redirección permitidas en Supabase Auth son solo `https://swingmate.au/*`, `https://malbeldas.github.io/swingmate/*` y `http://localhost:*`.

## 4. Autorización

- Matriz completa en `roles-permissions.md`.
- **SEC-06:** toda función `security definer` valida `auth.uid()` y el caso de uso antes de leer, y fija `search_path`.
- **SEC-07:** la web nunca decide permisos; ocultar un botón es solo UX.

## 5. Límites y antiabuso

| ID | Qué | Límite | Dónde |
|---|---|---|---|
| SEC-08 | Emails de código y reseteo | Los de Supabase Auth, más 1 por minuto por email | Configuración de Auth |
| SEC-09 | Códigos SMS | 1 cada 60 s, 5 por número por día | Auth + Edge Function de control |
| SEC-10 | Conversaciones nuevas | 10 por día para cuentas de menos de 7 días | `start_conversation` (`BR-MSG-007`) |
| SEC-11 | Mensajes | 60 por hora por usuario | Trigger `messages_before_insert` |
| SEC-12 | Reportes | 20 por día por usuario | Trigger en `reports` |
| SEC-13 | Eventos de analytics | `props` de hasta 2 KB; nombres de una lista cerrada | CHECK en `analytics_events` |
| SEC-14 | Captcha invisible | En registro, login con email y envío de SMS | `INT-004` |

## 6. Fotos y archivos

- **SEC-15:** solo JPEG y WebP, hasta 5 MB, hasta 12 por aviso.
- **SEC-16:** el navegador re-codifica cada foto con `<canvas>` antes de subirla, lo que elimina EXIF y GPS (`BR-PRV-002`), y la reduce a 1.600 px de lado mayor.
- **SEC-17:** las políticas de Storage validan que la carpeta sea un aviso del usuario y el tipo MIME.
- **SEC-18:** los nombres de archivo son uuid generados; nunca el nombre original.

## 7. Datos personales

| Dato | Para qué | Quién lo ve | Retención |
|---|---|---|---|
| Email | Login y avisos por email | Solo la persona y admins | Hasta la baja |
| Celular | Verificación | Nadie más (ni admins en la interfaz) | Hasta la baja |
| Nombre, foto, bio, suburbio base, tipo de trabajo, roster | Confianza y fit | Hosts a los que escribe, y quien vea sus avisos (solo nombre y foto) | Hasta la baja |
| Dirección del aviso | Calcular la zona y que el host la tenga a mano | Solo el host | Hasta borrar el aviso (+90 días si fue `removed`) |
| Mensajes | La conversación | Participantes; admins con reporte abierto | Hasta la baja de ambos participantes |
| Reportes y moderación | Seguridad | Admins | 2 años, después anonimizados (`BR-PRV-003`) |
| Eventos de analytics | Medir el funnel | Admins | 24 meses, sin datos personales (`BR-ANL-002`) |

- **SEC-19:** datos alojados en Sídney (`BR-PRV-001`). Los proveedores de email (Resend) y SMS (Twilio) reciben solo el email o el número y el contenido de esa notificación; van en la Privacy Policy como terceros.
- **SEC-20:** la Privacy Policy y los Términos son requisito para abrir el registro a usuarios reales. Los redacta o revisa el abogado (`decision-log.md` Q-01).
- **SEC-21:** "Download my data" y "Delete my account" existen desde el piloto (UC-035), lo pidan o no las APPs para nuestro tamaño.

## 8. Web: headers, XSS y dependencias

- **SEC-22:** GitHub Pages no permite headers propios, así que cada página lleva una CSP por `<meta http-equiv>`: `default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self'; img-src 'self' data: https://*.supabase.co https://tile.openstreetmap.org; connect-src 'self' https://*.supabase.co wss://*.supabase.co; font-src 'self'; frame-src https://challenges.cloudflare.com; base-uri 'self'; form-action 'self'`.
- **SEC-23:** sin `innerHTML` con datos de usuario; sin `eval`; sin handlers inline.
- **SEC-24:** las dependencias del navegador están vendorizadas con versión exacta y su hash anotado en `vendor/README.md`. Se actualizan con un PR propio.

## 9. Secretos

- **SEC-25:** la anon key y la URL de Supabase son públicas por diseño y van en `app/config.js`.
- **SEC-26:** `service_role`, las API keys de Resend y Twilio, el secreto de Turnstile y la clave para firmar tokens de email viven solo en los secretos de Supabase (Edge Functions) y de GitHub Actions. Nunca en el repo.
- **SEC-27:** GitHub secret scanning y push protection activados en el repo.

## 10. Respuesta a incidentes

1. Quien detecta un incidente (fuga de datos, cuenta tomada, aviso fraudulento con víctimas) avisa a Maxi y Tomás en el momento.
2. Se contiene: ocultar avisos, suspender cuentas, rotar claves.
3. Se evalúa con el abogado si corresponde notificar bajo el Notifiable Data Breaches scheme.
4. Se escribe una nota en `decision-log.md` con lo que pasó y qué cambia.

## 11. Fuera de scope

- Verificación de identidad con documento.
- 2FA para usuarios (para admins sí: se activa el 2FA de la cuenta de Supabase y de GitHub).
- WAF o protección DDoS propia (alcanza con la de GitHub Pages y Supabase en el piloto).
- Pentest externo.

---

*Documento vivo. Cada medida nueva lleva un ID `SEC-xx`; una amenaza nueva se suma a la tabla de §2 con su mitigación.*
