# SwingMate — Visual exploration options

**Issue:** #103  
**Estado:** PROPONER  
**Punto de aprobación:** B

Estas opciones cambian jerarquía, composición y tarea optimizada. No son variaciones cosméticas.

---

## Opción A — Marketplace first

### Idea

SwingMate se presenta primero como un marketplace de alojamiento moderno y confiable. La especialización FIFO/DIDO/BIBO aparece como el diferenciador que hace mejores los resultados.

### Home

- Header limpio.
- Hero con fotografía/atmósfera de alojamiento.
- Propuesta de valor corta.
- Search module protagonista: Location + Dates + Roster.
- Roster presentado como mejora del resultado, no como formulario central de la portada.
- Sección corta de listings reales cuando haya inventario.
- “How it works” reducido a 3 pasos.

### Search results

Card horizontal en desktop y vertical en mobile.

Jerarquía:

1. foto grande;
2. título + suburbio;
3. precio;
4. tipo de lugar / dato esencial;
5. etiqueta pequeña de fit;
6. calendario compacto de 4 semanas.

La disponibilidad ocupa un área claramente legible, pero no transforma la card en una tabla.

### Listing detail

- Galería compacta: una imagen dominante + 2–3 secundarias en desktop.
- Menos thumbnails permanentes.
- Título, ubicación y precio inmediatamente después de la galería.
- Calendario ampliado como bloque principal de decisión.
- Facts y descripción después.
- Contact panel visible y sticky en desktop.
- Host debajo o integrado al panel de contacto.

### Qué optimiza

- confianza;
- atractivo visual;
- comparación rápida;
- familiaridad con marketplaces como Flatmates/Airbnb;
- menor curva de aprendizaje.

### Riesgos

- el roster puede sentirse secundario si no se comunica bien;
- una fotografía demasiado protagonista puede ocultar el diferencial de SwingMate;
- requiere buena disciplina para no convertirlo en “otro sitio de habitaciones”.

---

## Opción B — Roster first

### Idea

SwingMate se presenta como una herramienta especializada para encontrar alojamiento según los días en que realmente estás en ciudad. La disponibilidad y el fit son la identidad central del producto.

### Home

- Hero más utilitario.
- El roster/fechas se visualizan inmediatamente con una mini representación de próximas noches.
- Search module protagonista.
- Mensaje principal centrado en “nights you need”, no en la vivienda.
- Fotografía presente pero secundaria.

### Search results

Card con más peso del calendario.

Jerarquía:

1. título + precio + fit;
2. foto;
3. 4 semanas de disponibilidad;
4. reasons concretas;
5. metadata secundaria.

La card explica más claramente por qué encaja.

### Listing detail

- Calendario/fit cerca del título.
- Gallery visualmente más reducida.
- Reasons y disponibilidad por delante de amenities.
- Contact panel mantiene las fechas seleccionadas como contexto explícito.

### Qué optimiza

- diferenciación de SwingMate;
- usuarios con roster complejo;
- velocidad para descartar listings incompatibles;
- comprensión del valor funcional.

### Riesgos

- puede sentirse más herramienta que marketplace;
- mayor densidad cognitiva;
- nuevos usuarios pueden necesitar aprender el modelo antes de sentirse atraídos por el alojamiento.

---

## Comparación

| Criterio | A — Marketplace first | B — Roster first |
|---|---|---|
| Familiaridad | Alta | Media |
| Diferenciación FIFO | Media/Alta | Muy alta |
| Protagonismo de fotos | Alto | Medio |
| Protagonismo disponibilidad | Alto | Muy alto |
| Escaneabilidad casual | Muy alta | Alta |
| Explicabilidad del fit | Alta | Muy alta |
| Riesgo de sobrecarga | Bajo/medio | Medio/alto |
| Encaje con feedback visual reciente | Muy alto | Medio |

## Recomendación inicial

**Opción A — Marketplace first**, incorporando del enfoque B solo dos elementos:

1. disponibilidad de 4 semanas muy clara en cards;
2. una explicación de fit concreta en el detalle.

Motivo: el feedback reciente favorece cards grandes, minimalistas, photo-first y una progresión clara entre listado y detalle. El roster debe diferenciar SwingMate, pero no convertir cada listing en una interfaz analítica.

## Qué se prototipa después de la decisión

Una vez elegida la dirección se implementará únicamente:

- Home representativa;
- Search results con al menos una card completa;
- Listing detail representativo;

usando datos ficticios exclusivamente en el entorno de exploración/local y sin conectar lógica sensible nueva.

## Punto de aprobación B

Seleccionar:

- **A**,
- **B**, o
- **A con componentes concretos de B**.

La opción no se considera aprobada por silencio.
