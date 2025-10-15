# Notebook UI Display Examples

These snippets are meant to be pasted directly into a code cell. Return the helper call or the display object as the final expression (don’t console.log).

Import helpers from `@nodebooks/ui` or return the literal display object.

- Helpers: `UiImage`, `UiMarkdown`, `UiHTML`, `UiJSON`, `UiCode`, `UiTable`, `UiDataSummary`, `UiVegaLite`, `UiPlotly`, `UiHeatmap`, `UiNetworkGraph`, `UiPlot3d`, `UiMap`, `UiGeoJson`
- Literal objects: `{ ui: "image" | "markdown" | "html" | "json" | "code" | "table" | "dataSummary" | "vegaLite" | "plotly" | "heatmap" | "networkGraph" | "plot3d" | "map" | "geoJson" | "alert" | "badge" | "metric" | "progress" | "spinner", ... }`

Note: For async work (like fetching an image and converting to base64), wrap in an async IIFE and return the result.

## Image

Basic URL image

```ts
import { UiImage } from "@nodebooks/ui";
UiImage("https://picsum.photos/seed/nodebooks/600/320", {
  alt: "Random image",
  width: 600,
  height: 320,
  fit: "cover",
  borderRadius: 8,
});
```

Fetch → base64 (async)

```ts
import { UiImage } from "@nodebooks/ui";
(async () => {
  const res = await fetch("https://picsum.photos/seed/base64/300/200");
  const ab = await res.arrayBuffer();
  const b64 = Buffer.from(ab).toString("base64");
  const mime = res.headers.get("content-type") ?? "image/jpeg";
  return UiImage(b64, {
    mimeType: mime,
    alt: "Fetched base64",
    width: 300,
    height: 200,
  });
})();
```

Inline data URL (literal)

```ts
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90">
  <rect width="160" height="90" fill="#0ea5e9"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#fff" font-size="16">Nodebooks</text>
</svg>`;
const data = Buffer.from(svg, "utf8").toString("base64");
({
  ui: "image",
  src: `data:image/svg+xml;base64,${data}`,
  alt: "Inline SVG",
  width: 160,
  height: 90,
});
```

## Markdown

Helper

```ts
import { UiMarkdown } from "@nodebooks/ui";
UiMarkdown(
  `# Title\n\n- Bullet\n- List with **bold** and _italic_\n\n\n\nCode:\n\n\`\`\`js\nconsole.log('hello');\n\`\`\``
);
```

Literal

```ts
({
  ui: "markdown",
  markdown: "## Subheading\n\nParagraph with a [link](https://example.com).",
});
```

## HTML (sanitized)

Helper

```ts
import { UiHTML } from "@nodebooks/ui";
UiHTML('<div style="color:#0ea5e9"><strong>Hello</strong> <em>HTML</em></div>');
```

Script/style tags are stripped by sanitizer

```ts
import { UiHTML } from "@nodebooks/ui";
UiHTML('<div><script>alert("x")</script>Safe content only</div>');
```

## JSON Viewer

Nested object, expanded

```ts
import { UiJSON } from "@nodebooks/ui";
UiJSON(
  {
    a: 1,
    b: true,
    list: [1, 2, { nested: "value" }],
    deep: { x: { y: { z: 3 } } },
  },
  { collapsed: false, maxDepth: 4 }
);
```

Collapsed by default

```ts
import { UiJSON } from "@nodebooks/ui";
UiJSON({ large: Array.from({ length: 50 }, (_, i) => i) }, { collapsed: true });
```

Literal

```ts
({ ui: "json", json: { hello: "world" }, collapsed: false, maxDepth: 3 });
```

## Code Block

Helper with language

```ts
import { UiCode } from "@nodebooks/ui";
UiCode(
  `function greet(name) {\n  return \`Hello, \${name}\`;\n}\nconsole.log(greet("Nodebooks"));`,
  { language: "js" }
);
```

Wrapped long code lines

```ts
import { UiCode } from "@nodebooks/ui";
UiCode("const text = 'a'.repeat(200)\nconsole.log(text)", {
  language: "js",
});
```

Literal

```ts
({ ui: "code", code: "let x: number = 42;", language: "ts" });
```

## Table / Grid

Simple table with sorting and pagination

```ts
import { UiTable } from "@nodebooks/ui";
const rows = Array.from({ length: 57 }, (_, i) => ({
  id: i + 1,
  name: `Item ${i + 1}`,
  value: Math.round(Math.random() * 1000) / 10,
  flag: i % 3 === 0,
}));
UiTable(rows, {
  sort: { key: "id", direction: "asc" },
  page: { size: 10 },
  density: "normal",
});
```

Explicit columns with labels and alignment

```ts
import { UiTable } from "@nodebooks/ui";
UiTable(
  [
    { a: "alpha", b: 3.14159, c: true },
    { a: "beta", b: 2.71828, c: false },
  ],
  {
    columns: [
      { key: "a", label: "Name" },
      { key: "b", label: "Score", align: "right" },
      { key: "c", label: "Flag", align: "center" },
    ],
  }
);
```

## Data Summary

Summarize a dataset: schema, stats, sample rows

```ts
import { UiDataSummary } from "@nodebooks/ui";
UiDataSummary({
  title: "Users Dataset",
  schema: [
    { name: "id", type: "integer", nullable: false },
    { name: "name", type: "string" },
    { name: "age", type: "number" },
    { name: "active", type: "boolean" },
  ],
  stats: {
    id: { count: 1000, distinct: 1000, min: 1, max: 1000 },
    age: { count: 950, min: 18, max: 93, mean: 41.2, median: 40 },
    active: { count: 1000, distinct: 2 },
  },
  sample: [
    { id: 1, name: "Alice", age: 33, active: true },
    { id: 2, name: "Bob", age: 51, active: false },
  ],
  note: "Stats computed on 1,000 rows.",
});
```

## Charts & Graphs

### Vega-Lite chart

```ts
import { UiVegaLite } from "@nodebooks/ui";

const spec = {
  $schema: "https://vega.github.io/schema/vega-lite/v5.json",
  description: "Monthly sales by channel",
  data: {
    values: [
      { channel: "Web", month: "Jan", sales: 128 },
      { channel: "Web", month: "Feb", sales: 144 },
      { channel: "Retail", month: "Jan", sales: 96 },
      { channel: "Retail", month: "Feb", sales: 102 },
      { channel: "Partners", month: "Jan", sales: 72 },
      { channel: "Partners", month: "Feb", sales: 88 },
    ],
  },
  mark: "bar",
  encoding: {
    x: { field: "month", type: "ordinal", axis: { labelAngle: 0 } },
    y: { field: "sales", type: "quantitative" },
    color: { field: "channel", type: "nominal" },
    tooltip: [
      { field: "channel", type: "nominal" },
      { field: "sales", type: "quantitative" },
    ],
  },
};

UiVegaLite(spec, { height: 320, actions: false });
```

### Plotly chart

```ts
import { UiPlotly } from "@nodebooks/ui";

const hours = Array.from({ length: 24 }, (_, i) => i);
const cpu = hours.map(
  (hour) => 30 + Math.sin(hour / 2) * 18 + Math.random() * 4
);
const memory = hours.map(
  (hour) => 48 + Math.cos(hour / 3) * 10 + Math.random() * 3
);

UiPlotly(
  [
    {
      type: "scatter",
      mode: "lines+markers",
      name: "CPU",
      x: hours,
      y: cpu,
      line: { color: "#0ea5e9", width: 2 },
    },
    {
      type: "scatter",
      mode: "lines",
      name: "Memory",
      x: hours,
      y: memory,
      line: { color: "#f97316", width: 2 },
    },
  ],
  {
    layout: {
      title: "Cluster load (24h)",
      margin: { t: 48, r: 16, b: 48, l: 56 },
      xaxis: { title: "Hour" },
      yaxis: { title: "% Utilization", range: [0, 100] },
    },
  }
);
```

### Heatmap / matrix

```ts
import { UiHeatmap } from "@nodebooks/ui";

const values = [
  [64, 58, 70, 82, 75],
  [42, 48, 55, 63, 60],
  [80, 85, 92, 96, 101],
  [22, 30, 34, 41, 44],
];

UiHeatmap(values, {
  xLabels: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  yLabels: ["API", "Workers", "DB", "Cache"],
  colorScale: "turbo",
  legend: true,
});
```

### Network graph

```ts
import { UiNetworkGraph } from "@nodebooks/ui";

const nodes = [
  { id: "api", label: "API" },
  { id: "queue", label: "Queue" },
  { id: "worker", label: "Worker" },
  { id: "db", label: "DB" },
  { id: "cache", label: "Cache" },
];

const links = [
  { source: "api", target: "queue" },
  { source: "queue", target: "worker" },
  { source: "worker", target: "db" },
  { source: "worker", target: "cache" },
  { source: "cache", target: "api", directed: true },
];

UiNetworkGraph(nodes, links, {
  physics: { linkDistance: 140, chargeStrength: -160 },
  layout: "force",
});
```

### 3D plot

```ts
import { UiPlot3d } from "@nodebooks/ui";

const surface = Array.from({ length: 16 }, (_, y) =>
  Array.from({ length: 16 }, (_, x) => {
    const sx = (x - 8) / 3;
    const sy = (y - 8) / 3;
    return Math.sin(Math.sqrt(sx * sx + sy * sy));
  })
);

UiPlot3d({
  points: [
    { position: [0, 0, 1.2], color: "#f97316", size: 1.6 },
    { position: [2, -1.5, 0.4], color: "#0ea5e9", size: 1.2 },
  ],
  surface: {
    values: surface,
    colorScale: "magma",
  },
  camera: { position: [6, 6, 6], target: [0, 0, 0] },
  background: "#0f172a",
});
```

## Maps

### Map with markers

```ts
import { UiMap } from "@nodebooks/ui";

UiMap({
  center: [-122.4194, 37.7749],
  zoom: 11,
  style: "streets",
  markers: [
    { coordinates: [-122.4194, 37.7749], popup: "San Francisco" },
    { coordinates: [-122.4477, 37.7689], popup: "Golden Gate Park" },
  ],
  geojson: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [-122.4783, 37.8199],
            [-122.475, 37.808],
            [-122.4477, 37.7689],
          ],
        },
      },
    ],
  },
  height: 320,
});
```

### GeoJSON overlay

```ts
import { UiGeoJson } from "@nodebooks/ui";

UiGeoJson(
  {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-73.982, 40.768],
              [-73.958, 40.768],
              [-73.958, 40.785],
              [-73.982, 40.785],
              [-73.982, 40.768],
            ],
          ],
        },
        properties: { popup: "Central Park" },
      },
      {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [-73.974, 40.78],
        },
        properties: { popup: "The Lake" },
      },
    ],
  },
  {
    fillColor: "#34d399",
    lineColor: "#047857",
    lineWidth: 2.5,
    opacity: 0.4,
    showMarkers: true,
    map: { center: [-73.97, 40.78], zoom: 12, style: "terrain" },
    height: 320,
  }
);
```

## Status & Metrics

### Alert / Callout

```ts
import { UiAlert } from "@nodebooks/ui";
UiAlert({
  level: "success",
  title: "Installed",
  text: "Dependencies are ready.",
});
```

HTML content (sanitized):

```ts
import { UiAlert } from "@nodebooks/ui";
UiAlert({
  level: "warn",
  title: "Check",
  html: "<em>Be careful</em> with settings.",
});
```

### Badge / Tag

```ts
import { UiBadge } from "@nodebooks/ui";
UiBadge("beta", { color: "info" });
```

### Metric / KPI Tile

```ts
import { UiMetric } from "@nodebooks/ui";
UiMetric(1234, {
  label: "Requests",
  unit: "/min",
  delta: 42,
  helpText: "Rolling 1m",
});
```

### Progress Bar / Spinner

```ts
import { UiProgress, UiSpinner } from "@nodebooks/ui";
UiProgress(64, { label: "Processing" });
```

Indeterminate:

```ts
import { UiProgress } from "@nodebooks/ui";
UiProgress({ indeterminate: true, label: "Loading" });
```

Spinner:

```ts
import { UiSpinner } from "@nodebooks/ui";
UiSpinner({ label: "Fetching", size: "lg" });
```

## Tips

- The last expression in the cell is captured as display output.
- Use an async IIFE to await fetch or other promises.
- For raw base64 images, set `mimeType` to ensure correct rendering.
- Width/height accept numbers (px) or CSS strings (e.g., "100%").
