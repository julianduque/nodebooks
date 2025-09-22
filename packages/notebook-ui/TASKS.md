# Notebook UI Components — Task List

Use this checklist to track display components for Output cells. Mark items as completed when implemented end-to-end (schema + runtime MIME + renderer).

Core

- [x] Image (URL, data URL, or base64; alt/size/fit)
- [x] Markdown (sanitized, GitHub-flavored)
- [x] HTML (sanitized block)
- [x] JSON Viewer (collapsible tree)
- [x] Code Block (syntax-highlighted)

Data & Tables

- [x] Table/Grid (array of objects; pagination, sorting)
- [x] Data Summary (schema, stats, sample rows)

Charts & Visualization

- [ ] Vega-Lite Chart (declarative spec)
- [ ] Plotly Chart (optional alternative)
- [ ] Heatmap / Matrix
- [ ] Network Graph (force-directed)
- [ ] 3D Plot (Three.js/WebGL)

Media

- [ ] SVG (inline)
- [ ] Canvas (2D drawing)
- [ ] WebGL (low-level rendering surface)
- [ ] Audio Player
- [ ] Video Player
- [ ] Image Gallery (grid of images)

Maps

- [ ] Map (tiles + markers)
- [ ] GeoJSON Layer (polylines/polygons)

Text & Math

- [ ] LaTeX/Math (KaTeX)
- [ ] Rich Text (prose formatting)

Status & Metrics

- [x] Alert/Callout (info/success/warn/error)
- [x] Badge/Tag
- [x] Metric/KPI Tile
- [x] Progress Bar / Spinner

Utilities

- [ ] File Download (blob content)
- [ ] IFrame/Embed (sandboxed)
- [ ] Panel/Accordion/Tabs (container primitives)

Notes

- All components should be surfaced via vendor MIME `application/vnd.nodebooks.ui+json` and validated by `UiDisplaySchema` in `@nodebooks/notebook-schema`.
- Renderers live in `@nodebooks/notebook-ui` and selected via `UiRenderer` in the UI app.
- Runtime should add the vendor MIME when a returned value matches the UI schema.
