# Integration: Map (OpenStreetMap + Leaflet) — SwingMate

> **Parte del set de integrations.** Ver overview en [integrations.md](./integrations.md).
>
> **Propósito.** Mostrar la zona aproximada del aviso (punto 5 de Tomás, 27 Oct), sin revelar la dirección.

---

## Identificación

- **ID:** INT-005
- **Proveedor:** tiles estándar de OpenStreetMap (`tile.openstreetmap.org`) con Leaflet vendorizado.
- **Use cases:** UC-003, UC-020 (marcar el punto al publicar).
- **Reglas:** BR-LST-004, SEC-22.

## Flujo

- **Detalle:** Leaflet centra el mapa en `public_lat/lng` con zoom 13, dibuja un círculo de 1 km y bloquea el zoom por encima de 14 para que no parezca un punto exacto.
- **Wizard:** el host ve el mapa de su suburbio y toca su casa; ese punto va a `listing_private` y nunca sale (`P-11`). Así no hace falta un servicio de geocodificación.

## Condiciones de uso (operations.osmfoundation.org/policies/tiles)

- Atribución visible "© OpenStreetMap contributors".
- Referer válido (la web lo manda por defecto) y respetar la caché.
- Prohibido descargar tiles en masa o para usar offline.
- No hay garantía de servicio y pueden bloquear el acceso; los servicios comerciales deben tenerlo en cuenta.

**Riesgo aceptado para el piloto:** con decenas de avisos el uso es mínimo. Si crece el tráfico, se cambia a un proveedor con plan gratuito para uso comercial o pago; es un cambio de una URL en `app/config.js`.

## Errores

| Caso | Comportamiento |
|---|---|
| Tiles no cargan | Se oculta el mapa y queda el texto "Approximate area: {suburb}". |

## Modo local

Los E2E sirven un tile fijo desde `tests/e2e/fixtures/` interceptando la URL.

## Criterios de aceptación

- AC-1 (= AC-003-2): el centro del círculo no coincide con la dirección y está a menos de 500 m.
- AC-2: con zoom máximo 14 no se puede acercar más.

---

*Detalle de INT-005. Si cambia el proveedor o los datos que recibe, se actualiza la tabla de inventario.*
