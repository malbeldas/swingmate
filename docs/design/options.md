# SwingMate — Visual exploration options

**Issue:** #103  
**Estado:** PROPONER  
**Punto de aprobación:** B

Estas opciones son deliberadamente divergentes. Cambian jerarquía, ritmo, proporción entre fotografía/datos y carácter editorial. No son skins del mismo wireframe.

---

## Opción A — Marketplace editorial

### Postura

SwingMate se siente como un marketplace de alojamiento confiable y visual, con una capa editorial más marcada que un portal inmobiliario convencional.

### Home

- Hero asimétrico.
- Promesa corta y búsqueda visible en el primer viewport.
- Fotografía con peso real, pero sin “trabajador mirando al horizonte” como cliché.
- El roster aparece como un atributo de búsqueda y como evidencia visual secundaria.
- Evitar la clásica secuencia hero + 3 feature cards + CTA.

### Search results

Card grande, con proporción foto/contenido cercana a 45/55 en desktop.

Jerarquía:

1. foto;
2. título + ubicación;
3. precio;
4. disponibilidad 4 semanas;
5. fit compacto;
6. un máximo de 2–3 facts.

No usar una card dentro de otra card para el calendario.

### Listing detail

- Galería asimétrica con 1 imagen dominante + 2 secundarias.
- Título y precio respiran fuera de cajas.
- Calendario ampliado como bloque utilitario, visualmente más rígido.
- Panel de contacto sticky en desktop.
- Host integrado cerca del contacto, no como sección aislada gigante.
- Descripción y amenities más abajo.

### Decisión editorial

El producto alterna superficies abiertas y bloques funcionales. La casa seduce; el calendario valida.

### Qué sacrifica

- algo de densidad informativa;
- menor protagonismo inicial del roster.

### Referencias ancla

- Flatmates: escala de cards y lectura rápida.
- Booking: composición de galería.
- Airbnb: respiración y progresión del detalle.

### Anti-patterns que evita

- SaaS cards everywhere;
- score de fit;
- gallery wall de thumbnails;
- tres columnas simétricas de beneficios.

---

## Opción B — Roster utility

### Postura

SwingMate se siente como una herramienta especializada de decisión para trabajadores con roster. La disponibilidad organiza toda la experiencia.

### Home

- Hero más seco, casi de producto.
- Search + roster/fechas ocupan el primer plano.
- Visualización compacta de “nights you need” cerca del hero.
- Fotografía secundaria o como banda lateral.

### Search results

Card dividida en dos zonas muy claras:

- propiedad;
- disponibilidad.

Jerarquía:

1. fit + precio;
2. 4 semanas de disponibilidad;
3. foto;
4. título/ubicación;
5. facts.

El calendario puede ocupar hasta 40% del ancho de card en desktop.

### Listing detail

- Calendario ampliado cerca del título.
- Gallery más pequeña.
- Reasons concretas visibles.
- Contacto ligado explícitamente a fechas.
- Menos amenities above-the-fold.

### Decisión editorial

El producto se comporta más como una herramienta de planificación que como un portal de habitaciones.

### Qué sacrifica

- impacto fotográfico;
- familiaridad de marketplace;
- cierta calidez.

### Referencias ancla

- herramientas de planificación;
- interfaces de travel availability;
- patrón de contacto de Flatmates.

### Anti-patterns que evita

- foto como decoración;
- fit escondido;
- amenities por encima de compatibilidad.

---

## Opción C — Minimalismo extremo / listings as media

### Postura

SwingMate reduce al mínimo toda la interfaz. Grandes fotografías, mucha tipografía y muy pocas superficies. El roster aparece casi como una “capa de anotación” sobre contenido editorial.

### Home

- Titular grande.
- Una sola imagen o composición visual fuerte.
- Barra de búsqueda flotante o integrada al borde inferior del hero.
- Casi sin cards explicativas.
- La propuesta FIFO se explica con una sola visual de roster + una línea.

### Search results

Listado con mucho aire.

Cada item:

1. imagen grande;
2. título y precio;
3. una única línea de metadata;
4. 4 semanas como tira finísima, sin caja;
5. fit como texto/badge mínimo.

Filtros secundarios en drawer/sheet, no ocupando una columna permanente en desktop.

### Listing detail

- Gallery dominante.
- Contenido en una columna amplia.
- Contacto en rail sticky muy limpio.
- Calendario mensual abierto, sin card exterior.
- Amenities como lista editorial.
- Host reducido a una ficha pequeña, no a un módulo grande.

### Decisión editorial

El diseño apuesta por edición y proporción, no por componentes.

### Qué sacrifica

- menor densidad;
- menos controles visibles de una vez;
- mayor dependencia de una buena jerarquía tipográfica.

### Referencias ancla

- layouts editoriales de travel/lifestyle;
- Airbnb solo como referencia de respiración, no como identidad.

### Anti-patterns que evita

- border-radius everywhere;
- dashboard aesthetic;
- exceso de filtros visibles;
- secciones repetitivas.

---

## Comparación

| Criterio | A — Marketplace editorial | B — Roster utility | C — Minimalismo extremo |
|---|---|---|---|
| Familiaridad | Alta | Media | Media |
| Diferenciación FIFO | Alta | Muy alta | Alta |
| Protagonismo foto | Alto | Medio | Muy alto |
| Protagonismo disponibilidad | Alto | Muy alto | Medio/alto |
| Densidad | Media | Alta | Baja |
| Riesgo de sobrecarga | Bajo | Alto | Bajo |
| Carácter editorial | Alto | Bajo/medio | Muy alto |
| Encaje con feedback reciente | Muy alto | Medio | Alto |
| Riesgo de parecer genérico | Bajo si se ejecuta bien | Bajo | Medio si cae en “Airbnb clone” |

## Recomendación inicial

**A — Marketplace editorial**, tomando de B la claridad de disponibilidad y de C la reducción de superficies/cards.

No mezclar las tres sin criterio. La combinación recomendada es específica:

- estructura base de A;
- rigor de disponibilidad de B;
- disciplina visual y espacio negativo de C.

## Gate antes de prototipar

1. Estructura en blanco y negro.
2. Checkpoint humano.
3. Aplicación de dirección de arte.
4. Revisor visual anti-genérico.
5. Solo después: captura/prototipo para aprobación.

## Punto de aprobación B

El usuario debe elegir explícitamente:

- A;
- B;
- C;
- o una combinación concreta de componentes, indicando cuál es la estructura dominante.

No se considera aprobada por silencio.
