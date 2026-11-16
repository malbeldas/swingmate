---
name: ui-prototyping
description: Convierte una dirección visual elegida en un prototipo navegable acotado, reutilizando stack y componentes existentes.
---

# UI Prototyping — SwingMate

## Precondiciones

- Existe `experience-brief.md`.
- Existe `taste.md`, `anti-patterns.md` y `references.md`.
- Existe una opción elegida explícitamente.
- Se identificaron los UC/AC/BR que no pueden cambiar.

No prototipar varias direcciones a la vez dentro de producción.

## Secuencia obligatoria

### 1. Estructura

Aplicar `ui-structure`.

Producir wireframe/HTML estructural sin dirección de arte.

### 2. Checkpoint humano

Confirmar:

- jerarquía;
- orden;
- cantidad de información;
- comportamiento mobile;
- qué se elimina.

No aplicar pulido visual antes de este checkpoint en cambios L2/L3.

### 3. Dirección de arte

Aplicar `art-direction` sobre la estructura aprobada.

No reabrir IA durante esta etapa salvo decisión explícita.

### 4. Review anti-genérico

Ejecutar `revisor-visual` sobre capturas y SHA.

Si el veredicto es ITERAR o existen bloqueantes/alta, corregir antes de mostrar como candidata final.

### 5. Checkpoint humano

Presentar:

- desktop;
- mobile;
- decisiones editoriales;
- trade-offs;
- hallazgos del reviewer.

### 6. Iteración

Máximo dos rondas por implementador. Una tercera ronda requiere decisión de UX o replanteo del alcance.

## Alcance por defecto

Una pantalla representativa o el flujo mínimo de mayor incertidumbre.

Para #103:

- Home;
- resultados;
- detalle;

sin backend nuevo.

## Reglas técnicas

1. Reutilizar HTML/CSS/JS ES modules existentes.
2. Reutilizar `assets/tokens.css`; cualquier token nuevo se propone antes de consolidar.
3. Mantener lógica de dominio en `core/`.
4. Datos ficticios solo en local/tests.
5. No modificar migraciones, RLS ni RPC para una prueba puramente visual.
6. No reemplazar componentes funcionales existentes si basta con recomponerlos.
7. Mobile first a 375 px y luego desktop a 1280 px.
8. Mantener accesibilidad básica.

## Reglas visuales

1. Pasar el test de `anti-patterns.md`.
2. Respetar límites de microcopy de `taste.md`.
3. No usar cards como contenedor universal.
4. No producir tres secciones consecutivas con idéntico ritmo.
5. Mobile no puede ser solo desktop apilado sin revisar jerarquía.

## Evidencia

Cada iteración relevante debe tener capturas Playwright:

- 375×740;
- 1280×800.

Cada captura se asocia a SHA, ruta/estado y viewport.

## Consolidación

Solo tras aprobación explícita:

- registrar decisión visual;
- actualizar tokens/componentes si corresponde;
- crear baseline;
- planificar integración funcional.

Aprobación visual no implica merge.
