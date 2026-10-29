# Decision log — SwingMate

> **Propósito.** Registra las decisiones de producto y técnicas: qué se evaluó, qué se eligió, por qué y quién lo decidió. También lista lo que falta decidir, cada punto con nuestra recomendación.
>
> **Cómo se usa.** Antes de reabrir un tema, se busca acá. Una decisión nueva entra con su ID (`DEC-NNN`); una pendiente, con `Q-NN`. Cuando una pendiente se resuelve, se mueve a decisiones con la fecha y quién decidió.
>
> **Qué NO va en este documento.** Las reglas que resultan de cada decisión (están en `business-rules.md` y se citan desde acá) ni el detalle técnico (`engineering-constitution.md`).
>
> **Regla de trabajo entre socios.** Maxi y Tomás deciden como socios. Toda pregunta para Tomás lleva lo que haríamos nosotros y por qué. Cuando no coincidimos con una propuesta, lo decimos con razones y evidencia (Maxi, 27 y 29 Oct 2026).

---

## Índice

1. Pendientes, con nuestra recomendación
2. Decisiones de producto
3. Decisiones técnicas
4. Descartadas que podrían volver

---

## 1. Pendientes, con nuestra recomendación

Las que bloquean el piloto del 6 Dic están marcadas con (\*).

### Q-01 (\*) — Términos, Privacidad y consulta con el abogado
**Pregunta:** ¿quién agenda la consulta y para cuándo?
**Lo que haríamos nosotros:** agendarla antes del 20 Nov y llevar una lista cerrada de temas:
- Terms y Privacy Policy.
- El rol de SwingMate como intermediario que no negocia ni cobra.
- Qué reglas de convivencia son lícitas en WA (género, parejas).
- Boarders y lodgers.
- Los plazos de retención de `BR-PRV-003`.
- El texto de "Before you agree".

**Por qué:** sin Términos y Privacidad no se puede abrir el registro a usuarios reales (`SEC-20`), y ninguna de las consultas a profesionales tiene reunión registrada (Revisión integral, 18 Oct).
**Dueño propuesto:** Tomás, porque el ABN está a su nombre.

### Q-02 (\*) — Stack técnico
**Pregunta:** ¿confirmamos el stack de `DEC-101`?
**Lo que haríamos nosotros:** confirmarlo. Sería HTML y JavaScript sin framework en GitHub Pages, con Supabase (Postgres, login, fotos, chat en tiempo real) en Sídney.
**Por qué:**
- Quedan 5 semanas y media hasta el 6 Dic.
- Es el mismo patrón con el que Maxi ya armó Catálogo web y Pueyrredón.
- Cuesta cero en el piloto.
- El Web MVP §14 ya proponía Supabase.

**Lo que perdemos:** el SEO de las páginas de avisos es más débil sin render en servidor. Para un piloto con usuarios conocidos no importa. Si después hace falta, la base, las reglas y `core/` se reutilizan con Next.js.

### Q-03 (\*) — Pagar los SMS de verificación
**Pregunta:** ¿aprobamos el único costo variable del piloto?
**Lo que haríamos nosotros:** sí, con una tarjeta de SwingMate en Twilio y límite de gasto de US$10.
**Por qué:** cada SMS a Australia cuesta US$0,0515 (Twilio, consultado el 29 Oct). Verificar 20 hosts cuesta menos de US$5. El celular obligatorio para publicar es la decisión D10 y nuestra principal defensa contra avisos falsos.
**Alternativa gratis (recomendada desde el 29 Oct, pendiente de Maxi):** sin SMS en el piloto. El host se verifica en el alta asistida por videollamada (`Q-14`) y el admin le pone el sello "Verified by SwingMate". Perdemos la verificación de celular de quien busca y el filtro "Only people with a verified phone". Cambia D10 y `BR-LST-003`. La prueba de Twilio no sirve: solo manda a números verificados en la cuenta.

### Q-04 (\*) — DNS de swingmate.au
**Pregunta:** ¿Tomás puede cargar los registros DNS del dominio?
**Lo que haríamos nosotros:** sí, antes del 20 Nov, con dos cambios:
- Un `CNAME` hacia GitHub Pages.
- Los registros SPF, DKIM y DMARC que pide Resend para mandar emails como `@swingmate.au`.

Mientras tanto se desarrolla en `malbeldas.github.io/swingmate`.
**Por qué:** sin dominio verificado los emails caen en spam o no salen (`INT-002`), y los códigos de registro son obligatorios.

### Q-05 — Cuentas de servicio a nombre de SwingMate
**Pregunta:** ¿con qué cuenta abrimos Supabase, Resend, Twilio, Google Cloud y Turnstile?
**Lo que haríamos nosotros:** con `admin@swingmate.au` y 2FA. Ese buzón puede ser un reenvío gratuito del dominio a Maxi y Tomás. Las dos personas tendrían acceso.
**Por qué:** si las cuentas quedan en el email personal de uno, el otro no puede operar ni recuperar nada.

### Q-06 (\*) — Plan de Supabase al abrir a usuarios reales
**Pregunta:** ¿seguimos en el plan gratuito o pasamos a Pro (US$25 por mes) el día del piloto?
**Lo que haríamos nosotros:** gratuito durante el desarrollo y Pro desde el 6 Dic.
**Por qué:** el plan gratuito no tiene backups y pausa el proyecto después de una semana sin actividad (supabase.com/pricing, consultado el 29 Oct). Con usuarios reales, perder mensajes y avisos por una falla no tiene arreglo. Pro trae backups diarios por 7 días.
**Alternativa gratis (recomendada desde el 29 Oct, pendiente de Maxi):** seguir gratis con un ping diario para que no se pause y un `pg_dump` diario cifrado hecho por GitHub Actions, guardado 7 días. Las fotos no entran en ese backup y restaurar es manual.

### Q-07 (\*) — Captación de los primeros 10 a 20 hosts
**Pregunta:** ¿quién lidera la captación y desde cuándo?
**Lo que haríamos nosotros:** que la lidere Tomás desde el 15 Nov, con su red y los grupos FIFO de Facebook. Haríamos onboarding asistido (cargar el aviso juntos por videollamada) y empezaríamos por Perth sur (Rockingham, Baldivis, Kwinana).
**Por qué:**
- Sin oferta real, el piloto no prueba nada.
- El inventario falso está prohibido (`BR-TRU-006`).
- Los grupos de Facebook de Perth tienen entre 100 y 190 mil miembros (investigación del 18 Oct).

### Q-08 — Alcance del 6 Dic
**Pregunta:** ¿qué entra en la URL del 6 Dic y qué dos semanas después?
**Lo que haríamos nosotros:** dividirlo en dos entregas.
- **6 Dic:** buscar, ver el detalle, escribir con registro, publicar con celular, inbox, chat, emails de mensaje nuevo, reportes y admin.
- **20 Dic:** alertas, recordatorio al host, pregunta de resultado, confirmación de calendario y descarga de datos.

**Por qué:** lo del 20 Dic no hace falta para que se produzca el primer contacto, y la pregunta de resultado recién se manda a los 14 días de la primera consulta.

### Q-09 — "Half the rent" literal
**Pregunta:** ¿Tomás acepta usar el beneficio sin la cifra ("split the rent")?
**Lo que haríamos nosotros:** sí, y decir la cifra recién cuando el piloto mida un ahorro real.
**Por qué:** SwingMate no fija precios y las rentas van de AUD 200 a 500 por semana. Prometer "la mitad" puede ser falso en muchos avisos, y la Australian Consumer Law (s18) prohíbe afirmaciones engañosas aunque no haya intención. Ver la respuesta del 27 Oct.
**Estado:** enviada a Tomás el 27 Oct. Sin respuesta registrada.

### Q-10 — "+" en las reglas de la casa
**Pregunta:** ¿Tomás acepta el campo "Other house rules" en lugar de un "+" por cada regla?
**Lo que haríamos nosotros:** sí. Ver `BR-LST-005`.
**Por qué:**
- Una regla libre no se puede filtrar.
- Puede discriminar: la preferencia de género aparece en 7 de 15 posts de Facebook, y hay que revisarla con el abogado.
- Airbnb resuelve lo mismo con un campo de "additional rules".

En features y extras FIFO el "+" va tal cual (`BR-LST-006`).
**Estado:** enviada a Tomás el 27 Oct. Sin respuesta registrada.

### Q-11 — Propuestas nuestras sin validar
**Pregunta:** ¿aceptamos estas reglas tal como están en `business-rules.md`?

| Regla | Propuesta |
|---|---|
| BR-ROS-002 | Patrón "Other" con días de 1 a 42 |
| BR-SRC-003 | Radio de 15 km para suburbios y 40 km para ciudades |
| BR-LST-001 | Mínimo 3 fotos |
| BR-LST-007 | Máximo 5 avisos por cuenta |
| BR-AVL-006 | Pedir confirmación del calendario cada 30 días |
| BR-MAIL-002 | Recordatorio al host a las 48 h |
| BR-MSG-007 | Máximo 10 conversaciones nuevas por día en cuentas de menos de 7 días |
| BR-PRV-003 | Plazos de retención |

**Lo que haríamos nosotros:** aceptarlas para el piloto y revisarlas con datos a fin de enero.
**Por qué:** son límites chicos, fáciles de cambiar, y sin ellos hay que inventarlos en el código.

### Q-12 — Quién cubre los reportes
**Pregunta:** ¿cómo cumplimos la respuesta en 24 h (`BR-ADM-003`)?
**Lo que haríamos nosotros:** que los dos sean admins y que Tomás cubra el horario de Perth. Maxi cubre lo que llegue de noche en Australia, que es de día en Argentina.
**Por qué:** las 11 horas de diferencia nos dan cobertura casi completa sin guardias.

### Q-13 (\*) — Objetivos del piloto
**Pregunta:** ¿qué números tienen que pasar para decir que el piloto funcionó?
**Lo que haríamos nosotros:** fijarlos antes del 6 Dic para el 31 Ene. Como punto de partida para discutir proponemos:
- 15 avisos activos.
- 60% de las consultas con respuesta en 48 h.
- 5 respuestas "Yes, through SwingMate".

**Por qué:** sin objetivos escritos antes de empezar, cualquier resultado parece bueno. Los números son una propuesta nuestra sin un benchmark propio detrás. La tasa de respuesta es la métrica que más importa, porque la reunión del 25 Sep identificó la falta de respuesta como el riesgo principal.

### Q-14 (\*) — Alta de hosts en el piloto
**Pregunta:** ¿el host publica solo o con nosotros?
**Lo que haríamos nosotros:** alta asistida por videollamada de 15 minutos: cargamos el aviso juntos y verificamos identidad. El alta sin asistencia queda para después del piloto.
**Por qué:** con 20 hosts es manejable, da avisos de calidad y reemplaza al SMS (`Q-03`). Decide Maxi. Destraba #13.

### Q-15 — Respuesta rápida del host
**Pregunta:** ¿qué hace un host que no puede recibir a quien le escribe?
**Lo que haríamos nosotros:** un botón "Sorry, not available" que responde con un toque y cuenta como respuesta.
**Por qué:** el host no queda mal por no contestar y quien busca no espera en vano. Decide Maxi. Destraba #22.

### Q-16 — Cierre del acuerdo
**Pregunta:** ¿cómo sabemos que hubo convivencia?
**Lo que haríamos nosotros:** el host marca el aviso como "Filled" y elige si fue con alguien de SwingMate; a los 14 días se pregunta a los dos (`UC-052`).
**Por qué:** es la única forma de medir la meta del piloto (`Q-13`). Decide Maxi. Destraba #14 y #33.

### Q-17 — Canal de avisos
**Pregunta:** ¿avisamos de mensajes nuevos solo por email?
**Lo que haríamos nosotros:** sí, solo email en el piloto; sin WhatsApp ni push.
**Por qué:** WhatsApp cuesta y pide aprobación de Meta; push pide permisos que en el piloto no vale la pena pedir. Deciden Maxi y Tomás. Destraba #26.

### Q-18 — Visitas a la casa
**Pregunta:** ¿SwingMate agenda las visitas?
**Lo que haríamos nosotros:** no; se coordinan en el chat con "Before you agree" a mano.
**Por qué:** agendar es otro producto y no hace falta para el primer contacto. Decide Maxi.

### Q-19 (\*) — Precio para quien solo está en R&R
**Pregunta:** ¿qué precio ve alguien que solo duerme en la ciudad durante su R&R?
**Lo que haríamos nosotros:** el precio semanal completo del host, más un tilde "Open to splitting with an opposite-swing housemate". Medimos cuántos lo marcan antes de modelar precios por noche.
**Por qué:** el precio por noche complica el fit y el calendario y nadie lo pidió todavía. Deciden Maxi y Tomás. Destraba #13 y #17.

### Q-20 — Un aviso, una habitación
**Pregunta:** ¿un aviso puede tener varias habitaciones?
**Lo que haríamos nosotros:** no; quien tiene dos habitaciones publica dos avisos.
**Por qué:** simplifica el calendario y el fit. Decide Maxi. Destraba #13.

### Q-21 (\*) — Etiqueta "Swing share"
**Pregunta:** ¿distinguimos una casa compartida por swing de una habitación libre?
**Lo que haríamos nosotros:** sí, con la etiqueta "Swing share" cuando la disponibilidad sale del roster del host.
**Por qué:** es la diferencia de SwingMate y quien busca tiene que saber que comparte con alguien de swing opuesto. Deciden Maxi y Tomás. Destraba #13 y #17.

### Q-22 (\*) — Estado vacío con pocos avisos
**Pregunta:** ¿qué ve quien busca el 6 Dic si no hay avisos que le sirvan?
**Lo que haríamos nosotros:** un estado vacío que ofrece crear una alerta. Adelantamos las alertas (#31) a D2 y pasamos la vista de métricas (#29) a D3; los eventos se registran desde el día uno.
**Por qué:** sin alerta, quien no encuentra nada no vuelve; nunca se muestran avisos de ejemplo (`BR-TRU-006`). Deciden Maxi y Tomás. Destraba #16 y #31.

### Q-23 — Estadía mínima
**Pregunta:** ¿la estadía mínima del host filtra resultados?
**Lo que haríamos nosotros:** no; se muestra como dato en la card y el detalle.
**Por qué:** con pocos avisos, filtrarla vacía la lista. Decide Maxi. Destraba #17.

### Q-24 — Logo en vector
**Pregunta:** ¿tenemos el archivo original del logo?
**Lo que haríamos nosotros:** que Tomás pase el vector (SVG, AI o PDF) del logo de Instagram; no se redibuja, solo se adapta.
**Por qué:** hoy el favicon y el encabezado usan una adaptación. Decide Tomás.

### Q-25 — Diseños de celular
**Pregunta:** ¿hacemos diseños de celular antes de programar?
**Lo que haríamos nosotros:** no; se construye primero para celular desde los tokens de `design-system.md` y Tomás revisa capturas a 375 y 1280 px en cada entrega, sin Figma.
**Por qué:** los diseños aprobados son de escritorio y no hay tiempo para otra ronda. Decide Tomás.

### Q-26 — Fotos de portada y páginas
**Pregunta:** ¿qué fotos usamos fuera de los avisos?
**Lo que haríamos nosotros:** fotos propias de Perth o de trabajadores reales con permiso; nada de stock que parezca un aviso.
**Por qué:** una foto de stock con aspecto de aviso se lee como inventario falso. Decide Tomás. Destraba #20.

### Q-27 — Textos de interfaz
**Pregunta:** ¿quién escribe los textos en inglés australiano?
**Lo que haríamos nosotros:** los escribimos desde `glossary.md` y Tomás los revisa en cada demo; los legales esperan a `Q-01`.
**Por qué:** Tomás conoce el tono local y revisar es más rápido que redactar. Decide Tomás.

## 2. Decisiones de producto

| ID | Fecha | Decisión | Quién | Alternativas descartadas | Reglas |
|---|---|---|---|---|---|
| DEC-001 | 25 Sep 2026 | Web responsive primero; app nativa después si la validación lo justifica. | Tomás | App nativa | — |
| DEC-002 | 25 Sep 2026 | Una sola cuenta que puede buscar, publicar o ambas. | Tomás | Cuentas separadas de host e inquilino | BR-ACC-001 |
| DEC-003 | 25 Sep 2026 | Chat dentro de SwingMate, sin bloquear datos de contacto. | Tomás | Bloquear teléfonos y links | BR-MSG-004 |
| DEC-004 | 25 Sep 2026 | Nunca inventario falso en producción. | Recomendación aceptada | Casas o perfiles inventados para que el sitio no se vea vacío | BR-TRU-006 |
| DEC-005 | 25 Sep 2026 | El host no necesita roster; la disponibilidad es del aviso. | Tomás | Disponibilidad igual al roster del host | BR-AVL-001 |
| DEC-006 | 6 Oct 2026 | Búsqueda = ubicación + fechas + roster opcional. Las fechas mandan. | Tomás y Maxi | Solo por roster | BR-SRC-001 |
| DEC-007 | 6 Oct 2026 | Se navega sin cuenta; el registro aparece al enviar el primer mensaje y el borrador se conserva. | Tomás y Maxi | Registro para ver avisos | BR-ACC-005 |
| DEC-008 | 6 Oct 2026 | Cards con foto grande y 4 semanas con fechas; nada de bloques sin unidad de tiempo. | Tomás y Maxi | Puntaje numérico, bloques abstractos | BR-FIT-002 |
| DEC-009 | 18 Oct 2026 | D1 a D9 de la Revisión integral, todos aceptados como los recomendamos (fit por defecto, etiquetas, perfil mínimo, celular opcional para quien busca, guardados, resultado a 14 días, Google + email, "No fixed roster"). | Maxi | Ver Revisión integral | BR-FIT-003, BR-FIT-002, BR-ACC-003, BR-TRU-004, BR-MAIL-003, BR-ACC-002, BR-ROS-005 |
| DEC-010 | 18 Oct 2026 | D10: el host verifica su celular para publicar. | Maxi | Opcional | BR-LST-003 |
| DEC-011 | 27 Oct 2026 | D7: el tagline es "Different swings. Same home."; "half the rent" va como atributo en otro lugar. | Tomás y Maxi | "Different weeks off. Half the rent." | — |
| DEC-012 | 27 Oct 2026 | Cálculo por noches con la noche de viaje del último día del swing. | Tomás (observación) y Maxi | Por días | BR-ROS-003 |
| DEC-013 | 27 Oct 2026 | Cards de la home 2 por fila con fechas e iconos; estructura tipo Flatmates pero conservando la tira de 4 semanas. | Tomás y Maxi | Calendario mensual en la card | BR-FIT-005 |
| DEC-014 | 27 Oct 2026 | Mapa de zona aproximada, nunca la dirección. | Tomás y Maxi | Pin exacto | BR-LST-004 |
| DEC-015 | 27 Oct 2026 | Tomás lidera lo visual y la estética; Maxi lidera los flujos. Las propuestas de uno se discuten con razones. | Maxi y Tomás | — | — |

## 3. Decisiones técnicas

| ID | Fecha | Decisión | Quién | Alternativas descartadas | Por qué |
|---|---|---|---|---|---|
| DEC-101 | 29 Oct 2026 | Stack: HTML/JS sin build en GitHub Pages + Supabase en Sídney. **Pendiente de confirmar (Q-02).** | Propuesta de Claude | Next.js + Supabase en Vercel (el plan gratuito de Vercel no permite uso comercial); Firebase (base NoSQL: las consultas por fechas y los permisos por fila son más simples en Postgres) | Tiempo, costo cero, patrón conocido |
| DEC-102 | 29 Oct 2026 | Specs en nivel `full`, en `specs/`. | Maxi (pidió seguir los skills) | `light` en un solo `SPEC.md` | 150+ horas, varias superficies (público, host, admin, emails), datos personales y legales |
| DEC-103 | 29 Oct 2026 | Repo público `malbeldas/swingmate`. | Maxi | Privado con GitHub Pro (US$4/mes) u otro hosting | GitHub Pages gratis y mismo flujo que Catálogo web. Lo sensible queda en Drive. |
| DEC-104 | 29 Oct 2026 | El fit se calcula en el navegador con `core/fit.js`; la base devuelve la disponibilidad por noche. | Propuesta de Claude | Materializar el fit en una tabla (Reglas §23) | Con decenas o cientos de avisos alcanza y deja la lógica en un solo lugar testeable |
| DEC-105 | 29 Oct 2026 | Analytics y errores en una tabla propia de Postgres. | Propuesta de Claude | GA4, PostHog, Sentry | Sin scripts de terceros ni cookies, y control total de qué se mide (`BR-ANL-002`) |
| DEC-106 | 29 Oct 2026 | El host marca su casa tocando el mapa; no se usa geocodificación externa. | Propuesta de Claude | Google Places, Mapbox | La dirección no sale a terceros y cuesta cero |

## 4. Descartadas que podrían volver

| Tema | Por qué se descartó | Cuándo revisarlo |
|---|---|---|
| Login con Apple | Más trabajo sin evidencia de demanda (D8) | Si se hace app nativa |
| Verificación de identidad con documento | Costo, privacidad y legal (25 Sep, 6 Oct) | Cuando haya acuerdos o pagos en la plataforma |
| Reverse marketplace (host busca personas) | Duplica flujos y moderación (25 Sep) | v0.2, con datos del piloto |
| SMS por mensajes nuevos | Costo por mensaje (Messaging §11) | Si la tasa de respuesta del piloto es baja |
| Render en servidor para SEO | No hace falta en el piloto | Cuando SEO sea canal de adquisición |

---

*Documento vivo. Una decisión no se borra: si cambia, se agrega una nueva que la reemplaza y se marca la vieja.*
