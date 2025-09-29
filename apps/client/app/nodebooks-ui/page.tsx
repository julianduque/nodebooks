"use client";

import React from "react";
export const dynamic = "force-dynamic";
import {
  AlertCallout,
  BadgeTag,
  CodeBlock,
  DataSummary,
  HtmlBlock,
  Image as UiImage,
  JsonViewer,
  Markdown,
  MetricTile,
  ProgressBar,
  Spinner,
  TableGrid,
  UiCard,
  VegaLiteChart,
  PlotlyChart,
  HeatmapMatrix,
  NetworkGraph,
  Plot3dScene,
  MapView,
  GeoJsonMap,
} from "@nodebooks/notebook-ui";

const sampleRows = [
  { id: 1, name: "Alice", age: 30, active: true },
  { id: 2, name: "Bob", age: 24, active: false },
  { id: 3, name: "Cory", age: 37, active: true },
];

const manyRows = Array.from({ length: 125 }, (_, i) => ({
  id: i + 1,
  name: `User ${i + 1}`,
  age: 18 + ((i * 7) % 50),
  active: i % 3 === 0,
  score: Math.round((Math.sin(i / 5) + 1) * 50),
}));

const demoSchema = [
  { name: "id", type: "number", nullable: false },
  { name: "name", type: "string", nullable: false },
  { name: "age", type: "number", nullable: false },
  { name: "active", type: "boolean", nullable: false },
  { name: "score", type: "number", nullable: true },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const demoStats: Record<string, any> = {
  age: {
    count: manyRows.length,
    distinct: 50,
    nulls: 0,
    min: 18,
    max: 67,
    mean: 42.1,
    median: 42,
    p25: 30,
    p75: 54,
    stddev: 12.7,
  },
  score: {
    count: manyRows.length,
    distinct: 90,
    nulls: 0,
    min: 0,
    max: 100,
    mean: 50.2,
    median: 50,
    p25: 25,
    p75: 75,
    stddev: 21.3,
  },
};

const vegaLiteSpec = {
  $schema: "https://vega.github.io/schema/vega-lite/v6.json",
  data: {
    values: [
      { month: "Jan", channel: "Web", revenue: 128 },
      { month: "Feb", channel: "Web", revenue: 144 },
      { month: "Mar", channel: "Web", revenue: 162 },
      { month: "Apr", channel: "Web", revenue: 180 },
      { month: "May", channel: "Web", revenue: 198 },
      { month: "Jun", channel: "Web", revenue: 216 },
      { month: "Jul", channel: "Web", revenue: 234 },
      { month: "Aug", channel: "Web", revenue: 252 },
      { month: "Sep", channel: "Web", revenue: 270 },
      { month: "Oct", channel: "Web", revenue: 288 },
      { month: "Nov", channel: "Web", revenue: 306 },
      { month: "Dec", channel: "Web", revenue: 324 },
      { month: "Jan", channel: "Retail", revenue: 92 },
      { month: "Feb", channel: "Retail", revenue: 110 },
      { month: "Mar", channel: "Retail", revenue: 118 },
      { month: "Apr", channel: "Retail", revenue: 126 },
      { month: "May", channel: "Retail", revenue: 134 },
      { month: "Jun", channel: "Retail", revenue: 142 },
      { month: "Jul", channel: "Retail", revenue: 150 },
      { month: "Aug", channel: "Retail", revenue: 158 },
      { month: "Sep", channel: "Retail", revenue: 166 },
      { month: "Oct", channel: "Retail", revenue: 174 },
      { month: "Nov", channel: "Retail", revenue: 182 },
      { month: "Dec", channel: "Retail", revenue: 190 },
      { month: "Jan", channel: "Partners", revenue: 66 },
      { month: "Feb", channel: "Partners", revenue: 72 },
      { month: "Mar", channel: "Partners", revenue: 78 },
      { month: "Apr", channel: "Partners", revenue: 84 },
      { month: "May", channel: "Partners", revenue: 90 },
      { month: "Jun", channel: "Partners", revenue: 96 },
      { month: "Jul", channel: "Partners", revenue: 102 },
      { month: "Aug", channel: "Partners", revenue: 108 },
      { month: "Sep", channel: "Partners", revenue: 114 },
      { month: "Oct", channel: "Partners", revenue: 120 },
      { month: "Nov", channel: "Partners", revenue: 126 },
      { month: "Dec", channel: "Partners", revenue: 132 },
    ],
  },
  mark: "bar",
  encoding: {
    x: { field: "month", type: "ordinal", axis: { labelAngle: 0 } },
    y: { field: "revenue", type: "quantitative" },
    color: { field: "channel", type: "nominal" },
    tooltip: [
      { field: "channel", type: "nominal" },
      { field: "revenue", type: "quantitative" },
    ],
  },
};

const hours = Array.from({ length: 24 }, (_, i) => i);
const plotlySeries = [
  {
    type: "scatter" as const,
    mode: "lines+markers" as const,
    name: "CPU",
    x: hours,
    y: hours.map((hour) => 38 + Math.sin(hour / 2) * 18 + Math.random() * 3),
    line: { color: "#0ea5e9", width: 2 },
  },
  {
    type: "scatter" as const,
    mode: "lines" as const,
    name: "Memory",
    x: hours,
    y: hours.map((hour) => 52 + Math.cos(hour / 3) * 12 + Math.random() * 2),
    line: { color: "#f97316", width: 2 },
  },
];

const plotlyLayout = {
  title: "Cluster load (24h)",
  margin: { t: 48, r: 16, b: 48, l: 56 },
  xaxis: { title: "hour" },
  yaxis: { title: "% utilization", range: [0, 100] },
};

const heatmapValues = [
  [64, 58, 70, 82, 75],
  [42, 48, 55, 63, 60],
  [80, 85, 92, 96, 101],
  [22, 30, 34, 41, 44],
];

const networkNodes = [
  { id: "api", label: "API" },
  { id: "queue", label: "Queue" },
  { id: "worker", label: "Worker" },
  { id: "db", label: "DB" },
  { id: "cache", label: "Cache" },
  { id: "frontend", label: "Frontend" },
  { id: "mobile", label: "Mobile" },
  { id: "backend", label: "Backend" },
  { id: "infra", label: "Infra" },
  { id: "ops", label: "Ops" },
  { id: "security", label: "Security" },
  { id: "monitoring", label: "Monitoring" },
];

const networkLinks = [
  { source: "api", target: "queue" },
  { source: "queue", target: "worker" },
  { source: "worker", target: "db" },
  { source: "worker", target: "cache" },
  { source: "cache", target: "api", directed: true },
  { source: "frontend", target: "mobile" },
  { source: "backend", target: "infra" },
  { source: "infra", target: "ops" },
  { source: "ops", target: "security" },
  { source: "security", target: "monitoring" },
  { source: "monitoring", target: "api" },
];

const plot3dSurface = Array.from({ length: 18 }, (_, y) =>
  Array.from({ length: 18 }, (_, x) => {
    const sx = (x - 9) / 3;
    const sy = (y - 9) / 3;
    return Math.sin(Math.sqrt(sx * sx + sy * sy));
  })
);

const sfMarkers: Array<{ coordinates: [number, number]; popup: string }> = [
  {
    coordinates: [-122.4194, 37.7749] as [number, number],
    popup: "San Francisco",
  },
  {
    coordinates: [-122.4477, 37.7689] as [number, number],
    popup: "Golden Gate Park",
  },
  {
    coordinates: [-122.4783, 37.8199] as [number, number],
    popup: "Golden Gate Bridge",
  },
];

const sfRoute = {
  type: "FeatureCollection" as const,
  features: [
    {
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
        coordinates: [
          [-122.4783, 37.8199],
          [-122.475, 37.808],
          [-122.4477, 37.7689],
        ],
      },
      properties: {},
    },
  ],
};

const centralParkGeoJson = {
  type: "FeatureCollection" as const,
  features: [
    {
      type: "Feature" as const,
      geometry: {
        type: "Polygon" as const,
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
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [-73.974, 40.78],
      },
      properties: { popup: "The Lake" },
    },
  ],
};

export default function UiPlaygroundPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <h1 className="text-2xl font-bold tracking-tight">UI Playground</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Alerts</h2>
        <UiCard>
          <div className="grid gap-3 md:grid-cols-2">
            <AlertCallout
              level="info"
              title="Heads up"
              text="This is an info alert with icon."
            />
            <AlertCallout
              level="success"
              title="Great!"
              text="Your action completed successfully."
            />
            <AlertCallout
              level="warn"
              title="Warning"
              text="Something needs your attention."
            />
            <AlertCallout
              level="error"
              title="Error"
              text="Something went wrong."
            />
          </div>
        </UiCard>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Badges</h2>
        <UiCard>
          <div className="flex flex-wrap gap-3">
            <BadgeTag text="Default" />
            <BadgeTag text="Info" color="info" />
            <BadgeTag text="Success" color="success" />
            <BadgeTag text="Warn" color="warn" />
            <BadgeTag text="Error" color="error" />
          </div>
        </UiCard>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Spinner & Progress</h2>
        <UiCard>
          <div className="flex flex-wrap items-center gap-6">
            <Spinner label="Loading" size="sm" />
            <Spinner label="Fetching data" size="md" />
            <Spinner label="Compiling" size="lg" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <ProgressBar label="Deterministic" value={42} max={100} />
            <ProgressBar label="Indeterminate" indeterminate />
          </div>
        </UiCard>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Metrics</h2>
        <UiCard>
          <div className="grid gap-4 md:grid-cols-3">
            <MetricTile
              label="Throughput"
              value={1234}
              unit="req/s"
              delta={12}
              helpText="Last 5 min"
            />
            <MetricTile
              label="Latency"
              value={245}
              unit="ms"
              delta={-8}
              helpText="P95 vs prev"
            />
            <MetricTile
              label="Errors"
              value={0}
              unit="/min"
              delta={0}
              helpText="Last hour"
            />
          </div>
        </UiCard>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">JSON Viewer</h2>
        <UiCard>
          <JsonViewer
            json={{
              message: "Hello, world",
              items: [{ id: 1 }, { id: 2 }],
              nested: { a: 1, b: true, c: null },
            }}
            collapsed
          />
        </UiCard>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Tables</h2>
        <UiCard>
          <TableGrid rows={sampleRows} page={{ index: 0, size: 10 }} />
        </UiCard>
        <UiCard>
          <TableGrid
            rows={manyRows}
            page={{ index: 0, size: 20 }}
            sort={{ key: "id", direction: "asc" }}
          />
        </UiCard>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Data Summary</h2>
        <UiCard>
          <DataSummary
            title="User Dataset"
            schema={demoSchema}
            stats={demoStats}
            sample={manyRows.slice(0, 8)}
            note="Synthetic dataset to showcase schema, stats and sample rows."
          />
        </UiCard>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Charts &amp; Graphs</h2>
        <div className="grid gap-4">
          <UiCard>
            <VegaLiteChart spec={vegaLiteSpec} actions={false} height={320} />
          </UiCard>
          <UiCard>
            <PlotlyChart data={plotlySeries} layout={plotlyLayout} />
          </UiCard>
          <UiCard>
            <HeatmapMatrix
              values={heatmapValues}
              xLabels={["Mon", "Tue", "Wed", "Thu", "Fri"]}
              yLabels={["API", "Workers", "DB", "Cache"]}
              colorScale="turbo"
            />
          </UiCard>
          <UiCard>
            <NetworkGraph
              nodes={networkNodes}
              links={networkLinks}
              physics={{ linkDistance: 140, chargeStrength: -160 }}
              layout="force"
            />
          </UiCard>
          <UiCard>
            <Plot3dScene
              surface={{ values: plot3dSurface, colorScale: "magma" }}
              points={[
                { position: [0, 0, 1.2], color: "#f97316", size: 1.5 },
                { position: [2, -1.5, 0.4], color: "#0ea5e9", size: 1.1 },
              ]}
              camera={{ position: [6, 6, 6], target: [0, 0, 0] }}
              background="#020617"
            />
          </UiCard>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Maps</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <UiCard>
            <MapView
              center={[-122.4194, 37.7749]}
              zoom={11}
              style="streets"
              markers={sfMarkers}
              geojson={sfRoute}
              attribution="© OpenStreetMap contributors"
              height={320}
            />
          </UiCard>
          <UiCard>
            <GeoJsonMap
              featureCollection={centralParkGeoJson}
              fillColor="#34d399"
              lineColor="#047857"
              opacity={0.4}
              showMarkers
              map={{ center: [-73.97, 40.78], zoom: 12, style: "terrain" }}
              height={320}
            />
          </UiCard>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Code & Markdown & HTML</h2>
        <UiCard>
          <CodeBlock
            language="ts"
            code={`export function add(a: number, b: number) {\n  return a + b;\n}`}
          />
        </UiCard>
        <UiCard>
          <Markdown
            markdown={"## Markdown\n\n- One\n- Two\n\n**Bold** and _italic_."}
          />
        </UiCard>
        <UiCard>
          <HtmlBlock html="<p>This <strong>HTML</strong> is sanitized.</p>" />
        </UiCard>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Image</h2>
        <UiCard>
          <UiImage
            src="/icon.svg"
            alt="NodeBooks"
            width={220}
            height={66}
            fit="contain"
          />
        </UiCard>
      </section>
    </div>
  );
}
