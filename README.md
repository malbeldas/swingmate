# SwingMate

Web responsive para que trabajadores FIFO, DIDO y BIBO de Australia compartan alojamiento según su roster. Piloto en Perth, objetivo 6 Dic 2026.

- **Web:** https://malbeldas.github.io/swingmate/ (GitHub Pages desde `main`). Por ahora es la portada previa al piloto, con "See the nights you need" funcionando sobre la lógica real de noches (`core/roster.js`, `BR-ROS-003`). No se indexa hasta que estén Terms y Privacy (`Q-01`).
- **Prototipo navegable v0.1:** https://claude.ai/artifact/9FtEvpdcmrZgqTbKH6ZRQw (referencia visual y de textos; no gana sobre los specs).
- **Tareas:** GitHub Issues de este repo, agrupadas por épica (label `epic:*`) y release (milestone).

## Cómo está organizado el requerimiento

| Para saber… | Leer |
|---|---|
| Vocabulario y textos de interfaz | [specs/glossary.md](specs/glossary.md) |
| Qué puede y qué no puede pasar | [specs/business-rules.md](specs/business-rules.md) |
| Qué hace cada persona y cuándo está terminado | [specs/use-cases.md](specs/use-cases.md) |
| Tablas, funciones y almacenamiento | [specs/schema.md](specs/schema.md) |
| Quién puede leer o escribir qué | [specs/roles-permissions.md](specs/roles-permissions.md) |
| Cómo se construye y se testea | [specs/engineering-constitution.md](specs/engineering-constitution.md) |
| Amenazas y medidas de seguridad | [specs/security.md](specs/security.md) |
| Emails y SMS | [specs/notifications.md](specs/notifications.md) |
| Servicios externos | [specs/integrations.md](specs/integrations.md) |
| Cómo se ve | [specs/design-system.md](specs/design-system.md) |
| Qué se toma del prototipo | [specs/frontend-migration.md](specs/frontend-migration.md) |
| Qué medimos | [specs/observability.md](specs/observability.md) |
| Ambientes, costos y deploy | [specs/infrastructure.md](specs/infrastructure.md) |
| Decisiones tomadas y pendientes con nuestra recomendación | [specs/decision-log.md](specs/decision-log.md) |

Para agentes de código: [CLAUDE.md](CLAUDE.md) y [task-execution-prompt.md](task-execution-prompt.md).

## Correr local

```bash
npm install
npm test            # lógica pura y consistencia de IDs entre specs
npm run test:e2e    # Playwright a 375×740 y 1280×800
npm run serve       # http://localhost:4173
```

El CI corre lo mismo en cada PR. Supabase se suma cuando se confirme el stack (`Q-02`).
