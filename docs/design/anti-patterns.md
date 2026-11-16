# SwingMate — Anti-patterns visuales y de tono

**Issue:** #103  
**Objetivo:** detectar y bloquear resultados genéricos, “AI-looking” o sin postura.

## 1. Anti-patterns visuales bloqueantes

No proponer ni aprobar:

- degradados neón o glow como identidad;
- fondo oscuro “tech” sin razón funcional;
- glassmorphism;
- blobs decorativos;
- ilustraciones vectoriales genéricas de personas;
- isométricos de producto;
- dashboard aesthetic para páginas de marketplace;
- hero con foto stock genérica de trabajador mirando al horizonte como solución visual por defecto;
- mockups de teléfono flotando como decoración;
- sombras grandes y difusas en cada bloque;
- borde redondeado idéntico en absolutamente todo;
- cada sección encerrada en una card;
- badges/pills para información que puede ser texto;
- tres feature cards idénticas con icono + título + dos líneas;
- iconos dentro de círculos de color sin necesidad;
- gradientes suaves crema/teal usados para “hacerlo premium”;
- usar color para sustituir jerarquía;
- carruseles innecesarios;
- porcentajes de fit;
- bloques de disponibilidad sin fecha/unidad temporal.

## 2. Señales de composición genérica

El reviewer debe marcar:

- simetría excesiva;
- mismo ancho, radio y sombra en todas las superficies;
- ritmo vertical idéntico sección por sección;
- “hero + 3 cards + testimonials + CTA” por inercia;
- demasiado texto centrado;
- uso repetitivo de `display:grid; grid-template-columns: repeat(3, 1fr)`;
- todos los espacios llenos;
- falta de un punto focal claro;
- desktop diseñado como tres columnas y mobile como simple apilado sin reconsiderar jerarquía.

## 3. Anti-patterns de marketplace

- esconder disponibilidad debajo de amenities;
- poner “fit” como score abstracto;
- demasiada metadata en la card;
- miniaturas tan pequeñas que la foto deja de ayudar;
- una galería con 8–10 thumbnails visibles;
- convertir el detalle en una sucesión de cajas iguales;
- mover el contacto a otra página sin razón;
- obligar al visitante a registrarse antes de entender el listing.

## 4. Anti-patterns de copy

Evitar salvo contexto real:

- revolutionary;
- seamless;
- effortless;
- unlock;
- empower;
- elevate;
- discover a better way;
- built for the modern;
- reimagine;
- game-changing;
- tailored just for you;
- perfect match;
- your journey starts here.

También evitar:

- frases de dos líneas donde bastan cuatro palabras;
- repetir el título en el subtítulo;
- explicar en copy lo que ya muestra la interfaz;
- tono excesivamente amistoso en validaciones;
- signos de exclamación decorativos.

## 5. Anti-patterns de contenido

- nombres, reviews o listings ficticios presentados como reales;
- métricas inventadas;
- “trusted by…” sin evidencia;
- superhost, ratings o response-time falsos;
- afirmar seguridad absoluta;
- asumir que todos los hosts son FIFO.

## 6. Test anti-AI antes de mostrar una propuesta

Responder sí/no:

1. ¿Podría cambiar el logo por otra startup y seguir funcionando igual?
2. ¿Hay tres cards iguales porque era la solución más fácil?
3. ¿La propuesta usa fotografías genéricas para compensar falta de dirección?
4. ¿La disponibilidad parece añadida después, en vez de diseñar alrededor de ella?
5. ¿El layout evita cualquier decisión editorial arriesgada?
6. ¿Hay demasiado redondeado, badges o sombras?
7. ¿El copy suena a marketing generado?
8. ¿Mobile es solo desktop apilado?
9. ¿El resultado parece una mezcla de Airbnb + SaaS?
10. ¿Hay algún elemento sin una razón de producto?

Si 3 o más respuestas indican problemas, la propuesta vuelve a iteración antes del checkpoint humano.
