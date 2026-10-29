# Glossary — SwingMate

> **Propósito.** Define el vocabulario compartido entre negocio, diseño y código. Cuando un término de este glosario aparece en otro spec, en un issue o en el código, significa exactamente lo que dice acá.
>
> **Cómo se usa.** Se consulta antes de nombrar una tabla, una función, una pantalla o un texto de la interfaz. Si aparece un término nuevo del dominio, se agrega acá antes de usarlo en otro lado.
>
> **Qué NO va en este documento.** Las reglas que usan estos términos (`business-rules.md`), los flujos (`use-cases.md`), las tablas (`schema.md`) y las decisiones con su porqué (`decision-log.md`).
>
> **Idioma.** Los specs están en español. La interfaz del producto está en inglés australiano, porque el mercado es Australia. La columna "En la interfaz" da el texto exacto que ve el usuario.

---

## Índice

1. Personas y roles
2. Roster y tiempo
3. Alojamiento y disponibilidad
4. Matching
5. Contacto y confianza
6. Operación
7. Términos técnicos

---

## 1. Personas y roles

| Término | En la interfaz | Definición en SwingMate |
|---|---|---|
| Visitante | — | Persona sin sesión iniciada. Puede buscar y ver avisos, y escribir un mensaje que se envía recién cuando se registra. |
| Usuario | — | Persona con cuenta. Hay **un solo tipo de cuenta**: el mismo usuario puede buscar, publicar o ambas cosas. |
| Quien busca (seeker) | — | Usuario que necesita alojamiento. En el código: `seeker`. |
| Host | Host | Usuario que publica un alojamiento. No necesita ser FIFO. En el código: `host`. |
| Intención | "Find a place", "List a place", "Both" | Lo que el usuario declara al registrarse. Se guarda como capacidades (`is_seeking`, `is_hosting`) y se puede cambiar. |
| Admin | — | Persona del equipo de SwingMate que modera reportes. En el piloto: Maxi y Tomás. |
| Trabajador FIFO / DIDO / BIBO | FIFO, DIDO, BIBO | Fly-in fly-out, drive-in drive-out, bus-in bus-out. Trabaja en un sitio remoto por turnos y vuelve a la ciudad en su descanso. |

## 2. Roster y tiempo

| Término | En la interfaz | Definición en SwingMate |
|---|---|---|
| Roster | Roster | Patrón recurrente de días en el sitio y días en la ciudad, más una fecha que lo ancla en el calendario. Se escribe `ON:OFF` en días, por ejemplo `14:7`. |
| Swing | Swing | Tramo de días seguidos en el sitio de trabajo (ON, *away*). |
| R&R | R&R | Tramo de descanso en la ciudad (OFF, *home*). Es cuando quien busca necesita la cama. |
| Ciclo | — | Un swing más un R&R. En un 14:7 el ciclo dura 21 días. |
| Ancla (anchor) | "When does your next swing start?" | Fecha real del primer día de un swing. Con el ancla y el patrón se calcula cualquier fecha futura. |
| Vuelo a casa el último día | "Do you fly home on the last day of your swing?" | La persona vuela de vuelta el último día del swing y esa noche ya duerme en la ciudad. Por defecto: sí. |
| Vuelo al sitio el primer día | "Do you fly out on the first day of your next swing?" | La persona vuela el primer día del swing siguiente, así que duerme en la ciudad la última noche del R&R. Por defecto: sí. |
| Noche de viaje | Travel night | Noche del último día del swing, cuando la persona vuela a casa. Se necesita cama aunque el día cuente como swing. |
| Noche | Night | Unidad de cálculo de todo SwingMate. La noche *d* es la que empieza el día *d* y termina a la mañana del día *d+1*. |
| Noches que necesita (need nights) | "Nights you need" | Conjunto de noches en que quien busca necesita cama, dentro del horizonte. Salen de las fechas de búsqueda o, si no hay fechas, del roster. |
| Bloque | R&R break | Grupo de noches que necesita seguidas. Con roster, cada R&R (más su noche de viaje) es un bloque. Con fechas, la estadía entera es un bloque. |
| Horizonte | "next 12 weeks" | Ventana de 84 noches sobre la que se calcula el fit. Empieza hoy, o en la fecha de entrada si la búsqueda tiene fechas. |
| Sin roster fijo | "No fixed roster" | Opción para quien no tiene un patrón regular. Busca solo por fechas. |

## 3. Alojamiento y disponibilidad

| Término | En la interfaz | Definición en SwingMate |
|---|---|---|
| Aviso (listing) | Listing, home | Alojamiento publicado por un host. En el código: `listing`. |
| Tipo de lugar | "Private room", "Entire place" | Habitación privada en una casa compartida, o lugar entero (casa, departamento, granny flat, studio). |
| Disponibilidad | Available / Unavailable | Propiedad **del aviso**, no del host: qué noches se puede ocupar. Solo dos estados. |
| Regla de disponibilidad | — | Forma en que el host genera la disponibilidad: desde su roster, siempre disponible desde una fecha, o rangos de fechas. |
| Excepción | "Block nights", "Open nights" | Noche o rango que el host bloquea o abre sin cambiar la regla. |
| Estado del aviso | Draft, Active, Paused, Filled | Borrador, publicado, pausado por el host, ocupado. Además existen `hidden` (ocultado por un admin) y `removed` (eliminado por el host). |
| Zona aproximada | "Approximate area" | Círculo sobre el suburbio que se muestra en el mapa en lugar de la dirección. |
| Dirección exacta | — | Dato privado del aviso. Nunca se muestra en público; el host la comparte en el chat si quiere. |
| Bills | "Bills included", "Bills extra" | Gastos de luz, agua, gas e internet. |
| Bond | Bond | Depósito de garantía. SwingMate solo muestra el monto: no lo cobra ni lo guarda. |
| Extras FIFO (perks) | FIFO perks | Beneficios pensados para FIFO: guardado de equipaje, traslado al aeropuerto, tarifa solo por R&R. El host puede sumar los suyos con "+". |
| Otras reglas de la casa | "Other house rules" | Texto corto opcional del host (hasta 200 caracteres) que complementa las reglas fijas. No se usa para filtrar. |

## 4. Matching

| Término | En la interfaz | Definición en SwingMate |
|---|---|---|
| Fit | Fit | Qué tan bien la disponibilidad de un aviso cubre las noches que necesita quien busca. Se calcula con fechas reales, no con etiquetas de roster. |
| Cobertura | "Free for 30 of the 32 nights you need" | Noches que necesita y están disponibles, divididas por el total de noches que necesita. |
| Clase de fit | — | `full`, `strong`, `partial` o `poor`, según `BR-FIT-001`. |
| Etiqueta de fit | "Great roster fit", "Good date fit", "Partial fit" | Texto visible de la clase. Dice *roster fit* si la necesidad sale del roster y *date fit* si sale de las fechas. `poor` no tiene etiqueta porque no se muestra. |
| Near matches | "Show near matches" | Resultados de clase `partial`, ocultos por defecto. |
| Razones | Reasons | Frases que explican el fit con fechas concretas, por ejemplo "Not free the night of 1 Nov". |

## 5. Contacto y confianza

| Término | En la interfaz | Definición en SwingMate |
|---|---|---|
| Consulta (inquiry) | Message, inquiry | Primer mensaje de quien busca a un host sobre un aviso. Lleva fechas de entrada y salida estructuradas. |
| Conversación | Conversation | Hilo 1:1 entre quien busca y el host, siempre asociado a un aviso. Hay una sola por par de personas y aviso. |
| Gate de registro | — | Momento en que un visitante que tocó "Send" tiene que registrarse. El borrador se conserva. |
| Perfil mínimo | — | Lo que hace falta para enviar el primer mensaje: email verificado, nombre, suburbio base, intención y Términos aceptados (`BR-ACC-003`). |
| Suburbio base | "Where you're based" | Suburbio donde vive la persona. Es un dato de confianza para el host. |
| Celular verificado | "Phone verified" | Número confirmado con un código SMS. El host lo necesita para publicar; quien busca solo si el host lo pide. Nunca se muestra el número. |
| Ficha de quien consulta | "About Alex" | Bloque del inbox del host con las señales de confianza de quien le escribe (`BR-TRU-001`). |
| "Before you agree" | Before you agree | Guía fija en cada conversación: ver el lugar antes de pagar, ID solo en persona, acuerdo por escrito, bond en el Bond Administrator. |
| Reporte | Report | Aviso de una persona a SwingMate sobre un aviso, un usuario o una conversación. Lo atiende un admin. |
| Bloqueo | Block | Acción de un usuario que impide que otro le escriba. |
| Pregunta de resultado | "Did you find a place through SwingMate?" | Pregunta que se hace 14 días después del primer mensaje. Es la métrica de éxito del piloto. |
| Alerta | Alert | Búsqueda guardada que avisa por email cuando aparece un aviso nuevo que encaja. |

## 6. Operación

| Término | Definición en SwingMate |
|---|---|
| Piloto | Primera salida a usuarios reales conocidos, con objetivo 6 Dic 2026 en Perth. |
| Inventario falso | Avisos o personas inventados presentados como reales. Prohibido en producción (`BR-TRU-006`). |
| Datos de ejemplo | Avisos y personas ficticios, rotulados, que solo existen en el entorno local y en los tests. |
| Evento de analytics | Registro de una acción del funnel (por ejemplo `message_sent`) sin contenido de mensajes ni datos personales (`BR-ANL-001`). |

## 7. Términos técnicos

| Término | Definición |
|---|---|
| Supabase | Plataforma que da la base Postgres, el login, el almacenamiento de fotos, el tiempo real del chat y las funciones del servidor. |
| RLS | Row Level Security de Postgres: reglas en la base que deciden qué filas puede leer o escribir cada usuario. Es la principal barrera de seguridad, porque la web habla directo con la base (`security.md`). |
| Edge Function | Función de servidor en Supabase (Deno/TypeScript). Se usa solo para lo que no puede hacer el navegador: mandar emails, tareas programadas y acciones con permisos de admin. |
| RPC | Función de Postgres que la web llama como una API, por ejemplo `start_conversation`. |
| Núcleo de cálculo (`core/`) | Funciones puras de JavaScript sin DOM (noches, fit, fechas). Se testean con `node:test` y las usan la web y las Edge Functions. |
| Entorno local | Supabase corriendo en la máquina o en CI con la CLI, con datos de ejemplo. |
| Producción | Proyecto de Supabase en la región de Sídney más la web en GitHub Pages con el dominio `swingmate.au`. |

---

*Documento vivo. Cada término nuevo se agrega acá antes de usarse en otro spec o en el código.*
