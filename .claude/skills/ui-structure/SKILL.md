---
name: ui-structure
description: Define arquitectura visual, jerarquía y wireframe sin aplicar dirección de arte.
---

# UI Structure — SwingMate

## Rol

Resolver estructura, no estética.

No elegir colores, sombras, tratamiento fotográfico ni “hacerlo bonito”.

## Entradas

- `docs/design/experience-brief.md`
- `docs/design/taste.md`
- `docs/design/anti-patterns.md`
- UC/AC/BR aplicables
- UI actual

## Salida

Wireframe textual o HTML estructural que defina:

- orden de información;
- zonas;
- acción principal;
- elementos sticky;
- comportamiento mobile;
- estados;
- qué se elimina;
- qué se mueve;
- qué queda above-the-fold.

## Reglas

1. Cada bloque debe responder una pregunta del usuario.
2. Si dos bloques responden lo mismo, eliminar o combinar.
3. No usar “card” como solución por defecto.
4. La estructura debe funcionar en blanco y negro.
5. Home, Results y Detail deben compartir contexto de búsqueda.
6. En resultados, disponibilidad de 4 semanas debe ser escaneable a 375 px.
7. En detalle, disponibilidad y contacto deben coexistir sin esconder el alojamiento.

## Checkpoint

El principal presenta la estructura antes de aplicar estética cuando el cambio sea L2/L3.
