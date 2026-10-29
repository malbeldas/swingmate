# Use cases — SwingMate

> **Propósito.** Describe qué hace el sistema desde la mirada de cada persona: flujo principal, alternativos, errores y criterios de aceptación medibles.
>
> **Cómo se usa.** Cada issue cita los UC y AC que cubre. Cada AC tiene al menos un test cuyo título empieza con su ID (`engineering-constitution.md` §7). Un AC sin test es una tarea incompleta.
>
> **Qué NO va en este documento.** Las reglas en detalle (se citan por ID desde `business-rules.md`), las tablas (`schema.md`), los textos de los emails (`notifications-*.md`) y el diseño visual (`design-system.md`).
>
> **Numeración.** UC-001 a UC-019: visitante y quien busca. UC-020 a UC-029: host. UC-030 a UC-039: cualquier usuario. UC-040 a UC-049: admin. UC-050 a UC-059: sistema. Los AC se numeran `AC-{UC}-{n}`.

---

## Índice

| ID | Actor | Caso |
|---|---|---|
| UC-001 | Visitante o quien busca | Buscar alojamiento |
| UC-002 | Visitante o quien busca | Cargar o editar el roster |
| UC-003 | Visitante o quien busca | Ver el detalle de un aviso |
| UC-004 | Visitante o quien busca | Escribirle al host |
| UC-005 | Quien busca | Guardar un aviso |
| UC-006 | Quien busca | Crear una alerta |
| UC-007 | Quien busca | Responder la pregunta de resultado |
| UC-020 | Host | Publicar un aviso |
| UC-021 | Host | Verificar el celular |
| UC-022 | Host | Gestionar avisos y calendario |
| UC-023 | Host | Responder consultas |
| UC-024 | Host | Elegir quién puede escribirle |
| UC-030 | Cualquiera | Registrarse e iniciar sesión |
| UC-031 | Usuario | Recuperar la contraseña |
| UC-032 | Usuario | Completar y editar el perfil |
| UC-033 | Usuario | Conversar |
| UC-034 | Usuario | Reportar y bloquear |
| UC-035 | Usuario | Descargar o eliminar sus datos |
| UC-040 | Admin | Moderar reportes |
| UC-041 | Admin | Buscar usuarios y avisos |
| UC-050 | Sistema | Avisar mensajes nuevos |
| UC-051 | Sistema | Recordar al host que no respondió |
| UC-052 | Sistema | Preguntar el resultado |
| UC-053 | Sistema | Enviar alertas |
| UC-054 | Sistema | Pedir al host que confirme su calendario |

---

## UC-001 — Buscar alojamiento

**Actor:** visitante o quien busca.

**Precondiciones:**
- Ninguna. No hace falta cuenta.

**Flujo principal:**
1. La persona escribe una ubicación en la home y elige una sugerencia de la lista.
2. Opcionalmente elige fechas de entrada y salida.
3. Opcionalmente carga su roster (UC-002). Si tiene sesión y roster guardado, viene precargado.
4. Toca "Search homes".
5. El sistema arma las noches que necesita (`BR-SRC-001`), trae los avisos activos dentro del radio y calcula el fit de cada uno (`BR-FIT-001`).
6. Muestra los full y strong ordenados (`BR-FIT-003`, `BR-FIT-004`), cada card con foto, tipo, precio semanal, iconos, etiqueta de fit, una línea de razón y 4 semanas con fecha.
7. La persona usa filtros (`BR-SRC-004`) o abre un aviso (UC-003).

**Flujos alternativos:**
- **A1 — Show near matches:** al tocarlo aparecen los partial, separados y rotulados.
- **A2 — Sin fechas ni roster:** se muestran avisos sin etiqueta (`BR-FIT-006`).
- **A3 — Sin resultados:** se muestran las salidas de `BR-SRC-005`.

**Casos de error:**
- **E1 — Ubicación no reconocida:** no se busca; se pide elegir de la lista.
- **E2 — Fechas inválidas:** se marca el campo y se explica la regla de `BR-SRC-002`.
- **E3 — Sin conexión o error del servidor:** "We couldn't load homes. Try again." con botón de reintento; se conservan los datos cargados.

**Postcondiciones:**
- Se registra `search_performed` (`BR-ANL-001`).

**Criterios de aceptación:**
- AC-001-1: con fechas, el fit de cada aviso se calcula sobre las noches desde la entrada hasta la noche anterior a la salida, aunque haya roster.
- AC-001-2: sin fechas y con un 14:7 con valores por defecto, se necesitan 8 noches por ciclo en 84 noches.
- AC-001-3: por defecto se ven solo full y strong; partial aparece al tocar "Show near matches" y poor nunca aparece.
- AC-001-4: el orden es clase de fit y después precio ascendente.
- AC-001-5: un aviso fuera del radio no aparece, y uno dentro sí, en cualquier estado de Australia.
- AC-001-6: con filtros que no dejan resultados se ve el estado vacío con "Clear filters".
- AC-001-7: sin resultados full ni strong nunca se muestra un aviso que no exista en la base.
- AC-001-8: a 375 px de ancho no hay scroll horizontal y la card muestra las 4 semanas con fecha legibles.

**Reglas referenciadas:** BR-SRC-001, BR-SRC-002, BR-SRC-003, BR-SRC-004, BR-SRC-005, BR-FIT-001, BR-FIT-002, BR-FIT-003, BR-FIT-004, BR-FIT-005, BR-FIT-006, BR-TRU-006.

---

## UC-002 — Cargar o editar el roster

**Actor:** visitante o quien busca.

**Precondiciones:**
- Ninguna.

**Flujo principal:**
1. La persona toca "Edit" en el campo roster de la búsqueda, o "My roster" en su cuenta.
2. Elige un patrón (`BR-ROS-002`).
3. Elige en un calendario la fecha en que empieza su próximo swing.
4. Revisa las dos preguntas de vuelo, que vienen en "sí".
5. Ve una vista previa de 4 semanas con días away, días home y noches de viaje.
6. Toca "Save".
7. El sistema guarda el roster en el perfil o, si no hay sesión, en la sesión del navegador (`BR-ROS-006`).

**Flujos alternativos:**
- **A1 — No fixed roster:** se borra el roster y la búsqueda pasa a pedir fechas (`BR-ROS-005`).
- **A2 — Other pattern:** se piden días en el sitio y días en la ciudad, de 1 a 42 cada uno.

**Casos de error:**
- **E1 — Ancla vacía:** no se puede guardar y se marca el campo.

**Postcondiciones:**
- Se registra `roster_completed` o `roster_updated`.
- "My roster" muestra 12 semanas con away, home y noches de viaje.

**Criterios de aceptación:**
- AC-002-1: la vista previa y "My roster" marcan la noche de viaje del último día del swing cuando la persona vuela a casa ese día.
- AC-002-2: si la persona responde "no" a volar el primer día del swing, la última noche del R&R deja de figurar como necesaria.
- AC-002-3: cambiar el roster no altera las fechas de consultas ya enviadas.
- AC-002-4: el roster de un visitante se ofrece precargado al registrarse.

**Reglas referenciadas:** BR-ROS-001, BR-ROS-002, BR-ROS-003, BR-ROS-004, BR-ROS-005, BR-ROS-006.

---

## UC-003 — Ver el detalle de un aviso

**Actor:** visitante o quien busca.

**Precondiciones:**
- El aviso existe y no está `hidden`, `removed` ni `draft`.

**Flujo principal:**
1. La persona abre un aviso desde resultados, una alerta o un link.
2. El sistema muestra:
   - La galería.
   - Título, suburbio y precio con bills y bond.
   - El bloque de fit con razones (`BR-FIT-005`).
   - El calendario de 12 semanas con sus noches marcadas.
   - Los datos con iconos y el mapa de zona aproximada (`BR-LST-004`).
   - El bloque del host (`BR-TRU-002`) y "Before you agree".
   - La caja de mensaje.
3. La persona escribe (UC-004), guarda (UC-005) o reporta (UC-034).

**Flujos alternativos:**
- **A1 — Aviso paused o filled:** se muestra con el rótulo de estado y sin caja de mensaje (`BR-LST-002`).
- **A2 — Es el dueño:** ve "Edit listing" en lugar de la caja (`BR-LST-008`).

**Casos de error:**
- **E1 — Aviso inexistente, oculto o eliminado:** página "This home is no longer available" con link a buscar.

**Postcondiciones:**
- Se registra `listing_viewed`.

**Criterios de aceptación:**
- AC-003-1: la dirección exacta del aviso no aparece en el HTML, en las respuestas de red ni en el mapa.
- AC-003-2: el centro del círculo del mapa está a menos de 500 m de la dirección real y no coincide con ella.
- AC-003-3: las noches que faltan en las razones son exactamente las noches Unavailable marcadas en el calendario.
- AC-003-4: un aviso paused se ve con rótulo y sin caja de mensaje.
- AC-003-5: el detalle muestra "Calendar updated N days ago".

**Reglas referenciadas:** BR-FIT-005, BR-LST-002, BR-LST-004, BR-LST-008, BR-TRU-002, BR-TRU-003, BR-TRU-008, BR-AVL-006.

---

## UC-004 — Escribirle al host

**Actor:** visitante o quien busca.

**Precondiciones:**
- El aviso está `active`.

**Flujo principal:**
1. La persona escribe en la caja del detalle; las fechas vienen de la búsqueda y se pueden cambiar.
2. Si alguna noche pedida no está disponible, se avisa (`BR-MSG-002`).
3. Toca "Send".
4. Si no tiene sesión, se guarda el borrador (`BR-ACC-005`) y se abre el registro (UC-030).
5. Si falta perfil mínimo, se pide (`BR-ACC-003`).
6. Si el host exige celular y no lo tiene, se pide verificarlo (`BR-TRU-004`).
7. Vuelve al aviso con el borrador y confirma.
8. El sistema crea la conversación o agrega a la existente (`BR-MSG-001`) con las fechas y el resumen del roster.
9. Muestra "Message sent" con un link a la conversación y sugiere completar foto, bio y celular (`BR-ACC-004`).

**Flujos alternativos:**
- **A1 — Ya escribió antes sobre este aviso:** el mensaje se agrega a esa conversación.
- **A2 — El host es la misma persona:** no hay caja (`BR-LST-008`).

**Casos de error:**
- **E1 — El aviso dejó de estar activo durante el registro:** se avisa, se conserva el texto para copiarlo y no se crea conversación.
- **E2 — Límite diario de cuenta nueva:** se explica `BR-MSG-007` y no se envía.
- **E3 — Bloqueado por el host:** se muestra "You can't message this host" sin decir que hubo un bloqueo.
- **E4 — Falla el envío:** el mensaje queda en la caja con "Try again"; no se pierde.

**Postcondiciones:**
- La conversación existe con las fechas guardadas.
- Se registran `send_message_clicked`, `auth_gate_opened` (si aplica) y `message_sent`.
- Se dispara UC-050 para el host.

**Criterios de aceptación:**
- AC-004-1: un visitante puede escribir sin cuenta y al tocar "Send" se le pide registrarse.
- AC-004-2: el texto y las fechas sobreviven al registro con Google y con email.
- AC-004-3: sin nombre, suburbio base, intención o Términos no se puede enviar.
- AC-004-4: con fechas que incluyen noches no disponibles aparece el aviso y se puede enviar igual.
- AC-004-5: un segundo mensaje sobre el mismo aviso no crea otra conversación.
- AC-004-6: con el aviso en "Only people with a verified phone", sin celular verificado no se envía y se ofrece verificarlo sin perder el texto.
- AC-004-7: una cuenta de menos de 7 días no puede iniciar más de 10 conversaciones en un día.

**Reglas referenciadas:** BR-ACC-003, BR-ACC-005, BR-MSG-001, BR-MSG-002, BR-MSG-003, BR-MSG-006, BR-MSG-007, BR-TRU-004, BR-LST-008.

---

## UC-005 — Guardar un aviso

**Actor:** quien busca.

**Precondiciones:**
- Tiene sesión. Sin sesión, tocar el corazón abre el registro y después guarda.

**Flujo principal:**
1. Toca el corazón en una card o en el detalle.
2. El sistema lo guarda y lo muestra en "Saved homes".

**Flujos alternativos:**
- **A1 — Ya estaba guardado:** se quita.

**Casos de error:**
- **E1 — El aviso dejó de estar activo:** en "Saved homes" aparece con su estado.

**Postcondiciones:**
- Se registra `listing_saved`.

**Criterios de aceptación:**
- AC-005-1: guardar y quitar se reflejan en la card, en el detalle y en "Saved homes".
- AC-005-2: un aviso guardado que pasa a paused aparece en "Saved homes" con el rótulo de estado.

**Reglas referenciadas:** BR-LST-002.

---

## UC-006 — Crear una alerta

**Actor:** quien busca.

**Precondiciones:**
- Hizo una búsqueda. Sin sesión, se pide registrarse.

**Flujo principal:**
1. Toca "Create an alert" en resultados o en el estado vacío.
2. El sistema guarda ubicación, radio, fechas o roster y filtros.
3. Confirma "We'll email you when a home fits".

**Flujos alternativos:**
- **A1 — Gestionar alertas:** en "Alerts" puede pausar, renovar o borrar cada una.

**Casos de error:**
- **E1 — Más de 5 alertas activas:** se pide borrar una antes.

**Postcondiciones:**
- La alerta caduca a los 90 días (`BR-MAIL-004`).

**Criterios de aceptación:**
- AC-006-1: al publicarse un aviso full o strong para la alerta, llega un solo email ese día aunque haya varios avisos.
- AC-006-2: una alerta vencida no envía emails.

**Reglas referenciadas:** BR-MAIL-004, BR-MAIL-005.

---

## UC-007 — Responder la pregunta de resultado

**Actor:** quien busca.

**Precondiciones:**
- Pasaron 14 días desde su primera consulta en esa conversación (UC-052).

**Flujo principal:**
1. Toca una respuesta en el email o en la conversación: "Yes, here", "Yes, somewhere else" o "Not yet".
2. El sistema la guarda y agradece.

**Flujos alternativos:**
- **A1 — Cambia de idea:** puede cambiar la respuesta desde la conversación.

**Casos de error:**
- **E1 — Link vencido (más de 60 días):** abre la conversación para responder ahí.

**Postcondiciones:**
- Se registra `outcome_answered` con la respuesta.

**Criterios de aceptación:**
- AC-007-1: la respuesta desde el email no requiere iniciar sesión y queda asociada a la conversación correcta.
- AC-007-2: la pregunta no se vuelve a enviar para la misma conversación.

**Reglas referenciadas:** BR-MAIL-003.

---

## UC-020 — Publicar un aviso

**Actor:** host.

**Precondiciones:**
- Tiene cuenta con email verificado. Sin sesión, "List a place" lleva al registro y vuelve al wizard.

**Flujo principal:**
1. Paso 1: suburbio, dirección exacta (marcada como privada), tipo de lugar y baño.
2. Paso 2: precio semanal, bills, bond, estadía mínima, amueblado, quiénes viven, features con "+".
3. Paso 3: título, descripción, fotos, reglas fijas, "Other house rules" y extras FIFO con "+".
4. Paso 4: disponibilidad (`BR-AVL-003`) con vista previa de 12 semanas y excepciones.
5. Paso 5: verificar celular (UC-021) y aceptar la declaración de veracidad.
6. Toca "Publish".
7. El sistema calcula el círculo del mapa (`BR-LST-004`), publica y muestra el aviso como lo verá quien busca.

**Flujos alternativos:**
- **A1 — Guardar borrador:** en cualquier paso, "Save and finish later" deja el aviso en `draft`.
- **A2 — Disponibilidad desde roster sin roster cargado:** se abre UC-002 dentro del paso 4.

**Casos de error:**
- **E1 — Falta un dato obligatorio:** "Next" está deshabilitado y dice qué falta.
- **E2 — Menos de 3 fotos:** no se avanza del paso 3.
- **E3 — Foto inválida:** se rechaza con el motivo (`security.md` §6).
- **E4 — Límite de avisos:** se explica `BR-LST-007`.
- **E5 — Texto de reglas con riesgo:** se avisa y se pide reformular (`BR-LST-005`).

**Postcondiciones:**
- El aviso queda `active` y se dispara UC-053 para las alertas.
- Se registra `listing_created`.

**Criterios de aceptación:**
- AC-020-1: sin celular verificado o sin la declaración, "Publish" está deshabilitado.
- AC-020-2: las fotos subidas no conservan metadatos EXIF ni ubicación GPS.
- AC-020-3: con disponibilidad desde un roster 14:7 con valores por defecto, el aviso queda disponible 13 noches por ciclo.
- AC-020-4: un borrador no aparece en búsquedas ni por link directo para otros usuarios.
- AC-020-5: "Other house rules" no acepta más de 200 caracteres.
- AC-020-6: no se pueden sumar más de 10 features o extras propios.

**Reglas referenciadas:** BR-LST-001, BR-LST-002, BR-LST-003, BR-LST-004, BR-LST-005, BR-LST-006, BR-LST-007, BR-AVL-001, BR-AVL-003, BR-PRV-002.

---

## UC-021 — Verificar el celular

**Actor:** host, o quien busca cuando un host lo exige.

**Precondiciones:**
- Tiene sesión.

**Flujo principal:**
1. Escribe su celular australiano.
2. Toca "Send code".
3. Recibe un SMS con un código de 6 dígitos (`NTF-008`).
4. Lo escribe y toca "Verify".
5. El sistema marca el celular como verificado.

**Flujos alternativos:**
- **A1 — No llegó el código:** "Send again" queda disponible a los 60 segundos.

**Casos de error:**
- **E1 — Número no australiano o mal escrito:** se rechaza antes de enviar.
- **E2 — Código incorrecto o vencido:** se avisa y se permite reintentar.
- **E3 — Demasiados intentos:** se bloquea una hora (`security.md` §5).
- **E4 — El número ya está verificado en otra cuenta:** se rechaza con "This number is already in use".

**Postcondiciones:**
- El perfil muestra "Phone verified". El número nunca se muestra a otros (`BR-TRU-003`).
- Se registra `phone_verified`.

**Criterios de aceptación:**
- AC-021-1: un número ya verificado en otra cuenta no se puede verificar de nuevo.
- AC-021-2: después de 5 códigos incorrectos se bloquea la verificación una hora.
- AC-021-3: el número no aparece en ninguna respuesta de red a otro usuario.

**Reglas referenciadas:** BR-LST-003, BR-TRU-003, BR-TRU-004.

---

## UC-022 — Gestionar avisos y calendario

**Actor:** host.

**Precondiciones:**
- Tiene al menos un aviso.

**Flujo principal:**
1. Abre "My listings".
2. En cada aviso puede editar, ver el calendario, pausar, marcar "Filled", reactivar o eliminar.
3. En el calendario bloquea o abre noches tocándolas, o cambia la regla.
4. Toca "My calendar is up to date" cuando corresponde.

**Flujos alternativos:**
- **A1 — Eliminar:** pide confirmación y pasa a `removed` (`BR-LST-002`).

**Casos de error:**
- **E1 — Aviso oculto por un admin:** solo puede verlo y leer el motivo; no puede reactivarlo.

**Postcondiciones:**
- Cada cambio de calendario actualiza la fecha "Calendar updated".

**Criterios de aceptación:**
- AC-022-1: una noche bloqueada deja de cubrir esa noche en el fit de cualquier búsqueda inmediatamente.
- AC-022-2: un aviso pausado desaparece de la búsqueda y sigue visible por link con rótulo.
- AC-022-3: un aviso oculto por un admin no se puede reactivar desde la cuenta del host.

**Reglas referenciadas:** BR-AVL-003, BR-AVL-006, BR-LST-002.

---

## UC-023 — Responder consultas

**Actor:** host.

**Precondiciones:**
- Recibió al menos una consulta.

**Flujo principal:**
1. Abre "Inbox" desde el email (UC-050) o desde la web.
2. Ve la lista con foto del aviso, nombre, último mensaje, fecha y no leídos.
3. Abre una consulta y ve la ficha de quien escribe (`BR-TRU-001`), las fechas pedidas contra su calendario y "Before you agree".
4. Responde (UC-033).

**Flujos alternativos:**
- **A1 — Las fechas ya no están libres:** la ficha lo marca en rojo.

**Casos de error:**
- **E1 — Quien escribió eliminó su cuenta:** aparece como "Deleted user" y no se puede responder.

**Postcondiciones:**
- Se registra `first_reply_received` en la primera respuesta.

**Criterios de aceptación:**
- AC-023-1: la ficha muestra nombre, suburbio base, tipo de trabajo, roster, verificaciones, antigüedad y actividad, y nunca email ni teléfono.
- AC-023-2: las fechas pedidas se comparan con el calendario actual del aviso.

**Reglas referenciadas:** BR-TRU-001, BR-TRU-003, BR-TRU-008.

---

## UC-024 — Elegir quién puede escribirle

**Actor:** host.

**Precondiciones:**
- Tiene sesión.

**Flujo principal:**
1. En "My account", sección "Who can message you", elige una de las dos opciones (`BR-TRU-004`).
2. El sistema la aplica a todos sus avisos.

**Flujos alternativos:** ninguno.

**Casos de error:** ninguno.

**Postcondiciones:**
- Las conversaciones existentes no cambian.

**Criterios de aceptación:**
- AC-024-1: con "Only people with a verified phone", quien no tiene celular verificado no puede iniciar una consulta nueva, pero sí seguir una conversación ya abierta.

**Reglas referenciadas:** BR-TRU-004.

---

## UC-030 — Registrarse e iniciar sesión

**Actor:** cualquiera.

**Precondiciones:**
- Ninguna.

**Flujo principal:**
1. Toca "Sign up" o llega desde un gate (UC-004, UC-005, UC-006, UC-020).
2. Elige "Continue with Google" o email con contraseña.
3. Con email: escribe email y contraseña, recibe un código de 6 dígitos (`NTF-001`) y lo escribe.
4. Completa el perfil mínimo (`BR-ACC-003`): nombre, suburbio base, intención y Términos.
5. Si eligió "List a place" o "Both", se le ofrece "List your place now".
6. Vuelve a donde estaba.

**Flujos alternativos:**
- **A1 — Ya tiene cuenta:** "Log in" con Google o email y contraseña.
- **A2 — Mismo email con Google y contraseña:** se vincula (`BR-ACC-006`).

**Casos de error:**
- **E1 — Email descartable:** se rechaza (`BR-TRU-007`).
- **E2 — Código incorrecto o vencido:** se avisa y se ofrece reenviar.
- **E3 — Contraseña corta:** se avisa antes de enviar.

**Postcondiciones:**
- Se registran `signup_started`, `signup_completed` y `profile_completed`.

**Criterios de aceptación:**
- AC-030-1: una cuenta con email sin verificar no puede enviar mensajes ni publicar.
- AC-030-2: no hay botón de Apple ni de Facebook.
- AC-030-3: después del registro la persona vuelve a la misma pantalla en la que estaba.
- AC-030-4: con un email de dominio descartable no se puede registrar.

**Reglas referenciadas:** BR-ACC-001, BR-ACC-002, BR-ACC-003, BR-ACC-006, BR-TRU-007.

---

## UC-031 — Recuperar la contraseña

**Actor:** usuario.

**Precondiciones:**
- Tiene cuenta con email y contraseña.

**Flujo principal:**
1. Toca "Forgot password?".
2. Escribe su email.
3. Recibe un link (`NTF-002`) y elige una contraseña nueva.

**Flujos alternativos:**
- **A1 — Cuenta solo con Google:** el email lo explica y lleva a "Continue with Google".

**Casos de error:**
- **E1 — Email inexistente:** se muestra el mismo mensaje que si existiera, para no revelar cuentas.

**Postcondiciones:**
- Se cierran las otras sesiones.

**Criterios de aceptación:**
- AC-031-1: la pantalla responde igual con un email registrado y con uno no registrado.

**Reglas referenciadas:** BR-MAIL-005.

---

## UC-032 — Completar y editar el perfil

**Actor:** usuario.

**Precondiciones:**
- Tiene sesión.

**Flujo principal:**
1. Abre "My account" > "Profile".
2. Edita nombre, foto, bio, suburbio base, tipo de trabajo e intención.
3. Ve el estado de verificación de email y celular.

**Flujos alternativos:**
- **A1 — Verificar celular:** abre UC-021.

**Casos de error:**
- **E1 — Foto inválida:** se rechaza con el motivo.

**Postcondiciones:**
- Se registra `profile_updated`.

**Criterios de aceptación:**
- AC-032-1: el nombre no puede quedar vacío y el suburbio base debe salir de la lista.

**Reglas referenciadas:** BR-ACC-003, BR-ACC-004.

---

## UC-033 — Conversar

**Actor:** usuario.

**Precondiciones:**
- Participa de la conversación.

**Flujo principal:**
1. Abre "Messages" y elige una conversación.
2. Ve el aviso arriba con su estado, las fechas pedidas, "Before you agree" y los mensajes.
3. Escribe y envía; el otro lo ve sin recargar si está en la conversación.
4. Los no leídos se marcan como leídos al abrir.

**Flujos alternativos:**
- **A1 — Mensaje con riesgo:** se muestra el aviso de `BR-MSG-008`.
- **A2 — Aviso no activo:** se muestra su estado (`BR-MSG-005`).

**Casos de error:**
- **E1 — Bloqueado o suspendido:** no se puede enviar (`BR-MSG-006`).
- **E2 — Falla el envío:** el mensaje queda con "Try again".

**Postcondiciones:**
- Se registra `message_sent`, sin el texto (`BR-ANL-002`).

**Criterios de aceptación:**
- AC-033-1: un mensaje enviado aparece en la otra sesión abierta en menos de 3 segundos.
- AC-033-2: un mensaje con un número de teléfono se entrega sin cambios.
- AC-033-3: un mensaje que pide una transferencia antes de ver el lugar muestra el aviso de riesgo a quien lo recibe.
- AC-033-4: un usuario no puede leer conversaciones de las que no participa, ni pidiéndolas por id.

**Reglas referenciadas:** BR-MSG-003, BR-MSG-004, BR-MSG-005, BR-MSG-006, BR-MSG-008, BR-TRU-008, BR-ANL-002.

---

## UC-034 — Reportar y bloquear

**Actor:** usuario. Un visitante puede reportar un aviso, pero se le pide registrarse.

**Precondiciones:**
- Tiene sesión.

**Flujo principal:**
1. Toca "Report" en un aviso, un perfil o una conversación.
2. Elige el motivo y escribe un detalle opcional (`BR-TRU-005`).
3. Opcionalmente bloquea a la persona.
4. El sistema confirma "Thanks, we'll review this within 24 hours" y avisa a los admins (`NTF-009`).

**Flujos alternativos:**
- **A1 — Solo bloquear:** "Block" sin reporte.
- **A2 — Desbloquear:** desde "Privacy and data".

**Casos de error:** ninguno.

**Postcondiciones:**
- Se registra `report_created` o `user_blocked`.

**Criterios de aceptación:**
- AC-034-1: después de bloquear, la persona bloqueada no puede enviar mensajes a quien la bloqueó.
- AC-034-2: el reporte llega a la cola de admin con motivo, fecha y objeto reportado.

**Reglas referenciadas:** BR-TRU-005, BR-MSG-006, BR-ADM-003.

---

## UC-035 — Descargar o eliminar sus datos

**Actor:** usuario.

**Precondiciones:**
- Tiene sesión.

**Flujo principal:**
1. Abre "Privacy and data".
2. Toca "Download my data" y recibe el archivo (`BR-PRV-004`), o "Delete my account" y confirma dos veces (`BR-ACC-007`).

**Flujos alternativos:** ninguno.

**Casos de error:**
- **E1 — Falla la descarga:** se ofrece reintentar.

**Postcondiciones:**
- Con la baja, la sesión se cierra y el login con ese email crea una cuenta nueva.

**Criterios de aceptación:**
- AC-035-1: después de eliminar la cuenta, sus avisos no aparecen y sus mensajes figuran como "Deleted user".
- AC-035-2: el archivo descargado incluye perfil, roster, avisos, guardados, alertas y mensajes enviados, y no incluye mensajes de otras personas.

**Reglas referenciadas:** BR-ACC-007, BR-PRV-003, BR-PRV-004.

---

## UC-040 — Moderar reportes

**Actor:** admin.

**Precondiciones:**
- Tiene rol admin.

**Flujo principal:**
1. Abre la cola de reportes, ordenada por antigüedad.
2. Abre un reporte y ve el objeto reportado; si es una conversación, puede leerla (`BR-ADM-002`).
3. Elige una acción y escribe la nota obligatoria (`BR-ADM-001`).
4. El sistema aplica la acción, la registra y avisa al usuario afectado cuando corresponde.

**Flujos alternativos:**
- **A1 — Varios reportes del mismo objeto:** se ven agrupados y se resuelven juntos.

**Casos de error:**
- **E1 — Nota vacía:** no se aplica la acción.

**Postcondiciones:**
- El reporte queda cerrado con la acción y la nota.

**Criterios de aceptación:**
- AC-040-1: ninguna acción se aplica sin nota.
- AC-040-2: un admin no puede leer una conversación sin reporte abierto.
- AC-040-3: ocultar un aviso lo saca de la búsqueda y de su link directo en el momento.
- AC-040-4: una cuenta suspendida no puede enviar mensajes ni publicar.

**Reglas referenciadas:** BR-ADM-001, BR-ADM-002, BR-MSG-005, BR-MSG-006.

---

## UC-041 — Buscar usuarios y avisos

**Actor:** admin.

**Precondiciones:**
- Tiene rol admin.

**Flujo principal:**
1. Busca por nombre, email o suburbio.
2. Ve el usuario o aviso con su estado, sus reportes y el registro de moderación.
3. Puede aplicar las mismas acciones que en UC-040.

**Flujos alternativos:** ninguno.

**Casos de error:** ninguno.

**Postcondiciones:** ninguna.

**Criterios de aceptación:**
- AC-041-1: la búsqueda de admin no muestra el contenido de mensajes.

**Reglas referenciadas:** BR-ADM-001, BR-ADM-002.

---

## UC-050 — Avisar mensajes nuevos

**Actor:** sistema.

**Precondiciones:**
- Llegó un mensaje sin leer.

**Flujo principal:**
1. A los 10 minutos, si sigue sin leer, el sistema arma un email con los mensajes sin leer de esa conversación (`NTF-003`).
2. Lo envía respetando el límite de `BR-MAIL-001`.

**Flujos alternativos:**
- **A1 — Notificación apagada:** no se envía, salvo la primera consulta.

**Casos de error:**
- **E1 — Falla el proveedor de email:** se reintenta 3 veces con espera creciente y se registra el error (`observability.md` §4).

**Postcondiciones:**
- Queda registrado el envío.

**Criterios de aceptación:**
- AC-050-1: tres mensajes en 5 minutos generan un solo email.
- AC-050-2: un mensaje leído antes de los 10 minutos no genera email.

**Reglas referenciadas:** BR-MAIL-001, BR-MAIL-005.

---

## UC-051 — Recordar al host que no respondió

**Actor:** sistema.

**Precondiciones:**
- Primera consulta sin respuesta del host por 48 horas.

**Flujo principal:**
1. El sistema envía el recordatorio (`NTF-004`).

**Flujos alternativos:**
- **A1 — Aviso no activo:** no se envía.

**Casos de error:**
- **E1 — Falla el envío:** igual que UC-050 E1.

**Postcondiciones:**
- No se vuelve a recordar esa conversación.

**Criterios de aceptación:**
- AC-051-1: el recordatorio sale una sola vez por conversación.

**Reglas referenciadas:** BR-MAIL-002.

---

## UC-052 — Preguntar el resultado

**Actor:** sistema.

**Precondiciones:**
- Pasaron 14 días desde la primera consulta.

**Flujo principal:**
1. El sistema envía el email (`NTF-005`) y muestra la pregunta en la conversación.

**Flujos alternativos:** ninguno.

**Casos de error:**
- **E1 — Quien buscó eliminó su cuenta:** no se envía.

**Postcondiciones:**
- Se registra `outcome_asked`.

**Criterios de aceptación:**
- AC-052-1: el email sale el día 14 y una sola vez por conversación.

**Reglas referenciadas:** BR-MAIL-003.

---

## UC-053 — Enviar alertas

**Actor:** sistema.

**Precondiciones:**
- Hay alertas vigentes.

**Flujo principal:**
1. Una vez por día, el sistema evalúa los avisos publicados desde la última corrida contra cada alerta.
2. Junta los full y strong por usuario y envía un email (`NTF-007`).

**Flujos alternativos:** ninguno.

**Casos de error:**
- **E1 — Falla el envío:** igual que UC-050 E1.

**Postcondiciones:**
- Un aviso no se avisa dos veces a la misma alerta.

**Criterios de aceptación:**
- AC-053-1: el fit de la alerta usa la misma función que la búsqueda.

**Reglas referenciadas:** BR-MAIL-004, BR-FIT-001.

---

## UC-054 — Pedir al host que confirme su calendario

**Actor:** sistema.

**Precondiciones:**
- Aviso activo con 30 días sin cambios de calendario ni confirmación.

**Flujo principal:**
1. El sistema envía el email (`NTF-006`) con "My calendar is up to date" y "Update my calendar".
2. Si el host confirma, se actualiza la fecha "Calendar updated".

**Flujos alternativos:** ninguno.

**Casos de error:** ninguno.

**Postcondiciones:** ninguna.

**Criterios de aceptación:**
- AC-054-1: confirmar desde el email actualiza la fecha sin pedir login.

**Reglas referenciadas:** BR-AVL-006.

---

## Fuera de scope

- Reservar, pagar o firmar un acuerdo dentro de SwingMate.
- Que el host busque perfiles de quien busca y le escriba (v0.2).
- Adjuntos en el chat.
- Notificaciones push o por SMS de mensajes nuevos.
- Login con Apple o Facebook.
- Verificación de identidad con documento.
- Perfil público independiente del host (P09 del MVP). El bloque del host en el detalle lo reemplaza en v0.1.

---

*Documento vivo. Un UC nuevo se agrega con su rango de actor y sus AC; un AC no se borra si ya tiene test, se marca como reemplazado.*
