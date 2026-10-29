# Design system — SwingMate

> **Propósito.** Traduce la marca de SwingMate a decisiones de código: tokens, tipografía, componentes con sus estados y lo que está prohibido.
>
> **Cómo se usa.** Toda pantalla usa los tokens de `assets/tokens.css`, que implementan este documento. Un cambio visual (lo lidera Tomás, `decision-log.md` DEC-015) se propone primero acá, con captura, y después se codea.
>
> **Qué NO va en este documento.** La estrategia de marca y el Brand Book (Drive: 07 - Design & Assets/00 - Design Docs/SwingMate Brand Design System), los flujos (`use-cases.md`) y las reglas de accesibilidad mínimas (`engineering-constitution.md` §6).
>
> **Fuente.** Brand Book del proyecto y el prototipo v10 (claude.ai/artifact/9FtEvpdcmrZgqTbKH6ZRQw), que es la referencia visual aprobada hasta que Tomás proponga cambios.

---

## Índice

1. Logo
2. Color
3. Tipografía
4. Espacio, radios y sombras
5. Íconos
6. Componentes
7. Calendario y fit
8. Prohibido

---

## 1. Logo

- **Es el existente y es final:** círculo navy, "Swing" en crema y "Mate" en ámbar (avatar de Instagram @swingmate.au). No se proponen ni dibujan logos nuevos (`engineering-constitution.md` regla hard 8).
- Versiones: círculo (favicon, avatar, emails) y horizontal "SwingMate" en Manrope 800 con "Mate" ámbar para el header.
- Tamaño mínimo del círculo: 24 px. Espacio libre alrededor: un cuarto del diámetro.

## 2. Color

| Token | Valor | Uso |
|---|---|---|
| `--navy` | `#152238` | Texto principal, header, botón primario, "Away" del roster |
| `--navy-ink` | `#0D1626` | Hover del botón primario |
| `--amber` | `#E68A4B` | Acento de marca, "Home" del roster, CTA secundarios de la home |
| `--amber-ink` | `#C96B2C` | Íconos de advertencia, texto ámbar sobre fondo claro |
| `--cream` | `#FAF6EF` | Fondo de página |
| `--white` | `#FFFFFF` | Fondo de cards y hojas |
| `--line` | `#E3D9C4` | Bordes y separadores |
| `--sand` | `#F1E9D8` | Fondos neutros (chips, badges sin verificar) |
| `--text-2` | `#3C4656` | Texto secundario largo |
| `--muted` | `#5C6470` | Texto auxiliar, leyendas |
| `--teal` | `#2C7A76` | Noche disponible, "fit" positivo, ✓ |
| `--teal-ink` | `#1F5E5A` | Texto sobre fondo teal claro |
| `--teal-soft` | `#DCEDEB` | Fondo de "Great fit" y badges verificados |
| `--peach-soft` | `#F7DEC3` | Fondo de "Partial fit" |
| `--peach-ink` | `#7A3E12` | Texto sobre peach |
| `--unavail` | `#E3D9C4` | Noche no disponible |
| `--danger` | `#B4452A` | Errores, reportar |
| `--away-dim` | `#45597A` | "Away" en el gráfico del hero |

Contraste: texto `--navy`, `--text-2` y `--muted` sobre `--cream` y `--white` cumple AA. Texto blanco solo sobre `--navy`, `--teal` y `--danger`.

## 3. Tipografía

| Token | Familia | Uso |
|---|---|---|
| `--font-display` | Manrope 700–800 | Títulos, precios, etiquetas de fit, logo |
| `--font-body` | Inter 400–600 | Todo lo demás |

| Escala | Tamaño / línea | Uso |
|---|---|---|
| `--t-hero` | 40/46 (28/34 en 375 px) | H1 de la home |
| `--t-h1` | 28/34 | Título de página |
| `--t-h2` | 22/28 | Secciones, título del aviso en la card |
| `--t-h3` | 18/24 | Subsecciones |
| `--t-body` | 15/22 | Texto general |
| `--t-small` | 13/18 | Leyendas, metadatos |
| `--t-micro` | 12/16, mayúsculas, tracking 0.08em | Rótulos ("ABOUT ALEX") |

Las fuentes se sirven desde `assets/fonts/` (sin Google Fonts en runtime, `engineering-constitution.md` §6).

## 4. Espacio, radios y sombras

- **Espacio:** escala de 4 px (`--s-1` = 4 … `--s-8` = 32, `--s-12` = 48). Margen lateral de página: 16 px en 375 px, 24 px desde 768 px. Ancho máximo de contenido: 1180 px.
- **Radios:** `--r-sm` 8 px (inputs, botones), `--r-md` 14 px (cards, secciones), `--r-pill` 999 px (chips, badges), `--r-cell` 4 px (noches del calendario).
- **Sombras:** una sola, `--shadow-card: 0 1px 2px rgb(21 34 56 / 6%), 0 4px 16px rgb(21 34 56 / 6%)`, para cards y hojas.

## 5. Íconos

- Trazo de 1,75 px, 20 px por defecto, color `currentColor`, en un sprite SVG propio (`assets/icons.svg`).
- Set mínimo: tipo de lugar, baño, bills, personas, amueblado, estadía mínima, parejas, mascotas, fumar, estacionamiento, aeropuerto, bond, mapa, corazón, mensaje, alerta, reporte, check, advertencia.
- Cada ícono informativo lleva texto al lado; nunca es la única señal.

## 6. Componentes

| Componente | Variantes | Estados | Nota |
|---|---|---|---|
| Botón | primario (navy), secundario (borde navy), terciario (link), peligro | default, hover, focus (anillo 2 px ámbar), disabled (40% opacidad + texto que dice qué falta), cargando | Alto mínimo 44 px. |
| Input / select / fecha | — | default, focus, error (borde `--danger` + texto debajo), disabled | Siempre con `<label>` visible. |
| Chip | filtro, feature, custom ("+ Add your own") | off, on, focus | |
| Badge de confianza | verificado (teal-soft), no verificado (sand) | — | "✓ Phone verified", "No photo yet". |
| Etiqueta de fit | great, good, partial | — | Colores de §7. |
| Card de aviso | home (2 por fila desde 900 px), resultados (lista) | default, hover, guardado | Foto 4:3, título, suburbio, precio, íconos (tipo, baño, bills, personas), etiqueta + línea de fit, tira de 4 semanas con fechas. |
| Hoja (sheet) | modal en escritorio, desde abajo en el celular | abierta, cargando, error | Registro, roster, reporte. Atrapa el foco. |
| Calendario | tira de 4 semanas, 12 semanas, roster de 12 semanas | — | §7. |
| Burbuja de chat | propia, ajena, sistema, con aviso de riesgo | enviando, enviada, error con "Try again" | |
| Estado vacío | sin resultados, sin mensajes, sin avisos | — | Siempre con una acción. |

## 7. Calendario y fit

- **Disponibilidad:** `--teal` = Available; `--unavail` = Unavailable. Solo dos estados (`BR-AVL-002`).
- **Noches que necesita:** borde inferior de 3 px `--navy` sobre la celda ("Your R&R" o "Your dates").
- **Noche de viaje:** celda partida en diagonal navy / ámbar en "My roster" y en la vista previa del roster.
- **Roster:** "Away" `--navy`, "Home" `--amber`.
- **Etiquetas de fit:** great → fondo `--teal-soft`, texto `--teal-ink`; good → `#E6F1EF` / `--teal-ink`; partial → `--peach-soft` / `--peach-ink`.
- **Fechas siempre visibles:** cada semana de la tira lleva su fecha de inicio y cada celda su `title` con fecha y estado (DEC-008).

## 8. Prohibido

- Logos nuevos, variaciones del logo o cambiar sus colores.
- Colores fuera de la tabla de §2 o escritos a mano en el CSS.
- Más de dos familias tipográficas.
- Mostrar un porcentaje o puntaje de fit (`BR-FIT-002`).
- Bloques de color sin unidad de tiempo (DEC-008).
- Fotos de stock presentadas como avisos reales (`BR-TRU-006`). La foto del hero es de ambiente y nunca se presenta como un aviso.

---

*Documento vivo. Los cambios visuales que proponga Tomás entran acá con su captura y fecha; `assets/tokens.css` se actualiza en el mismo PR.*
