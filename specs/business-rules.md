# Business rules — SwingMate

> **Propósito.** Define qué puede y qué no puede pasar en SwingMate, como condición y comportamiento, sin asumir tecnología.
>
> **Cómo se usa.** Cada regla tiene un ID estable (`BR-{módulo}-{nro}`) que citan los use cases, el schema, los tests y los issues. Si el código hace algo distinto de una regla, el código está mal o la regla se cambia primero acá.
>
> **Qué NO va en este documento.** Los pasos de cada flujo (`use-cases.md`), las tablas y constraints (`schema.md`), los textos de los emails (`notifications-*.md`), los permisos por tabla (`roles-permissions.md`) y las decisiones con sus alternativas (`decision-log.md`).
>
> **Fuentes.** Web MVP v0.1, Roster/Availability & Matching Rules v0.1, decisiones del 25 Sep, 6 Oct, 18 Oct y 27 Oct 2026, y el prototipo v10. Cuando una regla es una propuesta nuestra que todavía no cerró nadie, lo dice en **Estado**.

---

## Índice

1. Módulos y convenciones
2. Roster (ROS)
3. Disponibilidad (AVL)
4. Búsqueda (SRC)
5. Fit (FIT)
6. Avisos (LST)
7. Cuenta y perfil (ACC)
8. Mensajes (MSG)
9. Confianza y seguridad (TRU)
10. Notificaciones (MAIL)
11. Administración (ADM)
12. Privacidad (PRV)
13. Analytics (ANL)
14. Fuera de scope

---

## 1. Módulos y convenciones

| Módulo | Prefijo | Qué cubre |
|---|---|---|
| Roster | `BR-ROS` | Cómo se describe y calcula el roster de una persona |
| Disponibilidad | `BR-AVL` | Qué noches se puede ocupar un aviso |
| Búsqueda | `BR-SRC` | Qué entra en una búsqueda y qué filtros hay |
| Fit | `BR-FIT` | Cómo se clasifica y explica la compatibilidad |
| Avisos | `BR-LST` | Datos, estados y publicación de un aviso |
| Cuenta | `BR-ACC` | Registro, login, perfil y baja |
| Mensajes | `BR-MSG` | Consultas, conversaciones y límites |
| Confianza | `BR-TRU` | Qué ve cada parte, reportes, bloqueos y antifraude |
| Notificaciones | `BR-MAIL` | Cuándo se avisa por email o SMS |
| Administración | `BR-ADM` | Moderación |
| Privacidad | `BR-PRV` | Datos personales, retención y acceso |
| Analytics | `BR-ANL` | Qué se mide y qué nunca se mide |

**Convención de fechas.** Todo cálculo trabaja con noches en la zona horaria del aviso (`BR-AVL-005`). "Hoy" es la fecha local de esa zona.

---

## 2. Roster (ROS)

### BR-ROS-001 — Qué es un roster
**Aplica a:** perfil, búsqueda rápida.
**Condición:** una persona carga su roster.
**Comportamiento:** se guarda con cinco datos: días en el sitio (`days_on`), días en la ciudad (`days_off`), fecha de inicio del próximo swing (ancla), si vuela a casa el último día del swing (por defecto sí) y si vuela al sitio el primer día del swing siguiente (por defecto sí). La etiqueta "14:7" solo se muestra; el cálculo usa siempre los cinco datos.
**Excepciones:** quien elige "No fixed roster" no tiene roster y busca por fechas (`BR-ROS-005`).

### BR-ROS-002 — Patrones ofrecidos
**Aplica a:** selector de roster.
**Condición:** la persona abre el selector.
**Comportamiento:** se ofrecen 14:7, 8:6, 7:7, 14:14 y 21:7, más "Other pattern" con `days_on` y `days_off` enteros entre 1 y 42, y "No fixed roster".
**Excepciones:** ninguna.
**Estado:** "Other pattern" es propuesta nuestra (Reglas §3 pide "otros patrones configurables"). El prototipo solo tiene los 5 fijos.

### BR-ROS-003 — Noches que necesita según el roster
**Aplica a:** fit, calendario de "My roster".
**Condición:** hay roster y la búsqueda no tiene fechas.
**Comportamiento:** con `ciclo = days_on + days_off` y `fase(d) = (d − ancla) mod ciclo`, la noche *d* se necesita si se cumple alguna de estas condiciones:
- `fase(d) ≥ days_on` (noche de R&R);
- `fase(d) = days_on − 1` y la persona vuela a casa el último día (noche de viaje).

Además, si la persona **no** vuela el primer día del swing siguiente, la última noche del R&R (`fase(d) = ciclo − 1`) no se necesita, porque viaja el día anterior.
Con los valores por defecto, un 14:7 necesita 8 noches por ciclo: 1 de viaje + 7 de R&R.
**Excepciones:** ninguna.
**Estado:** cerrada el 27 Oct 2026 a partir de la observación de Tomás de que la gente vuela el mismo día que termina el swing.

### BR-ROS-004 — Cambiar el roster
**Aplica a:** perfil.
**Condición:** la persona edita su roster.
**Comportamiento:** el cambio afecta solo cálculos futuros. Las consultas ya enviadas conservan las fechas y el resumen de roster con que se enviaron (`BR-MSG-002`).
**Excepciones:** ninguna.

### BR-ROS-005 — Sin roster fijo
**Aplica a:** búsqueda, perfil.
**Condición:** la persona elige "No fixed roster".
**Comportamiento:** no se guarda roster. La búsqueda pide fechas para calcular fit; sin fechas, los resultados no muestran etiqueta de fit y piden "Add your dates or roster to see the fit".
**Excepciones:** ninguna.

### BR-ROS-006 — Roster de un visitante
**Aplica a:** búsqueda sin cuenta.
**Condición:** un visitante carga un roster rápido.
**Comportamiento:** el roster vive solo en la sesión del navegador. Al registrarse se le ofrece guardarlo en el perfil, con los datos ya cargados.
**Excepciones:** ninguna.

---

## 3. Disponibilidad (AVL)

### BR-AVL-001 — La disponibilidad es del aviso
**Aplica a:** avisos.
**Condición:** siempre.
**Comportamiento:** cada aviso tiene su propia disponibilidad por noche, independiente del roster del host. Un host sin roster puede publicar.
**Excepciones:** ninguna.

### BR-AVL-002 — Dos estados
**Aplica a:** calendario, fit.
**Condición:** siempre.
**Comportamiento:** cada noche está **Available** o **Unavailable**. No existe "Occupied" ni otro estado visible.
**Excepciones:** ninguna.

### BR-AVL-003 — Formas de generar disponibilidad
**Aplica a:** publicar y editar un aviso.
**Condición:** el host define la disponibilidad.
**Comportamiento:** elige una de tres reglas:
- **Desde mi roster:** el aviso está disponible las noches en que el host está en el sitio. Son las fases `0` a `days_on − 2`, más la fase `days_on − 1` si el host no vuela a casa ese día, más la fase `ciclo − 1` si el host viaja el día anterior al swing.
- **Siempre disponible desde una fecha.**
- **Rangos de fechas.**

Sobre cualquier regla, el host suma excepciones que bloquean o abren noches puntuales. Una excepción gana sobre la regla.
**Excepciones:** ninguna.

### BR-AVL-004 — Horizonte del calendario
**Aplica a:** detalle, fit.
**Condición:** se muestra o calcula disponibilidad.
**Comportamiento:** se calcula sobre 84 noches. La card muestra 4 semanas, el detalle 12 semanas y "My roster" 12 semanas. Toda noche anterior a hoy es Unavailable.
**Excepciones:** ninguna.

### BR-AVL-005 — Zona horaria
**Aplica a:** todo cálculo de noches.
**Condición:** siempre.
**Comportamiento:** las noches se cuentan en la zona horaria del estado del aviso (por ejemplo `Australia/Perth` para WA). La búsqueda sin aviso usa la zona del lugar buscado.
**Excepciones:** ninguna.

### BR-AVL-006 — Calendario desactualizado
**Aplica a:** avisos activos.
**Condición:** pasaron 30 días sin que el host edite ni confirme el calendario.
**Comportamiento:** se le manda al host un email con un botón "My calendar is up to date" (`NTF-006`). El detalle muestra "Calendar updated N days ago" siempre.
**Excepciones:** ninguna.
**Estado:** propuesta nuestra. Las Reglas §24 dicen que no podemos prometer disponibilidad si el host no actualiza; esto lo mitiga sin bloquear.

---

## 4. Búsqueda (SRC)

### BR-SRC-001 — Qué es una búsqueda
**Aplica a:** home y resultados.
**Condición:** alguien busca.
**Comportamiento:** la búsqueda tiene ubicación (obligatoria), fechas de entrada y salida (opcionales) y roster (opcional). Si hay fechas, definen las noches que necesita: desde la noche de entrada hasta la noche anterior a la salida. Si no hay fechas y hay roster, las noches salen de `BR-ROS-003`. Las fechas siempre ganan sobre el roster.
**Excepciones:** sin fechas ni roster se muestran avisos sin etiqueta de fit (`BR-FIT-006`).

### BR-SRC-002 — Límites de fechas
**Aplica a:** búsqueda y consulta.
**Condición:** se cargan fechas.
**Comportamiento:** la entrada es hoy o posterior, la salida es posterior a la entrada y la entrada es como máximo 12 meses a futuro. Si la estadía supera 84 noches, el fit se calcula sobre las primeras 84 y la interfaz lo dice.
**Excepciones:** ninguna.

### BR-SRC-003 — Ubicación
**Aplica a:** búsqueda.
**Condición:** se elige una ubicación.
**Comportamiento:** la ubicación es un suburbio o una ciudad de una lista de Australia completa (`INT-006`). Un suburbio busca en un radio de 15 km desde su centro; una ciudad capital, en 40 km. El radio se puede cambiar a 5, 15, 25 o 50 km. Nada está atado a Perth.
**Excepciones:** ninguna.
**Estado:** los radios son propuesta nuestra.

### BR-SRC-004 — Filtros
**Aplica a:** resultados.
**Condición:** quien busca usa filtros.
**Comportamiento:** hay filtros por clase de fit (`BR-FIT-003`), tipo de lugar y precio máximo semanal. Los filtros filtran de verdad. Si no queda ningún resultado, se muestra el estado vacío con "Clear filters".
**Excepciones:** ninguna.

### BR-SRC-005 — Sin resultados
**Aplica a:** resultados.
**Condición:** ninguna búsqueda devuelve avisos Full o Strong.
**Comportamiento:** se ofrecen cuatro salidas en este orden: ver near matches si hay, ampliar el radio, crear una alerta y "List your place". Nunca se rellena con avisos inventados (`BR-TRU-006`).
**Excepciones:** ninguna.

---

## 5. Fit (FIT)

### BR-FIT-001 — Clases de fit
**Aplica a:** resultados, detalle, alertas.
**Condición:** hay noches que necesita y un aviso.
**Comportamiento:** con `cobertura = noches disponibles / noches que necesita`:
- **full:** todas las noches disponibles.
- **strong:** falta como máximo 1 noche en cada bloque y la cobertura es de al menos 90%.
- **partial:** cobertura de al menos 60%, sin cumplir strong.
- **poor:** cobertura menor a 60%.
**Excepciones:** ninguna.

### BR-FIT-002 — Etiquetas
**Aplica a:** cards y detalle.
**Condición:** se muestra un fit.
**Comportamiento:** full → "Great roster fit", strong → "Good roster fit", partial → "Partial fit". Si las noches salen de fechas, dice "date fit" en lugar de "roster fit". Poor no tiene etiqueta. No se muestra ningún porcentaje ni puntaje.
**Excepciones:** ninguna.

### BR-FIT-003 — Qué se muestra por defecto
**Aplica a:** resultados.
**Condición:** hay resultados.
**Comportamiento:** se muestran full y strong. Partial aparece solo al tocar "Show near matches". Poor no se muestra nunca; al pie dice "N homes don't fit your dates" sin listarlos.
**Excepciones:** ninguna.

### BR-FIT-004 — Orden
**Aplica a:** resultados.
**Condición:** hay más de un resultado.
**Comportamiento:** primero por clase (full, strong, partial); dentro de cada clase, por precio semanal ascendente; a igual precio, el más reciente primero.
**Excepciones:** sin noches que necesita, el orden es el más reciente primero.

### BR-FIT-005 — Razones en noches y con fechas
**Aplica a:** card y detalle.
**Condición:** se muestra un fit.
**Comportamiento:** la card muestra una línea ("Free for all 32 nights you need in the next 12 weeks"). El detalle muestra las razones completas, con las noches que faltan con fecha ("Not free the night of 1 Nov") y, si hay precio máximo, si está dentro o fuera del presupuesto. Las razones y el calendario salen del mismo cálculo y no pueden contradecirse.
**Excepciones:** ninguna.

### BR-FIT-006 — Sin noches que necesita
**Aplica a:** resultados.
**Condición:** no hay fechas ni roster.
**Comportamiento:** los avisos se muestran sin etiqueta y con la frase "Add your dates or roster to see the fit".
**Excepciones:** ninguna.

---

## 6. Avisos (LST)

### BR-LST-001 — Datos obligatorios
**Aplica a:** publicar.
**Condición:** el host publica.
**Comportamiento:** son obligatorios:
- Título.
- Suburbio, estado y dirección exacta. La dirección es privada.
- Tipo de lugar y baño (propio, ensuite o compartido).
- Precio semanal en AUD, bills incluidos o no, bond en AUD y amueblado o no.
- Al menos 3 fotos.
- Una regla de disponibilidad.

Son opcionales: estadía mínima, quiénes viven y cuántos en roster, minutos al aeropuerto, si el host vive ahí, parejas, mascotas, fumar, estacionamiento, features, extras FIFO y otras reglas de la casa.
**Excepciones:** ninguna.
**Estado:** el mínimo de 3 fotos es propuesta nuestra: la galería del detalle (decisión del 6 Oct) necesita mostrar varios ambientes.

### BR-LST-002 — Estados
**Aplica a:** avisos.
**Condición:** siempre.
**Comportamiento:**
- `draft`: se guarda a medias y no se ve en público.
- `active`: aparece en la búsqueda.
- `paused` y `filled`: no aparecen en la búsqueda, pero el link directo muestra el aviso con un rótulo y sin caja de mensaje.
- `hidden`: lo ocultó un admin y no se ve.
- `removed`: lo eliminó el host. Se conserva 90 días por si hay reportes y después se borra (`BR-PRV-003`).
**Excepciones:** ninguna.

### BR-LST-003 — Requisitos para publicar
**Aplica a:** paso final del wizard.
**Condición:** el host toca "Publish".
**Comportamiento:** se exige email verificado, celular verificado por SMS y la declaración "The photos and details are real and current". Sin las tres, el botón está deshabilitado y dice qué falta.
**Excepciones:** ninguna.
**Estado:** el celular obligatorio lo decidió Maxi el 18 Oct (D10).

### BR-LST-004 — Ubicación pública
**Aplica a:** detalle y mapa.
**Condición:** se muestra un aviso.
**Comportamiento:** se muestra el suburbio y un círculo de 1 km de radio cuyo centro está desplazado al azar hasta 500 m de la dirección real. El desplazamiento se calcula una vez al publicar y no cambia. La dirección exacta nunca sale de la base hacia otra persona; el host la comparte en el chat si quiere.
**Excepciones:** ninguna.

### BR-LST-005 — Otras reglas de la casa
**Aplica a:** paso de reglas del wizard.
**Condición:** el host escribe en "Other house rules".
**Comportamiento:** acepta hasta 200 caracteres y se muestra en el detalle. No se usa en filtros ni en el fit. Antes de publicar pasa por dos chequeos de palabras: el de riesgo de los mensajes (`BR-MSG-008`) y uno de términos discriminatorios (origen, religión, edad, género, orientación). Si alguno salta, se pide reformular con el texto "Keep it about the home, not about who can live there".
**Excepciones:** ninguna.
**Estado:** acordado como contrapropuesta al "+" en reglas de Tomás (respuesta del 27 Oct): una regla libre no se puede filtrar y puede ser discriminatoria.

### BR-LST-006 — Features y extras propios
**Aplica a:** wizard.
**Condición:** el host toca "+ Add your own" en features o extras FIFO.
**Comportamiento:** puede sumar hasta 10 ítems de hasta 40 caracteres cada uno. Se muestran como chips en el detalle y no se usan para filtrar.
**Excepciones:** ninguna.

### BR-LST-007 — Límite de avisos
**Aplica a:** publicar.
**Condición:** el host intenta tener más de 5 avisos activos o pausados.
**Comportamiento:** no se permite y se le sugiere escribir a soporte.
**Excepciones:** un admin puede subir el límite a una cuenta.
**Estado:** propuesta nuestra para frenar spam en el piloto.

### BR-LST-008 — El host no se escribe a sí mismo
**Aplica a:** detalle.
**Condición:** el dueño del aviso abre su propio aviso.
**Comportamiento:** no ve caja de mensaje; ve "Edit listing".
**Excepciones:** ninguna.

---

## 7. Cuenta y perfil (ACC)

### BR-ACC-001 — Una sola cuenta
**Aplica a:** registro.
**Condición:** siempre.
**Comportamiento:** existe un solo tipo de cuenta. La intención ("Find a place", "List a place", "Both") prende las capacidades de buscar y de publicar, y se puede cambiar en el perfil.
**Excepciones:** ninguna.

### BR-ACC-002 — Formas de registrarse
**Aplica a:** registro y login.
**Condición:** alguien se registra o inicia sesión.
**Comportamiento:** hay dos formas. Con Google, o con email y contraseña de al menos 8 caracteres más un código de 6 dígitos enviado al email. Sin el código, la cuenta no puede enviar mensajes ni publicar. No hay login con Apple ni con Facebook en v0.1.
**Excepciones:** ninguna.

### BR-ACC-003 — Perfil mínimo para enviar el primer mensaje
**Aplica a:** gate de registro.
**Condición:** un usuario intenta enviar su primera consulta.
**Comportamiento:** hacen falta email verificado, nombre visible, suburbio base, intención y Términos y Privacidad aceptados. Si falta algo, se pide en el mismo flujo, sin perder el borrador.
**Excepciones:** si el aviso pide celular verificado, también se pide (`BR-TRU-004`).

### BR-ACC-004 — Datos opcionales
**Aplica a:** perfil.
**Condición:** siempre.
**Comportamiento:** foto, bio de hasta 300 caracteres, tipo de trabajo (FIFO, DIDO, BIBO u otro), roster y celular son opcionales. Después del primer mensaje se sugiere completarlos, sin bloquear nada.
**Excepciones:** el celular es obligatorio para publicar (`BR-LST-003`).

### BR-ACC-005 — El borrador sobrevive al registro
**Aplica a:** gate de registro.
**Condición:** un visitante escribe un mensaje y toca "Send".
**Comportamiento:** el texto y las fechas se guardan en la sesión del navegador. Después del registro y del perfil mínimo, la persona vuelve al mismo aviso con el borrador cargado y confirma el envío con un toque. El borrador se borra al enviar.
**Excepciones:** si el aviso dejó de estar activo durante el registro, se avisa y no se crea la conversación.

### BR-ACC-006 — Misma persona, dos métodos
**Aplica a:** login.
**Condición:** alguien entra con Google usando un email que ya tiene cuenta con contraseña.
**Comportamiento:** se vincula a la misma cuenta. No se crean cuentas duplicadas.
**Excepciones:** ninguna.

### BR-ACC-007 — Baja de cuenta
**Aplica a:** "Privacy and data".
**Condición:** el usuario pide eliminar su cuenta.
**Comportamiento:** se piden dos confirmaciones. Después:
- Se borran el perfil, el roster, las fotos, los guardados y las alertas.
- Sus avisos pasan a `removed`.
- En las conversaciones, sus mensajes quedan para la otra persona con el autor "Deleted user".

Los reportes que lo involucran se conservan según `BR-PRV-003`.
**Excepciones:** con un reporte abierto contra la cuenta, la baja se hace igual, pero los datos del reporte se conservan hasta cerrarlo.

---

## 8. Mensajes (MSG)

### BR-MSG-001 — Una conversación por persona y aviso
**Aplica a:** consultas.
**Condición:** quien busca escribe sobre un aviso.
**Comportamiento:** si ya hay una conversación entre esas dos personas sobre ese aviso, el mensaje se agrega ahí. Si no, se crea.
**Excepciones:** ninguna.

### BR-MSG-002 — La consulta lleva fechas
**Aplica a:** primer mensaje.
**Condición:** quien busca envía la primera consulta.
**Comportamiento:** la consulta lleva fechas de entrada y salida (precargadas desde la búsqueda) y, si tiene, un resumen de su roster. Si alguna noche pedida no está disponible, se avisa antes de enviar ("3 of these nights aren't available"), pero se permite enviar. Las fechas quedan guardadas tal como se enviaron.
**Excepciones:** ninguna.

### BR-MSG-003 — Formato del mensaje
**Aplica a:** chat.
**Condición:** se envía un mensaje.
**Comportamiento:** solo texto, de 1 a 1.000 caracteres. No hay adjuntos en v0.1.
**Excepciones:** ninguna.

### BR-MSG-004 — Datos de contacto permitidos
**Aplica a:** chat.
**Condición:** un mensaje incluye teléfono, email, WhatsApp o links.
**Comportamiento:** se envía igual. SwingMate no bloquea ni oculta datos de contacto en v0.1.
**Excepciones:** ninguna.

### BR-MSG-005 — Conversación sobre un aviso no activo
**Aplica a:** chat.
**Condición:** el aviso pasa a paused, filled, hidden o removed.
**Comportamiento:** la conversación sigue abierta para las dos personas y muestra el estado del aviso ("This listing is paused").
**Excepciones:** si el aviso fue ocultado por un admin, la conversación se cierra para quien busca, con el texto "This listing was removed by SwingMate".

### BR-MSG-006 — Bloqueados y suspendidos
**Aplica a:** chat.
**Condición:** una persona bloqueó a otra, o una cuenta está suspendida.
**Comportamiento:** la persona bloqueada no puede iniciar ni seguir conversaciones con quien la bloqueó y no recibe aviso del bloqueo. Una cuenta suspendida no puede enviar mensajes ni publicar, pero puede leer sus conversaciones y descargar sus datos.
**Excepciones:** ninguna.

### BR-MSG-007 — Límite para cuentas nuevas
**Aplica a:** consultas.
**Condición:** una cuenta con menos de 7 días intenta iniciar su consulta número 11 del día.
**Comportamiento:** no se permite y se le dice que puede escribir más mañana. Las respuestas dentro de conversaciones existentes no tienen límite.
**Excepciones:** ninguna.

### BR-MSG-008 — Aviso automático de riesgo
**Aplica a:** chat y "Other house rules".
**Condición:** un mensaje pide dinero, transferencias, depósitos antes de ver el lugar, o documentos (pasaporte, licencia, recibos de sueldo).
**Comportamiento:** el mensaje se entrega igual. Quien lo recibe ve encima un aviso: "Never pay before seeing the place. Never send ID documents by chat." El chequeo es una lista de palabras en inglés, mantenida en el código.
**Excepciones:** ninguna.

---

## 9. Confianza y seguridad (TRU)

### BR-TRU-001 — Qué ve el host de quien le escribe
**Aplica a:** inbox del host.
**Condición:** el host abre una consulta.
**Comportamiento:** ve:
- Nombre, suburbio base, tipo de trabajo y roster.
- Fechas pedidas comparadas con su calendario.
- Si el email y el celular están verificados, y si tiene foto.
- Desde cuándo es miembro y su actividad ("New member · first message", "Messaged 2 hosts this month").
- Su bio.
**Excepciones:** ninguna.

### BR-TRU-002 — Qué ve quien busca del host
**Aplica a:** detalle del aviso.
**Condición:** alguien abre un aviso.
**Comportamiento:** ve el nombre del host, su foto si tiene, "Phone verified host", desde cuándo es miembro, si vive en el lugar o cuál es su roster y, cuando haya datos de al menos 5 conversaciones, el tiempo de respuesta habitual.
**Excepciones:** ninguna.

### BR-TRU-003 — Lo que nunca se muestra
**Aplica a:** todo el producto.
**Condición:** siempre.
**Comportamiento:** nunca se muestra a otro usuario el email, el teléfono, el empleador, el sitio de trabajo ni la dirección exacta.
**Excepciones:** lo que cada persona escriba por su cuenta en el chat (`BR-MSG-004`).

### BR-TRU-004 — Quién puede escribirle a un host
**Aplica a:** cuenta del host, consulta.
**Condición:** el host elige en "Who can message you".
**Comportamiento:** hay dos opciones:
- Cualquiera con email verificado. Es la opción por defecto.
- Solo personas con celular verificado. Si quien busca no lo tiene, se le pide verificarlo dentro del mismo envío, sin perder el borrador.
**Excepciones:** ninguna.

### BR-TRU-005 — Reportar y bloquear
**Aplica a:** detalle, perfil y conversación.
**Condición:** un usuario reporta o bloquea.
**Comportamiento:** el reporte tiene un motivo de una lista (Scam or asking for money, Fake listing or photos, Offensive or discriminatory, Unsafe behaviour, Spam, Other) y un texto opcional de hasta 500 caracteres. Reportar una conversación da permiso a un admin para leerla (`BR-ADM-002`). Bloquear es inmediato y se puede deshacer desde "Privacy and data".
**Excepciones:** ninguna.

### BR-TRU-006 — Sin inventario falso
**Aplica a:** producción.
**Condición:** siempre.
**Comportamiento:** en producción solo hay avisos y personas reales. Los datos de ejemplo existen solo en el entorno local y en los tests, siempre rotulados "Sample". El deploy falla si encuentra datos de ejemplo apuntando a producción (`engineering-constitution.md` §8).
**Excepciones:** ninguna.

### BR-TRU-007 — Antifraude en el registro
**Aplica a:** registro.
**Condición:** alguien se registra con email.
**Comportamiento:** se rechazan dominios de email descartables (lista en el código) y se usa un captcha invisible (`INT-004`).
**Excepciones:** ninguna.

### BR-TRU-008 — "Before you agree"
**Aplica a:** conversación.
**Condición:** siempre.
**Comportamiento:** cada conversación muestra a las dos partes una guía fija:
- Ver el lugar o hacer una videollamada antes de pagar.
- Mostrar el documento de identidad solo en persona, nunca por chat.
- Dejar el acuerdo por escrito.
- Depositar el bond en el Bond Administrator de WA cuando corresponda.
**Excepciones:** ninguna.
**Estado:** el texto legal lo valida el abogado antes del piloto.

---

## 10. Notificaciones (MAIL)

### BR-MAIL-001 — Mensaje nuevo
**Aplica a:** chat.
**Condición:** llega un mensaje y quien lo recibe no lo leyó en 10 minutos.
**Comportamiento:** se envía un email (`NTF-003`). Como máximo uno por conversación cada 60 minutos; los mensajes seguidos se agrupan en ese email.
**Excepciones:** el usuario puede apagarlo en "Notifications", salvo para la primera consulta de una conversación nueva, que siempre se avisa.

### BR-MAIL-002 — Recordatorio al host
**Aplica a:** consultas.
**Condición:** pasaron 48 horas desde la primera consulta y el host no respondió.
**Comportamiento:** se le manda un único recordatorio (`NTF-004`).
**Excepciones:** si el aviso ya no está activo, no se manda.
**Estado:** propuesta nuestra. La reunión del 25 Sep dice que el riesgo principal del chat es que la persona no vuelva.

### BR-MAIL-003 — Pregunta de resultado
**Aplica a:** consultas.
**Condición:** pasaron 14 días desde la primera consulta de una conversación.
**Comportamiento:** se manda a quien buscó un email con "Did you find a place through SwingMate?" y tres respuestas de un toque: Yes, here / Yes, somewhere else / Not yet (`NTF-005`). La misma pregunta aparece en la conversación. Se pregunta una sola vez por conversación.
**Excepciones:** ninguna.

### BR-MAIL-004 — Alertas
**Aplica a:** búsquedas guardadas.
**Condición:** se publica un aviso que da full o strong para una alerta.
**Comportamiento:** se manda como máximo un email por día por usuario, con todos los avisos nuevos (`NTF-007`). Cada alerta caduca a los 90 días, salvo que el usuario la renueve.
**Excepciones:** ninguna.

### BR-MAIL-005 — Todo email se puede apagar, salvo los de seguridad
**Aplica a:** emails.
**Condición:** siempre.
**Comportamiento:** los emails de producto tienen un link para apagarlos. No se pueden apagar los códigos, el reseteo de contraseña ni los avisos de moderación sobre la propia cuenta.
**Excepciones:** ninguna.

---

## 11. Administración (ADM)

### BR-ADM-001 — Acciones de moderación
**Aplica a:** panel de admin.
**Condición:** un admin resuelve un reporte.
**Comportamiento:** las acciones son ocultar el aviso, suspender la cuenta, advertir al usuario o descartar el reporte. Cada acción exige una nota y queda en un registro que no se puede editar ni borrar.
**Excepciones:** ninguna.

### BR-ADM-002 — Leer mensajes privados
**Aplica a:** panel de admin.
**Condición:** un admin quiere leer una conversación.
**Comportamiento:** solo puede leer las conversaciones que tienen un reporte abierto. Cada lectura queda registrada.
**Excepciones:** ninguna.

### BR-ADM-003 — Tiempo de respuesta
**Aplica a:** reportes.
**Condición:** llega un reporte.
**Comportamiento:** se le avisa por email a los admins en el momento. El objetivo es resolver en 24 horas.
**Excepciones:** ninguna.

### BR-ADM-004 — Quién es admin
**Aplica a:** cuentas.
**Condición:** siempre.
**Comportamiento:** solo un admin existente puede dar el rol de admin, y queda registrado. En el piloto, los admins son Maxi y Tomás.
**Excepciones:** el primer admin se asigna a mano en la base.

---

## 12. Privacidad (PRV)

### BR-PRV-001 — Datos en Australia
**Aplica a:** infraestructura.
**Condición:** siempre.
**Comportamiento:** la base, las fotos y los mensajes se guardan en la región de Sídney.
**Excepciones:** los proveedores de email y SMS procesan la dirección y el número para enviar (`integrations.md`).

### BR-PRV-002 — Fotos sin ubicación
**Aplica a:** subida de fotos.
**Condición:** se sube una foto.
**Comportamiento:** antes de subirla, se le borran los metadatos (EXIF, incluida la ubicación GPS), porque una foto de la casa con GPS revela la dirección exacta.
**Excepciones:** ninguna.

### BR-PRV-003 — Retención
**Aplica a:** datos personales.
**Condición:** se elimina una cuenta o un aviso, o se cierra un reporte.
**Comportamiento:** los avisos `removed` se borran a los 90 días. Las cuentas eliminadas se borran en el momento (`BR-ACC-007`). Los reportes y el registro de moderación se conservan 2 años y después se anonimizan.
**Excepciones:** ninguna.
**Estado:** los plazos son propuesta nuestra y los valida el abogado junto con la Privacy Policy.

### BR-PRV-004 — Descargar mis datos
**Aplica a:** "Privacy and data".
**Condición:** el usuario pide sus datos.
**Comportamiento:** recibe un archivo JSON con su perfil, roster, avisos, guardados, alertas y mensajes enviados.
**Excepciones:** ninguna.

---

## 13. Analytics (ANL)

### BR-ANL-001 — Qué se mide
**Aplica a:** todo el producto.
**Condición:** pasa un evento del funnel.
**Comportamiento:** se registra el evento con su nombre, la fecha, un id de sesión anónimo y el id de usuario si hay sesión. La lista cerrada de eventos y propiedades está en `observability.md` §2.
**Excepciones:** ninguna.

### BR-ANL-002 — Qué nunca se mide
**Aplica a:** analytics.
**Condición:** siempre.
**Comportamiento:** los eventos nunca llevan el texto de un mensaje, el email, el teléfono, la dirección ni el nombre.
**Excepciones:** ninguna.

---

## 14. Fuera de scope

Estas reglas **no** existen en v0.1. Si un issue las necesita, primero se propone el cambio acá.

- Pagos, reservas, cobro de bond, comisiones o suscripciones.
- Bloqueo u ocultamiento automático de datos de contacto en el chat.
- Verificación de identidad con documento (greenID, FrankieOne, Stripe Identity).
- Reseñas o puntajes entre usuarios.
- Que el host busque perfiles de quien busca y le escriba (reverse marketplace, v0.2).
- Filtros por género, edad o nacionalidad de quienes viven en la casa.
- Check-in y check-out por hora.

---

*Documento vivo. Cada regla nueva lleva su ID, su estado y la fuente que la justifica; una regla no se borra, se marca como reemplazada.*
