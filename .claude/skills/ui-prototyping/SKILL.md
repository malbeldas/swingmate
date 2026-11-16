---
name: ui-prototyping
description: Convierte una dirección visual elegida en un prototipo navegable acotado, reutilizando stack y componentes existentes.
---

# UI Prototyping — SwingMate

## Precondiciones

- Existe un `experience-brief.md`.
- Existe una opción elegida explícitamente en `options.md` o una instrucción humana equivalente.
- Se identificaron los UC/AC/BR que no pueden cambiar.

No prototipar varias direcciones a la vez dentro de producción.

## Alcance por defecto

Una pantalla representativa o el flujo mínimo de mayor incertidumbre.

Para el piloto #103:

- Home;
- resultados;
- detalle;

sin backend nuevo.

## Reglas

1. Reutilizar HTML/CSS/JS ES modules existentes.
2. Reutilizar `assets/tokens.css`; cualquier token nuevo se propone antes de consolidar.
3. Mantener la lógica de dominio en `core/`.
4. Datos ficticios solo en local/tests; nunca presentarlos como inventario real.
5. No modificar migraciones, RLS ni RPC para una prueba puramente visual.
6. No reemplazar componentes funcionales existentes si basta con recomponerlos.
7. Mobile first a 375 px y luego desktop a 1280 px.
8. Mantener accesibilidad básica: labels, foco, teclado, contraste y estados no dependientes solo del color.

## Evidencia

Cada iteración relevante debe tener capturas Playwright para:

- mobile 375×740;
- desktop 1280×800.

Guardar evidencia bajo una carpeta identificable por historia/alternativa.

No declarar fidelidad porcentual.

## Iteración

Máximo dos rondas por implementador antes de volver a una decisión de UX.

Clasificar feedback como:

- conservar;
- cambiar;
- descartar.

## Consolidación

Solo tras aprobación explícita:

- registrar decisión visual;
- actualizar tokens/componentes si corresponde;
- crear baseline;
- planificar integración funcional si quedó fuera del prototipo.

Aprobación visual no implica merge.
