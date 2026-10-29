# Integration: Suburbs dataset (ABS) — SwingMate

> **Parte del set de integrations.** Ver overview en [integrations.md](./integrations.md).
>
> **Propósito.** Tener una lista de suburbios de toda Australia con su centro, para buscar por radio sin depender de un servicio de geocodificación (criterio A10 del MVP: no atarse a Perth).

---

## Identificación

- **ID:** INT-006
- **Fuente:** Suburbs and Localities (SAL), ASGS Edition 3, del Australian Bureau of Statistics. Son 15.353 áreas que cubren todo el país sin huecos (abs.gov.au, consultado el 29 Oct 2026).
- **Use cases:** UC-001, UC-020, UC-030 (suburbio base).
- **Reglas:** BR-SRC-003.

## Flujo

Importación única con un script (`scripts/import-suburbs.mjs`):

1. Lee el archivo de límites SAL.
2. Calcula el centroide de cada área.
3. Asigna el estado y la zona horaria.
4. Marca `is_city` para las capitales y las ciudades regionales grandes, según una lista fija en el script.
5. Genera una migración SQL con los `INSERT` en `suburbs`.

## Puntos a confirmar al implementar

- **Licencia:** el ABS publica sus datos en general bajo Creative Commons Attribution 4.0, pero la página de SAL no lo dice. Se confirma antes de importar y la atribución se pone en la página de Privacy y Terms.
- **Diferencias con los suburbios oficiales:** el ABS avisa que SAL es una aproximación estadística y que algunos suburbios oficiales no aparecen. Para buscar por radio alcanza. Si falta un suburbio que la gente usa, se agrega a mano.
- **Postcode:** SAL no trae postcode; se cruza con la correspondencia SAL–POA del ABS (data.gov.au) o se deja vacío.

## Errores

No hay llamadas en vivo; no falla en producción.

## Modo local

La misma migración, o un subconjunto de WA para que los tests sean rápidos.

## Criterios de aceptación

- AC-1: buscar "Baldivis" sugiere "Baldivis, WA" y buscar "Mackay" sugiere "Mackay, QLD".
- AC-2: cada suburbio tiene zona horaria.

---

*Detalle de INT-006. Si cambia el proveedor o los datos que recibe, se actualiza la tabla de inventario.*
