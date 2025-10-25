"use client";

import React from "react";
export const dynamic = "force-dynamic";
import {
  AlertCallout,
  BadgeTag,
  CodeBlock,
  Container,
  DataSummary,
  GeoJsonMap,
  HeatmapMatrix,
  HtmlBlock,
  Image as UiImage,
  InteractiveButton,
  InteractiveSlider,
  InteractiveTextInput,
  JsonViewer,
  MapView,
  Markdown,
  MetricTile,
  NetworkGraph,
  Plot3dScene,
  PlotlyChart,
  ProgressBar,
  Spinner,
  TableGrid,
  UiCard,
  UiInteractionContext,
  VegaLiteChart,
} from "@nodebooks/ui";
import type { UiInteractionDispatcher } from "@nodebooks/ui";
import type { UiDisplay } from "@nodebooks/notebook-schema";

const stableRandom = (...seeds: number[]) => {
  const key = seeds.map((seed) => (Number.isFinite(seed) ? seed : 0)).join("|");
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const result = Math.sin(hash) * 43758.5453123;
  return result - Math.floor(result);
};

const sections = [
  { id: "alerts", label: "Alerts" },
  { id: "badges", label: "Badges" },
  { id: "spinner", label: "Spinner & Progress" },
  { id: "metrics", label: "Metrics" },
  { id: "interactive", label: "Interactive Components" },
  { id: "json", label: "JSON Viewer" },
  { id: "tables", label: "Tables" },
  { id: "data-summary", label: "Data Summary" },
  { id: "charts", label: "Charts & Graphs" },
  { id: "vega-lite", label: "Vega-Lite Charts" },
  { id: "plotly", label: "Plotly Charts" },
  { id: "heatmaps", label: "Heatmaps" },
  { id: "network", label: "Network Graphs" },
  { id: "plot3d", label: "3D Plots" },
  { id: "maps", label: "Maps" },
  { id: "code", label: "Code & Markdown" },
  { id: "image", label: "Images" },
];

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
    y: hours.map(
      (hour) => 38 + Math.sin(hour / 2) * 18 + stableRandom(101, hour) * 3
    ),
    line: { color: "#0ea5e9", width: 2 },
  },
  {
    type: "scatter" as const,
    mode: "lines" as const,
    name: "Memory",
    x: hours,
    y: hours.map(
      (hour) => 52 + Math.cos(hour / 3) * 12 + stableRandom(102, hour) * 2
    ),
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
            [-73.9812, 40.7684],
            [-73.9731, 40.7644],
            [-73.9584, 40.7678],
            [-73.9586, 40.7731],
            [-73.9587, 40.7789],
            [-73.9588, 40.7812],
            [-73.9726, 40.7964],
            [-73.9734, 40.7997],
            [-73.9813, 40.7965],
            [-73.9814, 40.7891],
            [-73.9815, 40.7823],
            [-73.9816, 40.7751],
            [-73.9812, 40.7684],
          ],
        ],
      },
      properties: { popup: "Central Park" },
    },
    {
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [-73.9658, 40.7824],
      },
      properties: { popup: "The Lake" },
    },
  ],
};

const londonMarkers: Array<{ coordinates: [number, number]; popup: string }> = [
  {
    coordinates: [-0.1276, 51.5074] as [number, number],
    popup: "London",
  },
  {
    coordinates: [-0.0759, 51.5136] as [number, number],
    popup: "Tower Bridge",
  },
  {
    coordinates: [-0.1419, 51.5014] as [number, number],
    popup: "Big Ben",
  },
  {
    coordinates: [-0.1275, 51.5033] as [number, number],
    popup: "London Eye",
  },
];

const thamesRoute = {
  type: "FeatureCollection" as const,
  features: [
    {
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
        coordinates: [
          [-0.1419, 51.5014],
          [-0.1275, 51.5033],
          [-0.1, 51.505],
          [-0.0759, 51.5136],
        ],
      },
      properties: {},
    },
  ],
};

const tokyoDistricts = {
  type: "FeatureCollection" as const,
  features: [
    {
      type: "Feature" as const,
      geometry: {
        type: "Polygon" as const,
        coordinates: [
          [
            [139.688, 35.685],
            [139.693, 35.679],
            [139.702, 35.682],
            [139.708, 35.689],
            [139.705, 35.698],
            [139.698, 35.702],
            [139.69, 35.698],
            [139.685, 35.692],
            [139.688, 35.685],
          ],
        ],
      },
      properties: { popup: "Shinjuku District" },
    },
    {
      type: "Feature" as const,
      geometry: {
        type: "Polygon" as const,
        coordinates: [
          [
            [139.695, 35.658],
            [139.702, 35.655],
            [139.71, 35.66],
            [139.713, 35.668],
            [139.708, 35.674],
            [139.7, 35.672],
            [139.693, 35.666],
            [139.695, 35.658],
          ],
        ],
      },
      properties: { popup: "Shibuya District" },
    },
    {
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [139.7454, 35.6586],
      },
      properties: { popup: "Tokyo Tower" },
    },
  ],
};

const parisLandmarks = {
  type: "FeatureCollection" as const,
  features: [
    {
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [2.2945, 48.8584],
      },
      properties: { popup: "Eiffel Tower" },
    },
    {
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [2.3522, 48.8566],
      },
      properties: { popup: "Notre-Dame" },
    },
    {
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [2.3376, 48.8606],
      },
      properties: { popup: "Louvre Museum" },
    },
    {
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
        coordinates: [
          [2.2945, 48.8584],
          [2.3376, 48.8606],
          [2.3522, 48.8566],
        ],
      },
      properties: { popup: "Tourist Route" },
    },
  ],
};

// Additional Vega-Lite Examples
const scatterSpec = {
  $schema: "https://vega.github.io/schema/vega-lite/v6.json",
  data: {
    values: Array.from({ length: 100 }, (_, idx) => {
      const categoryIndex = Math.floor(stableRandom(251, idx) * 3);
      return {
        x: stableRandom(252, idx) * 100,
        y: stableRandom(253, idx) * 100,
        category: ["A", "B", "C"][categoryIndex],
      };
    }),
  },
  mark: { type: "circle", size: 60 },
  encoding: {
    x: { field: "x", type: "quantitative", title: "Variable X" },
    y: { field: "y", type: "quantitative", title: "Variable Y" },
    color: { field: "category", type: "nominal" },
    tooltip: [
      { field: "x", type: "quantitative" },
      { field: "y", type: "quantitative" },
      { field: "category", type: "nominal" },
    ],
  },
};

const pieSpec = {
  $schema: "https://vega.github.io/schema/vega-lite/v6.json",
  data: {
    values: [
      { category: "Frontend", value: 35 },
      { category: "Backend", value: 28 },
      { category: "Database", value: 18 },
      { category: "DevOps", value: 12 },
      { category: "Testing", value: 7 },
    ],
  },
  mark: { type: "arc", innerRadius: 50 },
  encoding: {
    theta: { field: "value", type: "quantitative" },
    color: { field: "category", type: "nominal" },
    tooltip: [
      { field: "category", type: "nominal" },
      { field: "value", type: "quantitative" },
    ],
  },
};

const areaSpec = {
  $schema: "https://vega.github.io/schema/vega-lite/v6.json",
  data: {
    values: Array.from({ length: 50 }, (_, i) => ({
      time: i,
      value: 50 + Math.sin(i / 5) * 20 + stableRandom(301, i) * 10,
    })),
  },
  mark: { type: "area", line: true, point: false },
  encoding: {
    x: { field: "time", type: "quantitative", title: "Time (s)" },
    y: { field: "value", type: "quantitative", title: "Value" },
    color: { value: "#3b82f6" },
    tooltip: [
      { field: "time", type: "quantitative" },
      { field: "value", type: "quantitative", format: ".2f" },
    ],
  },
};

const lineSpec = {
  $schema: "https://vega.github.io/schema/vega-lite/v6.json",
  data: {
    values: Array.from({ length: 30 }, (_, i) => ({
      day: i + 1,
      temperature: 15 + Math.sin(i / 3) * 10 + stableRandom(302, i) * 5,
    })),
  },
  mark: "line",
  encoding: {
    x: { field: "day", type: "ordinal", title: "Day" },
    y: { field: "temperature", type: "quantitative", title: "°C" },
    color: { datum: "Temperature" },
    tooltip: [
      { field: "day", type: "quantitative" },
      { field: "temperature", type: "quantitative", format: ".1f" },
    ],
  },
};

// Additional Plotly Examples
const barSeries = [
  {
    type: "bar" as const,
    name: "Q1",
    x: ["Product A", "Product B", "Product C", "Product D"],
    y: [20, 14, 23, 18],
    marker: { color: "#3b82f6" },
  },
  {
    type: "bar" as const,
    name: "Q2",
    x: ["Product A", "Product B", "Product C", "Product D"],
    y: [25, 18, 28, 22],
    marker: { color: "#f97316" },
  },
];

const pieData = [
  {
    type: "pie" as const,
    labels: ["React", "Vue", "Angular", "Svelte", "Others"],
    values: [42, 28, 18, 8, 4],
    marker: {
      colors: ["#3b82f6", "#10b981", "#f97316", "#ec4899", "#8b5cf6"],
    },
  },
];

const scatter3dData = [
  {
    type: "scatter3d" as const,
    mode: "markers" as const,
    x: Array.from({ length: 50 }, (_, idx) => stableRandom(401, idx) * 10 - 5),
    y: Array.from({ length: 50 }, (_, idx) => stableRandom(402, idx) * 10 - 5),
    z: Array.from({ length: 50 }, (_, idx) => stableRandom(403, idx) * 10 - 5),
    marker: {
      size: 5,
      color: Array.from(
        { length: 50 },
        (_, idx) => stableRandom(404, idx) * 100
      ),
      colorscale: "Viridis",
      showscale: true,
    },
  },
];

// Additional Heatmap Examples
const correlationMatrix = Array.from({ length: 8 }, (_, i) =>
  Array.from({ length: 8 }, (_, j) => {
    if (i === j) return 1;
    const dist = Math.abs(i - j);
    return Math.max(0, 1 - dist * 0.15 + (stableRandom(501, i, j) - 0.5) * 0.2);
  })
);

const timeSeriesHeatmap = Array.from({ length: 7 }, (_, day) =>
  Array.from({ length: 24 }, (_, hour) => {
    const base = 50;
    const hourEffect = Math.sin(((hour - 6) / 24) * Math.PI * 2) * 30;
    const dayEffect = Math.sin((day / 7) * Math.PI) * 15;
    return Math.max(
      0,
      Math.round(
        base +
          hourEffect +
          dayEffect +
          (stableRandom(502, day, hour) - 0.5) * 20
      )
    );
  })
);

const largeHeatmap = Array.from({ length: 20 }, (_, i) =>
  Array.from({ length: 20 }, (_, j) => {
    const dx = i - 10;
    const dy = j - 10;
    return Math.exp(-((dx * dx + dy * dy) / 50)) * 100;
  })
);

// Additional 3D Plot Examples
const waveSurface = Array.from({ length: 24 }, (_, y) =>
  Array.from({ length: 24 }, (_, x) => {
    const sx = (x - 12) / 4;
    const sy = (y - 12) / 4;
    return Math.sin(sx) * Math.cos(sy) * 1.5;
  })
);

const gaussianSurface = Array.from({ length: 20 }, (_, y) =>
  Array.from({ length: 20 }, (_, x) => {
    const sx = (x - 10) / 3;
    const sy = (y - 10) / 3;
    return Math.exp(-(sx * sx + sy * sy) / 2) * 2;
  })
);

const torusSurface = Array.from({ length: 30 }, (_, y) =>
  Array.from({ length: 30 }, (_, x) => {
    const sx = (x - 15) / 5;
    const sy = (y - 15) / 5;
    const r = Math.sqrt(sx * sx + sy * sy);
    return Math.cos(r * Math.PI) * Math.exp(-r / 2);
  })
);

// Additional Network Examples
const socialNetwork = {
  nodes: Array.from({ length: 15 }, (_, i) => ({
    id: `user${i + 1}`,
    label: `User ${i + 1}`,
  })),
  links: [
    { source: "user1", target: "user2" },
    { source: "user1", target: "user3" },
    { source: "user2", target: "user4" },
    { source: "user3", target: "user4" },
    { source: "user4", target: "user5" },
    { source: "user5", target: "user6" },
    { source: "user6", target: "user7" },
    { source: "user7", target: "user8" },
    { source: "user8", target: "user1" },
    { source: "user9", target: "user10" },
    { source: "user10", target: "user11" },
    { source: "user11", target: "user12" },
    { source: "user12", target: "user13" },
    { source: "user13", target: "user14" },
    { source: "user14", target: "user15" },
    { source: "user15", target: "user9" },
    { source: "user1", target: "user9" },
    { source: "user5", target: "user11" },
  ],
};

const containerLayoutItems: UiDisplay[] = [
  {
    ui: "metric",
    label: "Active experiments",
    value: 8,
    delta: 2,
    helpText: "Compared to last sync",
  },
  {
    ui: "progress",
    label: "Rollout readiness",
    value: 72,
    max: 100,
  },
  {
    ui: "markdown",
    markdown:
      "**Why containers?** Group metrics, charts, and notes without adding extra cards.",
  },
];

const ContainerShowcase: React.FC = () => (
  <Container
    direction="horizontal"
    wrap
    gap={24}
    padding={[16, 24]}
    title="Composable layout"
    subtitle="Blend multiple display types inside a single surface."
    items={containerLayoutItems}
    renderItem={(item) => {
      switch (item.ui) {
        case "metric": {
          const { ui, ...rest } = item;
          void ui;
          return <MetricTile {...rest} className="min-w-[220px]" />;
        }
        case "progress": {
          const { ui, ...rest } = item;
          void ui;
          return <ProgressBar {...rest} className="min-w-[220px]" />;
        }
        case "markdown": {
          const { ui, ...rest } = item;
          void ui;
          return (
            <div className="max-w-[320px] text-sm text-muted-foreground">
              <Markdown {...rest} />
            </div>
          );
        }
        default:
          return null;
      }
    }}
  />
);

type InteractionLogEntry = {
  id: string;
  message: string;
};

const InteractiveComponentsDemo: React.FC = () => {
  const [sliderValue, setSliderValue] = React.useState(60);
  const [textValue, setTextValue] = React.useState(
    "Investigate pod churn before rollout."
  );
  const [logs, setLogs] = React.useState<InteractionLogEntry[]>([]);
  const [buttonBusy, setButtonBusy] = React.useState(false);
  const [lastTrigger, setLastTrigger] = React.useState<string | null>(null);
  const buttonTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const pushLog = React.useCallback((message: string) => {
    setLogs((prev) => {
      const entry: InteractionLogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        message,
      };
      const next = [entry, ...prev];
      return next.slice(0, 5);
    });
  }, []);

  React.useEffect(() => {
    return () => {
      if (buttonTimerRef.current) {
        clearTimeout(buttonTimerRef.current);
        buttonTimerRef.current = null;
      }
    };
  }, []);

  const handleInteraction = React.useCallback<UiInteractionDispatcher>(
    (event) => {
      if (event.handlerId === "interactive-slider-commit") {
        if (typeof event.payload === "number") {
          setSliderValue(event.payload);
          pushLog(`Slider set to ${Math.round(event.payload)}%`);
        }
        return;
      }
      if (
        event.handlerId === "interactive-text-change" ||
        event.handlerId === "interactive-text-submit"
      ) {
        if (typeof event.payload === "string") {
          setTextValue(event.payload);
          const action = event.event === "submit" ? "submitted" : "edited";
          const preview =
            event.payload.length > 60
              ? `${event.payload.slice(0, 57)}…`
              : event.payload || "—";
          pushLog(`Text ${action}: ${preview}`);
        }
        return;
      }
      if (event.handlerId === "interactive-run-click") {
        pushLog("Triggered canary run");
        setButtonBusy(true);
        setLastTrigger(new Date().toLocaleTimeString());
        if (buttonTimerRef.current) {
          clearTimeout(buttonTimerRef.current);
        }
        buttonTimerRef.current = setTimeout(() => {
          setButtonBusy(false);
          buttonTimerRef.current = null;
        }, 900);
        return;
      }
    },
    [pushLog, buttonTimerRef]
  );

  return (
    <UiInteractionContext.Provider
      value={{
        displayId: "interactive-demo",
        onInteraction: handleInteraction,
      }}
    >
      <div className="grid gap-6 md:grid-cols-2">
        <InteractiveSlider
          componentId="interactive-slider"
          label="Alert threshold"
          description="Tune when to page the on-call engineer."
          min={0}
          max={100}
          value={sliderValue}
          showValue
          onCommit={{
            handlerId: "interactive-slider-commit",
            event: "commit",
            payload: "value",
          }}
        />
        <InteractiveTextInput
          componentId="interactive-text"
          label="Runbook notes"
          description="Add context for the next deployment window."
          placeholder="Include owners, mitigations, and reference links."
          value={textValue}
          multiline
          rows={4}
          onChange={{
            handlerId: "interactive-text-change",
            event: "change",
            payload: "value",
            debounceMs: 200,
          }}
          onSubmit={{
            handlerId: "interactive-text-submit",
            event: "submit",
            payload: "value",
          }}
        />
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <InteractiveButton
          componentId="interactive-run"
          label={buttonBusy ? "Running…" : "Run canary check"}
          busy={buttonBusy}
          action={{
            handlerId: "interactive-run-click",
            event: "click",
            payload: "none",
          }}
        />
        <p className="text-sm text-muted-foreground">
          Buttons dispatch a single interaction—perfect for kicking off a
          notebook run or webhook.
        </p>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-md border border-dashed border-muted-foreground/50 bg-muted/40 p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Current values
          </h4>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Threshold</dt>
              <dd className="font-medium text-foreground">
                {Math.round(sliderValue)}%
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Notes</dt>
              <dd className="max-w-[220px] text-right text-muted-foreground break-words">
                {textValue.length ? textValue : "No notes yet"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Last canary</dt>
              <dd className="text-right text-muted-foreground">
                {lastTrigger ?? "Not triggered"}
              </dd>
            </div>
          </dl>
        </div>
        <div className="rounded-md border border-dashed border-muted-foreground/50 bg-muted/40 p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Recent interactions
          </h4>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {logs.length === 0 ? (
              <li>
                No interactions yet — move the slider, edit the note, or run the
                canary.
              </li>
            ) : (
              logs.map((log) => (
                <li key={log.id} className="truncate">
                  {log.message}
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </UiInteractionContext.Provider>
  );
};

export default function UiPlaygroundPage() {
  const [activeSection, setActiveSection] = React.useState("alerts");

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );

    sections.forEach(({ id }) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="sticky top-0 h-screen w-64 shrink-0 overflow-y-auto border-r border-border bg-background/95 p-6 backdrop-blur">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Components
        </h2>
        <nav className="space-y-1">
          {sections.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => scrollToSection(id)}
              className={`block w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                activeSection === id
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-5xl space-y-12 p-6">
          <h1 className="text-2xl font-bold tracking-tight">UI Playground</h1>

          <section id="alerts" className="scroll-mt-6 space-y-3">
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

          <section id="badges" className="scroll-mt-6 space-y-3">
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

          <section id="spinner" className="scroll-mt-6 space-y-3">
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

          <section id="metrics" className="scroll-mt-6 space-y-3">
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

          <section id="interactive" className="scroll-mt-6 space-y-3">
            <h2 className="text-lg font-semibold">Interactive Components</h2>
            <p className="text-sm text-muted-foreground">
              Sliders and text inputs dispatch interaction events back to your
              notebook runtime.
            </p>
            <UiCard>
              <InteractiveComponentsDemo />
            </UiCard>
            <UiCard>
              <h3 className="mb-3 text-sm font-medium">Container layout</h3>
              <ContainerShowcase />
            </UiCard>
          </section>

          <section id="json" className="scroll-mt-6 space-y-3">
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

          <section id="tables" className="scroll-mt-6 space-y-3">
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

          <section id="data-summary" className="scroll-mt-6 space-y-3">
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

          <section id="charts" className="scroll-mt-6 space-y-3">
            <h2 className="text-lg font-semibold">Charts &amp; Graphs</h2>
            <p className="text-sm text-muted-foreground">
              Overview of various chart types - scroll down for detailed
              examples
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <UiCard>
                <h3 className="mb-3 text-sm font-medium">
                  Vega-Lite Bar Chart
                </h3>
                <VegaLiteChart
                  spec={vegaLiteSpec}
                  actions={false}
                  height={280}
                />
              </UiCard>
              <UiCard>
                <h3 className="mb-3 text-sm font-medium">Plotly Line Chart</h3>
                <PlotlyChart data={plotlySeries} layout={plotlyLayout} />
              </UiCard>
            </div>
          </section>

          <section id="vega-lite" className="scroll-mt-6 space-y-3">
            <h2 className="text-lg font-semibold">Vega-Lite Charts</h2>
            <p className="text-sm text-muted-foreground">
              Declarative visualization grammar for creating interactive charts
            </p>
            <div className="grid gap-4">
              <UiCard>
                <h3 className="mb-3 text-sm font-medium">
                  Grouped Bar Chart - Revenue by Channel
                </h3>
                <VegaLiteChart
                  spec={vegaLiteSpec}
                  actions={false}
                  height={320}
                />
              </UiCard>
              <div className="grid gap-4 md:grid-cols-2">
                <UiCard>
                  <h3 className="mb-3 text-sm font-medium">
                    Scatter Plot - Data Distribution
                  </h3>
                  <VegaLiteChart
                    spec={scatterSpec}
                    actions={false}
                    height={320}
                  />
                </UiCard>
                <UiCard>
                  <h3 className="mb-3 text-sm font-medium">
                    Donut Chart - Project Distribution
                  </h3>
                  <VegaLiteChart spec={pieSpec} actions={false} height={320} />
                </UiCard>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <UiCard>
                  <h3 className="mb-3 text-sm font-medium">
                    Area Chart - Time Series
                  </h3>
                  <VegaLiteChart spec={areaSpec} actions={false} height={280} />
                </UiCard>
                <UiCard>
                  <h3 className="mb-3 text-sm font-medium">
                    Line Chart - Temperature Trend
                  </h3>
                  <VegaLiteChart spec={lineSpec} actions={false} height={280} />
                </UiCard>
              </div>
            </div>
          </section>

          <section id="plotly" className="scroll-mt-6 space-y-3">
            <h2 className="text-lg font-semibold">Plotly Charts</h2>
            <p className="text-sm text-muted-foreground">
              Interactive charts powered by Plotly.js
            </p>
            <div className="grid gap-4">
              <UiCard>
                <h3 className="mb-3 text-sm font-medium">
                  Line Chart - Cluster Load (24h)
                </h3>
                <PlotlyChart data={plotlySeries} layout={plotlyLayout} />
              </UiCard>
              <div className="grid gap-4 md:grid-cols-2">
                <UiCard>
                  <h3 className="mb-3 text-sm font-medium">
                    Bar Chart - Quarterly Sales
                  </h3>
                  <PlotlyChart
                    data={barSeries}
                    layout={{
                      title: "Product Sales by Quarter",
                      barmode: "group",
                      margin: { t: 48, r: 16, b: 48, l: 56 },
                    }}
                  />
                </UiCard>
                <UiCard>
                  <h3 className="mb-3 text-sm font-medium">
                    Pie Chart - Framework Usage
                  </h3>
                  <PlotlyChart
                    data={pieData}
                    layout={{
                      title: "Popular Frameworks",
                      margin: { t: 48, r: 16, b: 16, l: 16 },
                    }}
                  />
                </UiCard>
              </div>
              <UiCard>
                <h3 className="mb-3 text-sm font-medium">
                  3D Scatter - Multi-dimensional Data
                </h3>
                <PlotlyChart
                  data={scatter3dData}
                  layout={{
                    title: "3D Data Distribution",
                    margin: { t: 48, r: 0, b: 0, l: 0 },
                    scene: {
                      xaxis: { title: "X" },
                      yaxis: { title: "Y" },
                      zaxis: { title: "Z" },
                    },
                  }}
                />
              </UiCard>
            </div>
          </section>

          <section id="heatmaps" className="scroll-mt-6 space-y-3">
            <h2 className="text-lg font-semibold">Heatmaps</h2>
            <p className="text-sm text-muted-foreground">
              Matrix visualizations with color-coded cells
            </p>
            <div className="grid gap-4">
              <UiCard>
                <h3 className="mb-3 text-sm font-medium">
                  Service Performance - Weekly View
                </h3>
                <HeatmapMatrix
                  values={heatmapValues}
                  xLabels={["Mon", "Tue", "Wed", "Thu", "Fri"]}
                  yLabels={["API", "Workers", "DB", "Cache"]}
                  colorScale="turbo"
                />
              </UiCard>
              <UiCard>
                <h3 className="mb-3 text-sm font-medium">
                  Correlation Matrix - Feature Relationships
                </h3>
                <HeatmapMatrix
                  values={correlationMatrix}
                  xLabels={["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8"]}
                  yLabels={["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8"]}
                  colorScale="turbo"
                  min={-1}
                  max={1}
                />
              </UiCard>
              <UiCard>
                <h3 className="mb-3 text-sm font-medium">
                  Traffic Heatmap - Hourly Activity
                </h3>
                <HeatmapMatrix
                  values={timeSeriesHeatmap}
                  xLabels={Array.from({ length: 24 }, (_, i) => `${i}h`)}
                  yLabels={["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]}
                  colorScale="plasma"
                />
              </UiCard>
              <UiCard>
                <h3 className="mb-3 text-sm font-medium">
                  Large Matrix - Gaussian Distribution
                </h3>
                <HeatmapMatrix
                  values={largeHeatmap}
                  colorScale="viridis"
                  legend={true}
                />
              </UiCard>
            </div>
          </section>

          <section id="network" className="scroll-mt-6 space-y-3">
            <h2 className="text-lg font-semibold">Network Graphs</h2>
            <p className="text-sm text-muted-foreground">
              Visualize relationships and connections between entities
            </p>
            <div className="grid gap-4">
              <UiCard>
                <h3 className="mb-3 text-sm font-medium">
                  Microservices Architecture - Force Layout
                </h3>
                <NetworkGraph
                  nodes={networkNodes}
                  links={networkLinks}
                  layout="force"
                />
              </UiCard>
              <UiCard>
                <h3 className="mb-3 text-sm font-medium">
                  Social Network - Circular Layout
                </h3>
                <NetworkGraph
                  nodes={socialNetwork.nodes}
                  links={socialNetwork.links}
                  layout="circular"
                />
              </UiCard>
            </div>
          </section>

          <section id="plot3d" className="scroll-mt-6 space-y-3">
            <h2 className="text-lg font-semibold">3D Plots</h2>
            <p className="text-sm text-muted-foreground">
              Interactive 3D surface plots with WebGL and X, Y, Z axis markers
            </p>
            <div className="grid gap-4">
              <UiCard>
                <h3 className="mb-3 text-sm font-medium">
                  Ripple Surface - Sine Wave Pattern
                </h3>
                <Plot3dScene
                  surface={{ values: plot3dSurface, colorScale: "magma" }}
                  camera={{ position: [6, 6, 6], target: [0, 0, 0] }}
                  background="#020617"
                />
              </UiCard>
              <UiCard>
                <h3 className="mb-3 text-sm font-medium">
                  Wave Function - Sine × Cosine
                </h3>
                <Plot3dScene
                  surface={{ values: waveSurface, colorScale: "turbo" }}
                  camera={{ position: [8, 8, 8], target: [0, 0, 0] }}
                  background="#0a0a0a"
                />
              </UiCard>
              <UiCard>
                <h3 className="mb-3 text-sm font-medium">
                  Gaussian Distribution - 3D Bell Curve
                </h3>
                <Plot3dScene
                  surface={{ values: gaussianSurface, colorScale: "inferno" }}
                  camera={{ position: [5, 5, 7], target: [0, 0, 0.8] }}
                  background="#1a1a2e"
                />
              </UiCard>
              <UiCard>
                <h3 className="mb-3 text-sm font-medium">
                  Torus Pattern - Radial Waves
                </h3>
                <Plot3dScene
                  surface={{ values: torusSurface, colorScale: "plasma" }}
                  camera={{ position: [10, 10, 10], target: [0, 0, 0] }}
                  background="#16213e"
                />
              </UiCard>
            </div>
          </section>

          <section id="maps" className="scroll-mt-6 space-y-3">
            <h2 className="text-lg font-semibold">Maps</h2>
            <p className="text-sm text-muted-foreground">
              Interactive maps with markers, routes, and GeoJSON overlays
            </p>
            <div className="grid gap-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <UiCard>
                  <h3 className="mb-3 text-sm font-medium">
                    San Francisco - Markers &amp; Routes
                  </h3>
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
                  <h3 className="mb-3 text-sm font-medium">
                    London - Thames River Route
                  </h3>
                  <MapView
                    center={[-0.1276, 51.5074]}
                    zoom={12}
                    style="streets"
                    markers={londonMarkers}
                    geojson={thamesRoute}
                    attribution="© OpenStreetMap contributors"
                    height={320}
                  />
                </UiCard>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <UiCard>
                  <h3 className="mb-3 text-sm font-medium">
                    New York - Central Park GeoJSON
                  </h3>
                  <GeoJsonMap
                    featureCollection={centralParkGeoJson}
                    fillColor="#34d399"
                    lineColor="#047857"
                    opacity={0.4}
                    showMarkers
                    map={{
                      center: [-73.97, 40.78],
                      zoom: 12,
                      style: "terrain",
                    }}
                    height={320}
                  />
                </UiCard>
                <UiCard>
                  <h3 className="mb-3 text-sm font-medium">
                    Tokyo - Districts &amp; Landmarks
                  </h3>
                  <GeoJsonMap
                    featureCollection={tokyoDistricts}
                    fillColor="#3b82f6"
                    lineColor="#1e40af"
                    opacity={0.3}
                    showMarkers
                    map={{
                      center: [139.7, 35.685],
                      zoom: 11,
                      style: "streets",
                    }}
                    height={320}
                  />
                </UiCard>
              </div>
              <UiCard>
                <h3 className="mb-3 text-sm font-medium">
                  Paris - Tourist Landmarks &amp; Routes
                </h3>
                <GeoJsonMap
                  featureCollection={parisLandmarks}
                  fillColor="#ec4899"
                  lineColor="#be185d"
                  opacity={0.5}
                  showMarkers
                  map={{ center: [2.3376, 48.86], zoom: 12, style: "streets" }}
                  height={400}
                />
              </UiCard>
            </div>
          </section>

          <section id="code" className="scroll-mt-6 space-y-3">
            <h2 className="text-lg font-semibold">Code & Markdown & HTML</h2>
            <p className="text-sm text-muted-foreground">
              Rich text rendering with syntax highlighting and formatting
            </p>

            <div className="grid gap-4">
              <UiCard>
                <h3 className="mb-3 text-sm font-medium">
                  Code Block - TypeScript
                </h3>
                <CodeBlock
                  language="ts"
                  code={`export interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
}

export async function fetchUser(id: string): Promise<User> {
  const response = await fetch(\`/api/users/\${id}\`);
  if (!response.ok) {
    throw new Error("Failed to fetch user");
  }
  return response.json();
}`}
                />
              </UiCard>

              <UiCard>
                <h3 className="mb-3 text-sm font-medium">
                  Code Block - Python
                </h3>
                <CodeBlock
                  language="python"
                  code={`def fibonacci(n: int) -> list[int]:
    """Generate Fibonacci sequence up to n terms."""
    if n <= 0:
        return []
    elif n == 1:
        return [0]
    
    sequence = [0, 1]
    for i in range(2, n):
        sequence.append(sequence[i-1] + sequence[i-2])
    return sequence

# Generate first 10 Fibonacci numbers
result = fibonacci(10)
print(result)  # [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]`}
                />
              </UiCard>

              <UiCard>
                <h3 className="mb-3 text-sm font-medium">
                  Rich Markdown - Full Featured
                </h3>
                <Markdown
                  markdown={`# Heading 1
## Heading 2
### Heading 3

This is a **bold text** and this is *italic text*. You can also use ***bold and italic*** together.

Here's a [link to NodeBooks](https://nodebooks.io) and some \`inline code\`.

## Lists

### Unordered List
- First item
- Second item
  - Nested item 1
  - Nested item 2
- Third item

### Ordered List
1. First step
2. Second step
3. Third step

## Code Block
\`\`\`javascript
const greeting = "Hello, World!";
console.log(greeting);
\`\`\`

## Blockquote
> This is a blockquote.
> It can span multiple lines.
>
> — Famous Person

## Table
| Feature | Status | Priority |
|---------|--------|----------|
| Auth | ✅ Done | High |
| Charts | 🚧 In Progress | Medium |
| Export | 📋 Planned | Low |

## Task List
- [x] Completed task
- [x] Another completed task
- [ ] Pending task
- [ ] Future task

---

**Note:** Markdown supports horizontal rules too!`}
                />
              </UiCard>

              <UiCard>
                <h3 className="mb-3 text-sm font-medium">
                  LaTeX Math Equations
                </h3>
                <Markdown
                  markdown={`## Mathematical Expressions

### Inline Math
The quadratic formula is $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$ where $a \\neq 0$.

The Pythagorean theorem states that $a^2 + b^2 = c^2$ for right triangles.

### Display Math (Block)

$$
\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}
$$

$$
E = mc^2
$$

$$
\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}
$$

### Matrix
$$
A = \\begin{bmatrix}
a_{11} & a_{12} & a_{13} \\\\
a_{21} & a_{22} & a_{23} \\\\
a_{31} & a_{32} & a_{33}
\\end{bmatrix}
$$

### Probability
$$
P(A|B) = \\frac{P(B|A) \\cdot P(A)}{P(B)}
$$`}
                />
              </UiCard>

              <UiCard>
                <h3 className="mb-3 text-sm font-medium">
                  Mermaid Diagrams - Flowchart
                </h3>
                <Markdown
                  markdown={`\`\`\`mermaid
graph TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great!]
    B -->|No| D[Debug]
    D --> E[Fix the bug]
    E --> B
    C --> F[End]
\`\`\`

This is a simple decision flowchart showing a debugging process.`}
                />
              </UiCard>

              <UiCard>
                <h3 className="mb-3 text-sm font-medium">
                  Mermaid Diagrams - Sequence
                </h3>
                <Markdown
                  markdown={`\`\`\`mermaid
sequenceDiagram
    participant User
    participant Browser
    participant Server
    participant Database
    
    User->>Browser: Click Login
    Browser->>Server: POST /login
    Server->>Database: Query user
    Database-->>Server: User data
    Server-->>Browser: JWT token
    Browser-->>User: Show dashboard
\`\`\`

Authentication flow diagram showing the interaction between components.`}
                />
              </UiCard>

              <UiCard>
                <h3 className="mb-3 text-sm font-medium">
                  Mermaid Diagrams - Entity Relationship
                </h3>
                <Markdown
                  markdown={`\`\`\`mermaid
erDiagram
    USER ||--o{ ORDER : places
    USER {
        string id PK
        string name
        string email
    }
    ORDER ||--|{ ORDER_ITEM : contains
    ORDER {
        string id PK
        date created_at
        string status
    }
    PRODUCT ||--o{ ORDER_ITEM : "ordered in"
    PRODUCT {
        string id PK
        string name
        decimal price
    }
    ORDER_ITEM {
        int quantity
        decimal subtotal
    }
\`\`\`

Database schema showing relationships between users, orders, and products.`}
                />
              </UiCard>

              <UiCard>
                <h3 className="mb-3 text-sm font-medium">Sanitized HTML</h3>
                <HtmlBlock html="<div><h3>HTML Content</h3><p>This <strong>HTML</strong> is <em>sanitized</em> for security.</p><ul><li>Safe rendering</li><li>XSS protection</li></ul></div>" />
              </UiCard>
            </div>
          </section>

          <section id="image" className="scroll-mt-6 space-y-3">
            <h2 className="text-lg font-semibold">Images</h2>
            <p className="text-sm text-muted-foreground">
              Display images with different sizing and fit options
            </p>
            <div className="grid gap-4">
              <UiCard>
                <h3 className="mb-3 text-sm font-medium">Logo - Contain Fit</h3>
                <UiImage
                  src="/icon.svg"
                  alt="NodeBooks Logo"
                  width={220}
                  height={66}
                  fit="contain"
                />
              </UiCard>

              <div className="grid gap-4 md:grid-cols-2">
                <UiCard>
                  <h3 className="mb-3 text-sm font-medium">
                    Square Format - Cover Fit
                  </h3>
                  <UiImage
                    src="/icon.svg"
                    alt="NodeBooks"
                    width={200}
                    height={200}
                    fit="cover"
                  />
                </UiCard>

                <UiCard>
                  <h3 className="mb-3 text-sm font-medium">
                    Square Format - Contain Fit
                  </h3>
                  <UiImage
                    src="/icon.svg"
                    alt="NodeBooks"
                    width={200}
                    height={200}
                    fit="contain"
                  />
                </UiCard>
              </div>

              <UiCard>
                <h3 className="mb-3 text-sm font-medium">
                  Wide Banner - Fill Mode
                </h3>
                <UiImage
                  src="/icon.svg"
                  alt="NodeBooks Banner"
                  width={800}
                  height={200}
                  fit="fill"
                />
              </UiCard>

              <div className="grid gap-4 md:grid-cols-3">
                <UiCard>
                  <h3 className="mb-3 text-sm font-medium">Small</h3>
                  <UiImage
                    src="/icon.svg"
                    alt="Small"
                    width={100}
                    height={100}
                    fit="contain"
                  />
                </UiCard>

                <UiCard>
                  <h3 className="mb-3 text-sm font-medium">Medium</h3>
                  <UiImage
                    src="/icon.svg"
                    alt="Medium"
                    width={150}
                    height={150}
                    fit="contain"
                  />
                </UiCard>

                <UiCard>
                  <h3 className="mb-3 text-sm font-medium">Large</h3>
                  <UiImage
                    src="/icon.svg"
                    alt="Large"
                    width={200}
                    height={200}
                    fit="contain"
                  />
                </UiCard>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
