# SwingMate — Experience brief

**Issue:** #103  
**Modo:** Evolución / composición guiada  
**Nivel visual:** L3 — flujo público principal  
**Estado:** Propuesta para punto de aprobación A

## 1. Objetivo de negocio

Convertir la web funcional actual en una experiencia de marketplace más clara, confiable y visualmente madura, sin cambiar las reglas de negocio ni el backend.

La tarea crítica es que una persona FIFO, DIDO o BIBO pueda:

1. entender rápidamente qué hace SwingMate;
2. buscar por ubicación, fechas y/o roster;
3. reconocer de un vistazo qué listings sirven para las noches que necesita;
4. evaluar el alojamiento y el host;
5. iniciar contacto sin perder contexto.

## 2. Público principal

Trabajadores FIFO, DIDO y BIBO en Australia que necesitan alojamiento durante sus R&R o estadías concretas en ciudad.

Público secundario: hosts con una habitación o vivienda disponible total o parcialmente.

## 3. Flujo piloto

**Home → Search results → Listing detail → Message intent**

El flujo de autenticación y conversación se conserva funcionalmente como está y se trabajará visualmente después de aprobar la dirección del recorrido público.

## 4. Qué ya está decidido y no se reabre en esta exploración

- Un solo tipo de cuenta.
- Se puede navegar sin registrarse.
- El registro ocurre al intentar enviar un mensaje.
- El borrador del mensaje y sus fechas sobreviven al registro.
- Una conversación por seeker + host + listing.
- No hay pagos, reservas ni contratos en v0.1.
- Las cards muestran 4 semanas con fechas legibles.
- No se muestran porcentajes de fit.
- No se inventa inventario real.
- Mobile first a 375 px.
- El logo actual y el sistema de tokens son baseline, salvo decisión visual explícita.

## 5. Problemas observados en la UI actual

La funcionalidad principal ya existe, pero la presentación todavía se siente más cercana a una implementación funcional que a un marketplace listo para usuarios.

Áreas a mejorar:

- jerarquía visual entre propuesta de valor, búsqueda y contenido secundario;
- densidad y escaneabilidad de las cards;
- protagonismo de fotografía + disponibilidad en resultados;
- continuidad visual entre card y detalle;
- composición del detalle para que disponibilidad y contacto sean visibles sin sobrecarga;
- coherencia entre desktop y mobile;
- reducción de ruido visual y de información duplicada.

## 6. Hipótesis de experiencia

### H1 — Resultados orientados a decisión rápida

La card debe responder primero:

> “¿Este lugar me sirve para mis próximas noches?”

antes de responder:

> “¿Qué amenities tiene?”

### H2 — Detalle progresivo

El listing detail debe aumentar la información de forma progresiva:

1. imágenes;
2. disponibilidad;
3. precio y facts;
4. host;
5. mensaje.

### H3 — Roster como diferenciador, no como ruido

El fit debe ser visible y explicable, pero no competir con el calendario ni convertirse en un score abstracto.

### H4 — Contexto persistente

Location, dates y roster deben sentirse como una sola sesión de búsqueda al pasar de Home a Results y Detail.

## 7. Estados relevantes para el prototipo

### Home

- visitante sin roster;
- visitante con roster temporal;
- usuario autenticado;
- mobile / desktop.

### Search results

- resultados full/strong;
- near matches ocultos;
- near matches visibles;
- sin fechas ni roster;
- empty state;
- mobile / desktop.

### Listing detail

- listing activo;
- fechas solicitadas presentes;
- roster presente;
- visitante deslogueado;
- usuario logueado;
- mobile / desktop.

## 8. Restricciones técnicas

- HTML + CSS + JavaScript ES modules nativos.
- Sin framework ni build.
- Reutilizar `core/`, `app/` y los componentes existentes.
- No integrar backend nuevo para la exploración.
- Playwright ya está configurado en 375×740 y 1280×800.
- Cambios visuales deben salir de tokens o de una propuesta explícita de actualización del design system.

## 9. Criterios de éxito del piloto visual

- El usuario entiende la propuesta de SwingMate sin leer una página larga.
- La búsqueda es la acción principal de Home.
- Las cards permiten comparar rápidamente foto, precio, ubicación y 4 semanas de disponibilidad.
- El detalle se siente como continuación natural de la card.
- El contacto es visible en el detalle sin esconder el contexto del alojamiento.
- No hay scroll horizontal a 375 px.
- Las dos alternativas son estructuralmente comparables, no simples cambios cosméticos.

## 10. Preguntas abiertas que sí pertenecen a esta exploración

- ¿Debe SwingMate sentirse primero como marketplace de alojamiento o como herramienta especializada de roster?
- ¿Cuánto protagonismo debe tener el roster en Home antes de una búsqueda?
- ¿Cuál es la mejor composición visual para las 4 semanas dentro de la card?
- ¿Cómo debe verse el calendario ampliado en el detalle sin perder consistencia con la card?
- ¿Cuántas fotos deben quedar visibles above-the-fold en desktop y mobile?
- ¿El panel de contacto del detalle debe ser sticky en desktop?

## 11. Fuera de alcance

- nuevas reglas de matching;
- cambios en Supabase/RLS/RPC;
- reservas o pagos;
- rediseño completo de Account, Admin, host wizard o Inbox;
- cambios de marca no aprobados;
- introducir React, Next.js u otro framework.

## 12. Punto de aprobación A

Antes de construir las alternativas navegables se debe confirmar que el foco del piloto sea:

**mejorar la experiencia Home → Results → Detail, preservando el comportamiento existente y usando disponibilidad + roster como diferenciador principal.**
