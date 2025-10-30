import { z, type ZodTypeAny } from "zod";
import { NotebookTemplateBadgeSchema } from "./templates.js";

export const ThemeModeSchema = z.enum(["light", "dark"]);
export type ThemeMode = z.infer<typeof ThemeModeSchema>;

export const AiProviderSchema = z.enum(["openai", "heroku"]);

export const AiOpenAISettingsSchema = z
  .object({
    model: z.string().min(1).optional(),
    apiKey: z.string().min(1).optional(),
  })
  .strict()
  .partial();

export const AiHerokuSettingsSchema = z
  .object({
    modelId: z.string().min(1).optional(),
    inferenceKey: z.string().min(1).optional(),
    inferenceUrl: z.string().min(1).optional(),
  })
  .strict()
  .partial();

export const AiSettingsSchema = z
  .object({
    provider: AiProviderSchema.optional(),
    openai: AiOpenAISettingsSchema.optional(),
    heroku: AiHerokuSettingsSchema.optional(),
  })
  .strict()
  .partial();

export const GlobalSettingsSchema = z
  .object({
    theme: ThemeModeSchema.optional(),
    kernelTimeoutMs: z.number().int().min(1_000).max(600_000).optional(),
    password: z.union([z.string(), z.null()]).optional(),
    aiEnabled: z.boolean().optional(),
    terminalCellsEnabled: z.boolean().optional(),
    ai: AiSettingsSchema.optional(),
  })
  .catchall(z.unknown());

export type AiProvider = z.infer<typeof AiProviderSchema>;
export type AiOpenAISettings = z.infer<typeof AiOpenAISettingsSchema>;
export type AiHerokuSettings = z.infer<typeof AiHerokuSettingsSchema>;
export type AiSettings = z.infer<typeof AiSettingsSchema>;
export type GlobalSettings = z.infer<typeof GlobalSettingsSchema>;

const AiCellResponseUsageSchema = z
  .object({
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    totalTokens: z.number().int().nonnegative().optional(),
  })
  .strict()
  .partial();

export const AiCellResponseSchema = z
  .object({
    text: z.string().default(""),
    model: z.string().optional(),
    finishReason: z.string().optional(),
    timestamp: z.string().optional(),
    usage: AiCellResponseUsageSchema.optional(),
    costUsd: z.number().nonnegative().optional(),
    error: z.string().optional(),
    raw: z.unknown().optional(),
  })
  .strict()
  .partial();

export const AiCellSchema = z.object({
  id: z.string(),
  type: z.literal("ai"),
  metadata: z.record(z.string(), z.unknown()).default({}),
  prompt: z.string().default(""),
  system: z.string().default(""),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  topP: z.number().min(0).max(1).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  response: AiCellResponseSchema.optional(),
});

export type AiCell = z.infer<typeof AiCellSchema>;
export type AiCellResponse = z.infer<typeof AiCellResponseSchema>;

// Vendor MIME type for structured UI displays
export const NODEBOOKS_UI_MIME = "application/vnd.nodebooks.ui+json" as const;

const FALLBACK_NODE_VERSION = "20.x" as const;
const FALLBACK_GENERIC_RUNTIME_VERSION = "latest" as const;

export const SLUG_MAX_LENGTH = 120 as const;

export const SlugSchema = z
  .string()
  .min(1)
  .max(SLUG_MAX_LENGTH)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const normalizeSlug = (value: string): string => {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const normalized = trimmed
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  const sliced = normalized.slice(0, SLUG_MAX_LENGTH).replace(/^-+|-+$/g, "");
  return sliced;
};

export const suggestSlug = (
  input: string | null | undefined,
  fallback?: string | null
): string | null => {
  const primary = normalizeSlug(input ?? "");
  if (primary) {
    return primary;
  }
  const alternate = normalizeSlug(fallback ?? "");
  return alternate || null;
};

/**
 * Best-effort detection of the local Node.js runtime version. When executed in
 * a non-Node environment (e.g. the browser), the fallback semantic version is
 * returned instead.
 */
export const detectNodeRuntimeVersion = (): string => {
  try {
    const maybeProcess =
      typeof globalThis === "object" && globalThis
        ? (globalThis as { process?: { versions?: { node?: unknown } } })
            .process
        : undefined;
    const version =
      typeof maybeProcess?.versions?.node === "string"
        ? maybeProcess.versions.node
        : undefined;
    return typeof version === "string" && version.trim().length > 0
      ? version
      : FALLBACK_NODE_VERSION;
  } catch {
    return FALLBACK_NODE_VERSION;
  }
};

// UI Display schemas (rendered specially by the frontend)
export const UiImageSchema = z.object({
  ui: z.literal("image"),
  // Either a full URL, a data URL, or a raw base64 payload
  src: z.string(),
  // Required when src is a raw base64 payload without data URL prefix
  mimeType: z.string().optional(),
  alt: z.string().optional(),
  width: z.union([z.number(), z.string()]).optional(),
  height: z.union([z.number(), z.string()]).optional(),
  fit: z.enum(["contain", "cover", "fill", "none", "scale-down"]).optional(),
  borderRadius: z.number().optional(),
});

export const UiMarkdownSchema = z.object({
  ui: z.literal("markdown"),
  markdown: z.string(),
});

export const UiHtmlSchema = z.object({
  ui: z.literal("html"),
  html: z.string(),
});

export const UiJsonSchema = z.object({
  ui: z.literal("json"),
  json: z.unknown(),
  collapsed: z.boolean().optional(),
  maxDepth: z.number().int().positive().optional(),
});

export const UiCodeSchema = z.object({
  ui: z.literal("code"),
  code: z.string(),
  language: z.string().optional(),
});

// Data & Tables
export const UiTableSchema = z.object({
  ui: z.literal("table"),
  // Array of records to render. Keys are column names.
  rows: z.array(z.record(z.string(), z.unknown())),
  // Optional explicit column order/labels
  columns: z
    .array(
      z.object({
        key: z.string(),
        label: z.string().optional(),
        align: z.enum(["left", "center", "right"]).optional(),
      })
    )
    .optional(),
  // Initial sorting
  sort: z
    .object({
      key: z.string(),
      direction: z.enum(["asc", "desc"]).default("asc"),
    })
    .optional(),
  // Initial pagination
  page: z
    .object({
      index: z.number().int().nonnegative().default(0),
      size: z.number().int().positive().max(1000).default(20),
    })
    .optional(),
  density: z.enum(["compact", "normal", "spacious"]).optional(),
});

export const UiDataSummarySchema = z.object({
  ui: z.literal("dataSummary"),
  title: z.string().optional(),
  schema: z
    .array(
      z.object({
        name: z.string(),
        type: z.string(),
        nullable: z.boolean().optional(),
      })
    )
    .optional(),
  // Stats per field (numbers are optional; render when present)
  stats: z
    .record(
      z.string(),
      z.object({
        count: z.number().optional(),
        distinct: z.number().optional(),
        min: z.number().optional(),
        max: z.number().optional(),
        mean: z.number().optional(),
        median: z.number().optional(),
        p25: z.number().optional(),
        p75: z.number().optional(),
        stddev: z.number().optional(),
        nulls: z.number().optional(),
      })
    )
    .optional(),
  sample: z.array(z.record(z.string(), z.unknown())).optional(),
  note: z.string().optional(),
});

// Charts & Visualization
const VegaSpecSchema = z.record(z.string(), z.unknown());

export const UiVegaLiteSchema = z.object({
  ui: z.literal("vegaLite"),
  spec: VegaSpecSchema,
  height: z.number().positive().optional(),
  width: z.number().positive().optional(),
  renderer: z.enum(["canvas", "svg"]).optional(),
  actions: z.boolean().optional(),
});

export const UiPlotlySchema = z.object({
  ui: z.literal("plotly"),
  data: z.array(z.unknown()),
  layout: z.record(z.string(), z.unknown()).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  responsive: z.boolean().optional(),
});

export const UiHeatmapSchema = z.object({
  ui: z.literal("heatmap"),
  values: z.array(z.array(z.number())),
  xLabels: z.array(z.string()).optional(),
  yLabels: z.array(z.string()).optional(),
  colorScale: z
    .enum(["viridis", "plasma", "magma", "inferno", "turbo", "custom"])
    .optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  legend: z.boolean().optional(),
});

const GraphNodeSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  group: z.string().optional(),
  size: z.number().positive().optional(),
  color: z.string().optional(),
});

const GraphLinkSchema = z.object({
  source: z.string(),
  target: z.string(),
  value: z.number().optional(),
  directed: z.boolean().optional(),
  color: z.string().optional(),
});

export const UiNetworkGraphSchema = z.object({
  ui: z.literal("networkGraph"),
  nodes: z.array(GraphNodeSchema),
  links: z.array(GraphLinkSchema),
  physics: z
    .object({
      linkDistance: z.number().positive().optional(),
      chargeStrength: z.number().optional(),
      linkStrength: z.number().optional(),
    })
    .optional(),
  layout: z.enum(["force", "circular", "grid"]).optional(),
});

const ThreeVectorSchema = z.tuple([z.number(), z.number(), z.number()]);

export const UiPlot3dSchema = z.object({
  ui: z.literal("plot3d"),
  points: z
    .array(
      z.object({
        position: ThreeVectorSchema,
        color: z.string().optional(),
        size: z.number().positive().optional(),
      })
    )
    .optional(),
  lines: z
    .array(
      z.object({
        points: z.array(ThreeVectorSchema).min(2),
        color: z.string().optional(),
        width: z.number().positive().optional(),
      })
    )
    .optional(),
  surface: z
    .object({
      values: z.array(z.array(z.number())),
      xStep: z.number().positive().optional(),
      yStep: z.number().positive().optional(),
      colorScale: z
        .enum(["viridis", "plasma", "magma", "inferno", "turbo", "grey"])
        .optional(),
    })
    .optional(),
  camera: z
    .object({
      position: ThreeVectorSchema.optional(),
      target: ThreeVectorSchema.optional(),
    })
    .optional(),
  background: z.string().optional(),
});

const LngLatTupleSchema = z.tuple([z.number(), z.number()]);

const MapBoundsSchema = z.object({
  sw: LngLatTupleSchema,
  ne: LngLatTupleSchema,
  padding: z
    .union([
      z.number().nonnegative(),
      z.tuple([
        z.number().nonnegative(),
        z.number().nonnegative(),
        z.number().nonnegative(),
        z.number().nonnegative(),
      ]),
    ])
    .optional(),
});

const MapMarkerSchema = z.object({
  id: z.string().optional(),
  coordinates: LngLatTupleSchema,
  color: z.string().optional(),
  popup: z.string().optional(),
});

const GeoJsonSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(
    z.object({
      type: z.literal("Feature"),
      geometry: z.object({
        type: z.string(),
        coordinates: z.unknown(),
      }),
      properties: z.record(z.string(), z.unknown()).optional(),
    })
  ),
});

export const UiMapSchema = z.object({
  ui: z.literal("map"),
  center: LngLatTupleSchema.optional(),
  zoom: z.number().min(0).max(22).optional(),
  pitch: z.number().min(0).max(85).optional(),
  bearing: z.number().optional(),
  bounds: MapBoundsSchema.optional(),
  markers: z.array(MapMarkerSchema).optional(),
  style: z
    .union([
      z.literal("streets"),
      z.literal("outdoors"),
      z.literal("light"),
      z.literal("dark"),
      z.literal("satellite"),
      z.literal("terrain"),
      z.string(),
    ])
    .optional(),
  attribution: z.string().optional(),
  geojson: GeoJsonSchema.optional(),
  height: z.number().positive().optional(),
});

export const UiGeoJsonSchema = z.object({
  ui: z.literal("geoJson"),
  featureCollection: GeoJsonSchema,
  map: z
    .object({
      center: LngLatTupleSchema.optional(),
      zoom: z.number().min(0).max(22).optional(),
      style: z
        .union([
          z.literal("streets"),
          z.literal("outdoors"),
          z.literal("light"),
          z.literal("dark"),
          z.literal("satellite"),
          z.literal("terrain"),
          z.string(),
        ])
        .optional(),
      attribution: z.string().optional(),
    })
    .optional(),
  fillColor: z.string().optional(),
  lineColor: z.string().optional(),
  lineWidth: z.number().positive().optional(),
  opacity: z.number().min(0).max(1).optional(),
  showMarkers: z.boolean().optional(),
  height: z.number().positive().optional(),
});

// Status & Metrics
export const UiAlertSchema = z.object({
  ui: z.literal("alert"),
  // visual style
  level: z.enum(["info", "success", "warn", "error"]).default("info"),
  title: z.string().optional(),
  text: z.string().optional(),
  // optionally provide preformatted HTML (will be sanitized in renderer)
  html: z.string().optional(),
});

export const UiBadgeSchema = z.object({
  ui: z.literal("badge"),
  text: z.string(),
  color: z.enum(["neutral", "info", "success", "warn", "error"]).optional(),
});

export const UiMetricSchema = z.object({
  ui: z.literal("metric"),
  label: z.string().optional(),
  value: z.union([z.string(), z.number()]),
  unit: z.string().optional(),
  delta: z.number().optional(),
  helpText: z.string().optional(),
});

export const UiProgressSchema = z.object({
  ui: z.literal("progress"),
  label: z.string().optional(),
  value: z.number().min(0).max(100).optional(),
  max: z.number().positive().default(100).optional(),
  indeterminate: z.boolean().optional(),
});

export const UiSpinnerSchema = z.object({
  ui: z.literal("spinner"),
  label: z.string().optional(),
  size: z.union([z.number().positive(), z.enum(["sm", "md", "lg"])]).optional(),
});

const UiContainerAlignSchema = z.enum(["start", "center", "end", "stretch"]);
const UiContainerJustifySchema = z.enum(["start", "center", "end", "between"]);
const UiContainerPaddingSchema = z.union([
  z.number().nonnegative(),
  z.tuple([z.number().nonnegative(), z.number().nonnegative()]),
  z.tuple([
    z.number().nonnegative(),
    z.number().nonnegative(),
    z.number().nonnegative(),
    z.number().nonnegative(),
  ]),
]);

export const UiInteractionActionSchema = z
  .object({
    handlerId: z.string(),
    event: z.string().min(1),
    payload: z.enum(["none", "value", "text", "json"]).default("none"),
    debounceMs: z.number().int().nonnegative().optional(),
  })
  .strict();

const UiDisplaySchemaLazy: ZodTypeAny = z.lazy(createUiDisplayUnionSchema);

export const UiContainerSchema = z
  .object({
    ui: z.literal("container"),
    componentId: z.string(),
    direction: z.enum(["vertical", "horizontal"]).default("vertical"),
    wrap: z.boolean().optional(),
    gap: z.number().nonnegative().optional(),
    align: UiContainerAlignSchema.optional(),
    justify: UiContainerJustifySchema.optional(),
    padding: UiContainerPaddingSchema.optional(),
    background: z.string().optional(),
    border: z
      .object({
        color: z.string().optional(),
        width: z.number().nonnegative().optional(),
        radius: z.number().nonnegative().optional(),
      })
      .optional(),
    title: z.string().optional(),
    subtitle: z.string().optional(),
    children: z.array(UiDisplaySchemaLazy),
  })
  .strict();

export const UiButtonSchema = z
  .object({
    ui: z.literal("button"),
    componentId: z.string(),
    label: z.string().default("Run"),
    variant: z
      .enum(["primary", "secondary", "outline", "ghost"])
      .default("primary"),
    size: z.enum(["sm", "md", "lg"]).default("md"),
    disabled: z.boolean().optional(),
    tooltip: z.string().optional(),
    busy: z.boolean().optional(),
    action: UiInteractionActionSchema,
  })
  .strict();

export const UiSliderSchema = z
  .object({
    ui: z.literal("slider"),
    componentId: z.string(),
    label: z.string().optional(),
    description: z.string().optional(),
    min: z.number().finite().default(0),
    max: z.number().finite(),
    step: z.number().positive().optional(),
    value: z.number().optional(),
    defaultValue: z.number().optional(),
    disabled: z.boolean().optional(),
    showValue: z.boolean().optional(),
    onChange: UiInteractionActionSchema.optional(),
    onCommit: UiInteractionActionSchema.optional(),
  })
  .strict()
  .refine(
    (val) => {
      if (typeof val.value === "number") {
        return val.value >= val.min && val.value <= val.max;
      }
      if (typeof val.defaultValue === "number") {
        return val.defaultValue >= val.min && val.defaultValue <= val.max;
      }
      return true;
    },
    {
      message: "Slider value must be within [min, max]",
      path: ["value"],
    }
  )
  .refine((val) => val.max > val.min, {
    message: "Slider max must be greater than min",
    path: ["max"],
  });

export const UiTextInputSchema = z
  .object({
    ui: z.literal("textInput"),
    componentId: z.string(),
    label: z.string().optional(),
    description: z.string().optional(),
    value: z.string().optional(),
    defaultValue: z.string().optional(),
    placeholder: z.string().optional(),
    disabled: z.boolean().optional(),
    multiline: z.boolean().optional(),
    rows: z.number().int().positive().optional(),
    onChange: UiInteractionActionSchema.optional(),
    onSubmit: UiInteractionActionSchema.optional(),
  })
  .strict();

export const UiDisplaySchema = UiDisplaySchemaLazy;

function createUiDisplayUnionSchema(): ZodTypeAny {
  return z.discriminatedUnion("ui", [
    UiImageSchema,
    UiMarkdownSchema,
    UiHtmlSchema,
    UiJsonSchema,
    UiCodeSchema,
    UiTableSchema,
    UiDataSummarySchema,
    UiVegaLiteSchema,
    UiPlotlySchema,
    UiHeatmapSchema,
    UiNetworkGraphSchema,
    UiPlot3dSchema,
    UiMapSchema,
    UiGeoJsonSchema,
    UiAlertSchema,
    UiBadgeSchema,
    UiMetricSchema,
    UiProgressSchema,
    UiSpinnerSchema,
    UiContainerSchema,
    UiButtonSchema,
    UiSliderSchema,
    UiTextInputSchema,
  ]);
}
export type UiDisplay =
  | UiImage
  | UiMarkdown
  | UiHtml
  | UiJson
  | UiCode
  | UiTable
  | UiDataSummary
  | UiVegaLite
  | UiPlotly
  | UiHeatmap
  | UiNetworkGraph
  | UiPlot3d
  | UiMap
  | UiGeoJson
  | UiAlert
  | UiBadge
  | UiMetric
  | UiProgress
  | UiSpinner
  | UiContainer
  | UiButton
  | UiSlider
  | UiTextInput;
export type UiImage = z.infer<typeof UiImageSchema>;
export type UiMarkdown = z.infer<typeof UiMarkdownSchema>;
export type UiHtml = z.infer<typeof UiHtmlSchema>;
export type UiJson = z.infer<typeof UiJsonSchema>;
export type UiCode = z.infer<typeof UiCodeSchema>;
export type UiTable = z.infer<typeof UiTableSchema>;
export type UiDataSummary = z.infer<typeof UiDataSummarySchema>;
export type UiVegaLite = z.infer<typeof UiVegaLiteSchema>;
export type UiPlotly = z.infer<typeof UiPlotlySchema>;
export type UiHeatmap = z.infer<typeof UiHeatmapSchema>;
export type UiNetworkGraph = z.infer<typeof UiNetworkGraphSchema>;
export type UiPlot3d = z.infer<typeof UiPlot3dSchema>;
export type UiMap = z.infer<typeof UiMapSchema>;
export type UiGeoJson = z.infer<typeof UiGeoJsonSchema>;
export type UiAlert = z.infer<typeof UiAlertSchema>;
export type UiBadge = z.infer<typeof UiBadgeSchema>;
export type UiMetric = z.infer<typeof UiMetricSchema>;
export type UiProgress = z.infer<typeof UiProgressSchema>;
export type UiSpinner = z.infer<typeof UiSpinnerSchema>;
export type UiInteractionAction = z.infer<typeof UiInteractionActionSchema>;
export type UiButton = z.infer<typeof UiButtonSchema>;
export type UiSlider = z.infer<typeof UiSliderSchema>;
export type UiTextInput = z.infer<typeof UiTextInputSchema>;
type UiContainerBase = z.infer<typeof UiContainerSchema>;
export type UiContainer = Omit<UiContainerBase, "children"> & {
  children: UiDisplay[];
};

const createId = () => {
  if (
    typeof globalThis.crypto !== "undefined" &&
    "randomUUID" in globalThis.crypto
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `nb_${Math.random().toString(36).slice(2, 10)}`;
};

export const OutputExecutionSchema = z.object({
  started: z.number().nonnegative(),
  ended: z.number().nonnegative(),
  status: z.enum(["ok", "error", "aborted"]).default("ok"),
  error: z
    .object({
      name: z.string(),
      message: z.string(),
      stack: z.string().optional(),
    })
    .optional(),
});

export const StreamOutputSchema = z.object({
  type: z.literal("stream"),
  name: z.enum(["stdout", "stderr"]),
  text: z.string(),
});

export const DisplayDataSchema = z.object({
  type: z.enum(["display_data", "execute_result", "update_display_data"]),
  data: z.record(z.string(), z.unknown()),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const ErrorOutputSchema = z.object({
  type: z.literal("error"),
  ename: z.string(),
  evalue: z.string(),
  traceback: z.array(z.string()).default([]),
});

export const NotebookOutputSchema = z.discriminatedUnion("type", [
  StreamOutputSchema,
  DisplayDataSchema,
  ErrorOutputSchema,
]);

export const HttpMethodSchema = z.enum([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);
export type HttpMethod = z.infer<typeof HttpMethodSchema>;

export const HttpHeaderSchema = z.object({
  id: z.string(),
  name: z.string().default(""),
  value: z.string().default(""),
  enabled: z.boolean().default(true),
});
export type HttpHeader = z.infer<typeof HttpHeaderSchema>;

export const HttpQueryParamSchema = z.object({
  id: z.string(),
  name: z.string().default(""),
  value: z.string().default(""),
  enabled: z.boolean().default(true),
});
export type HttpQueryParam = z.infer<typeof HttpQueryParamSchema>;

export const HttpRequestBodySchema = z.object({
  mode: z.enum(["none", "json", "text"]).default("none"),
  text: z.string().default(""),
  contentType: z.string().default("application/json"),
});
export type HttpRequestBody = z.infer<typeof HttpRequestBodySchema>;

export const HttpRequestSchema = z.object({
  method: HttpMethodSchema.default("GET"),
  url: z.string().default(""),
  headers: z.array(HttpHeaderSchema).default([]),
  query: z.array(HttpQueryParamSchema).default([]),
  body: HttpRequestBodySchema.default({
    mode: "none",
    text: "",
    contentType: "application/json",
  }),
});
export type HttpRequest = z.infer<typeof HttpRequestSchema>;

export const HttpResponseHeaderSchema = z.object({
  name: z.string(),
  value: z.string(),
});
export type HttpResponseHeader = z.infer<typeof HttpResponseHeaderSchema>;

export const HttpResponseBodySchema = z.object({
  type: z.enum(["json", "text", "binary"]).default("text"),
  text: z.string().optional(),
  json: z.unknown().optional(),
  size: z.number().int().nonnegative().optional(),
  contentType: z.string().optional(),
  encoding: z.enum(["utf8", "base64"]).optional(),
});
export type HttpResponseBody = z.infer<typeof HttpResponseBodySchema>;

export const HttpResponseSchema = z.object({
  status: z.number().int().nonnegative().optional(),
  statusText: z.string().optional(),
  ok: z.boolean().optional(),
  url: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
  timestamp: z.string().optional(),
  headers: z.array(HttpResponseHeaderSchema).default([]),
  body: HttpResponseBodySchema.optional(),
  error: z.string().optional(),
  curl: z.string().optional(),
  assignedVariable: z.string().optional(),
  assignedBody: z.string().optional(),
  assignedHeaders: z.string().optional(),
});
export type HttpResponse = z.infer<typeof HttpResponseSchema>;

export const MarkdownCellSchema = z.object({
  id: z.string(),
  type: z.literal("markdown"),
  source: z.string().default(""),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const TerminalCellSchema = z.object({
  id: z.string(),
  type: z.literal("terminal"),
  metadata: z.record(z.string(), z.unknown()).default({}),
  buffer: z.string().default(""),
});

export const CommandCellSchema = z.object({
  id: z.string(),
  type: z.literal("command"),
  metadata: z.record(z.string(), z.unknown()).default({}),
  command: z.string().default(""),
  notes: z.string().default(""),
});

export const LegacyShellCellSchema = z.object({
  id: z.string(),
  type: z.literal("shell"),
  metadata: z.record(z.string(), z.unknown()).default({}),
  buffer: z.string().default(""),
});

export const SmartCellTypeSchema = z.enum(["terminal", "command"]);
export type SmartCellType = z.infer<typeof SmartCellTypeSchema>;
export const SMART_CELL_TYPES = SmartCellTypeSchema.options;

export const CodeCellSchema = z.object({
  id: z.string(),
  type: z.literal("code"),
  language: z.enum(["js", "ts"]).default("js"),
  source: z.string().default(""),
  metadata: z
    .object({
      timeoutMs: z.number().int().positive().max(600_000).optional(),
      display: z.record(z.string(), z.unknown()).optional(),
      editor: z
        .object({
          fontSize: z.number().int().min(8).max(72).optional(),
          wordWrap: z.enum(["off", "on"]).optional(),
          minimap: z.boolean().optional(),
          lineNumbers: z.enum(["off", "on"]).optional(),
        })
        .optional(),
    })
    .catchall(z.unknown())
    .default({}),
  outputs: z.array(NotebookOutputSchema).default([]),
  execution: OutputExecutionSchema.optional(),
});

const DEFAULT_HTTP_REQUEST = HttpRequestSchema.parse({});

export const HttpCellSchema = z.object({
  id: z.string(),
  type: z.literal("http"),
  metadata: z.record(z.string(), z.unknown()).default({}),
  request: HttpRequestSchema.default(DEFAULT_HTTP_REQUEST),
  response: HttpResponseSchema.optional(),
  assignVariable: z.string().optional(),
  assignBody: z.string().optional(),
  assignHeaders: z.string().optional(),
});

export const SqlDriverSchema = z.enum(["postgres"]);
export type SqlDriver = z.infer<typeof SqlDriverSchema>;

const SqlPostgresConnectionSchema = z.object({
  id: z.string(),
  driver: z.literal("postgres"),
  name: z.string().default(""),
  config: z
    .object({
      connectionString: z.string().default(""),
    })
    .default({ connectionString: "" }),
});

export const SqlConnectionSchema = z.discriminatedUnion("driver", [
  SqlPostgresConnectionSchema,
]);
export type SqlConnection = z.infer<typeof SqlConnectionSchema>;

export const NotebookSqlSchema = z.object({
  connections: z.array(SqlConnectionSchema).default([]),
});
export type NotebookSql = z.infer<typeof NotebookSqlSchema>;

export const SqlColumnSchema = z.object({
  name: z.string(),
  dataType: z.string().optional(),
});
export type SqlColumn = z.infer<typeof SqlColumnSchema>;

export const SqlResultSchema = z.object({
  rowCount: z.number().int().nonnegative().optional(),
  durationMs: z.number().nonnegative().optional(),
  columns: z.array(SqlColumnSchema).default([]),
  rows: z.array(z.record(z.string(), z.unknown())).default([]),
  assignedVariable: z.string().optional(),
  timestamp: z.string().optional(),
  error: z.string().optional(),
});
export type SqlResult = z.infer<typeof SqlResultSchema>;

export const SqlCellSchema = z.object({
  id: z.string(),
  type: z.literal("sql"),
  metadata: z.record(z.string(), z.unknown()).default({}),
  connectionId: z.string().optional(),
  query: z.string().default(""),
  assignVariable: z.string().optional(),
  result: SqlResultSchema.optional(),
});
export type SqlCell = z.infer<typeof SqlCellSchema>;

const PlotSqlDataSourceSchema = z.object({
  type: z.literal("sql"),
  cellId: z.string().optional(),
  resultKey: z.enum(["rows", "assigned"]).default("rows"),
});

const PlotHttpDataSourceSchema = z.object({
  type: z.literal("http"),
  cellId: z.string().optional(),
  path: z.array(z.union([z.string(), z.number()])).default([]),
});

const PlotCodeDataSourceSchema = z.object({
  type: z.literal("code"),
  cellId: z.string().optional(),
  outputIndex: z.number().int().nonnegative().optional(),
  path: z.array(z.union([z.string(), z.number()])).default([]),
});

const PlotGlobalDataSourceSchema = z.object({
  type: z.literal("global"),
  variable: z.string().optional(),
  path: z.array(z.union([z.string(), z.number()])).default([]),
});

export const PlotDataSourceSchema = z.discriminatedUnion("type", [
  PlotSqlDataSourceSchema,
  PlotHttpDataSourceSchema,
  PlotCodeDataSourceSchema,
  PlotGlobalDataSourceSchema,
]);
export type PlotDataSource = z.infer<typeof PlotDataSourceSchema>;

export const PlotTraceBindingSchema = z
  .object({
    id: z.string().default(() => createId()),
    name: z.string().optional(),
    type: z.string().optional(),
    mode: z.string().optional(),
    x: z.string().optional(),
    y: z.string().optional(),
    z: z.string().optional(),
    color: z.string().optional(),
    size: z.string().optional(),
    text: z.string().optional(),
    fill: z.string().optional(),
    stackgroup: z.string().optional(),
  })
  .strict();
export type PlotTraceBinding = z.infer<typeof PlotTraceBindingSchema>;

export const PlotBindingsSchema = z
  .object({
    traces: z.array(PlotTraceBindingSchema).default([]),
  })
  .strict();
export type PlotBindings = z.infer<typeof PlotBindingsSchema>;

export const PlotSnapshotSchema = z
  .object({
    dataUrl: z
      .string()
      .regex(/^data:image\/png;base64,/)
      .describe("PNG data URL for the captured chart"),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    capturedAt: z.string().optional(),
    fileName: z.string().optional(),
  })
  .strict();
export type PlotSnapshot = z.infer<typeof PlotSnapshotSchema>;

export const PlotlyTraceSchema = z
  .object({
    id: z.string().default(() => createId()),
    name: z.string().optional(),
    type: z.string().optional(),
    mode: z.string().optional(),
    x: z.array(z.unknown()).optional(),
    y: z.array(z.unknown()).optional(),
    z: z.array(z.unknown()).optional(),
    text: z.array(z.unknown()).optional(),
    marker: z.record(z.string(), z.unknown()).optional(),
    hovertemplate: z.string().optional(),
    customdata: z.array(z.unknown()).optional(),
  })
  .passthrough();
export type PlotlyTrace = z.infer<typeof PlotlyTraceSchema>;

export const PlotCellResultSchema = z
  .object({
    traces: z.array(PlotlyTraceSchema).default([]),
    layout: z.record(z.string(), z.unknown()).default({}),
    fields: z.array(z.string()).default([]),
    source: PlotDataSourceSchema,
    chartType: z.string().optional(),
    timestamp: z.string().optional(),
    error: z.string().optional(),
  })
  .strict();
export type PlotCellResult = z.infer<typeof PlotCellResultSchema>;

export const PlotCellSchema = z.object({
  id: z.string(),
  type: z.literal("plot"),
  metadata: z.record(z.string(), z.unknown()).default({}),
  chartType: z.string().default("scatter"),
  dataSource: PlotDataSourceSchema.default({
    type: "global",
    variable: "",
    path: [],
  }),
  bindings: PlotBindingsSchema.default({ traces: [] }),
  layout: z.record(z.string(), z.unknown()).default({}),
  layoutEnabled: z.boolean().optional(),
  result: PlotCellResultSchema.optional(),
  snapshot: PlotSnapshotSchema.optional(),
});
export type PlotCell = z.infer<typeof PlotCellSchema>;

export const NOTEBOOK_CELL_SCHEMAS = {
  markdown: MarkdownCellSchema,
  terminal: TerminalCellSchema,
  command: CommandCellSchema,
  code: CodeCellSchema,
  ai: AiCellSchema,
  http: HttpCellSchema,
  sql: SqlCellSchema,
  plot: PlotCellSchema,
} as const;

export type NotebookCellType = keyof typeof NOTEBOOK_CELL_SCHEMAS;

export const NOTEBOOK_CELL_TYPES = Object.keys(NOTEBOOK_CELL_SCHEMAS) as [
  NotebookCellType,
  ...NotebookCellType[],
];

const NOTEBOOK_CELL_SCHEMA_LIST = Object.values(NOTEBOOK_CELL_SCHEMAS) as [
  typeof MarkdownCellSchema,
  typeof TerminalCellSchema,
  typeof CommandCellSchema,
  typeof CodeCellSchema,
  typeof AiCellSchema,
  typeof HttpCellSchema,
  typeof SqlCellSchema,
  typeof PlotCellSchema,
];

const NOTEBOOK_CELL_SCHEMA_LIST_WITH_LEGACY = [
  ...NOTEBOOK_CELL_SCHEMA_LIST,
  LegacyShellCellSchema,
] as const;

const RawNotebookCellSchema = z.discriminatedUnion(
  "type",
  NOTEBOOK_CELL_SCHEMA_LIST_WITH_LEGACY
);

export const NotebookCellSchema = RawNotebookCellSchema.transform((cell) =>
  cell.type === "shell" ? upgradeLegacyShellCell(cell) : cell
);

export const NotebookFileEnvSchema = z.object({
  runtime: z.enum(["node"]).optional(),
  version: z.string().optional(),
  packages: z.record(z.string(), z.string()).optional(),
  variables: z.record(z.string(), z.string()).optional(),
});

export const NotebookFileMarkdownCellSchema = z.object({
  type: z.literal("markdown"),
  source: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const NotebookFileTerminalCellSchema = z.object({
  type: z.literal("terminal"),
  metadata: z.record(z.string(), z.unknown()).optional(),
  buffer: z.string().optional(),
});

export const NotebookFileCommandCellSchema = z.object({
  type: z.literal("command"),
  metadata: z.record(z.string(), z.unknown()).optional(),
  command: z.string().optional(),
  notes: z.string().optional(),
});

export const NotebookFileLegacyShellCellSchema = z.object({
  type: z.literal("shell"),
  metadata: z.record(z.string(), z.unknown()).optional(),
  buffer: z.string().optional(),
});

export const NotebookFileCodeCellSchema = z.object({
  type: z.literal("code"),
  language: z.enum(["js", "ts"]).optional(),
  source: z.string(),
  metadata: z
    .object({
      timeoutMs: z.number().int().positive().max(600_000).optional(),
      display: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  outputs: z.array(NotebookOutputSchema).optional(),
});

export const NotebookFileAiCellSchema = z.object({
  type: z.literal("ai"),
  metadata: z.record(z.string(), z.unknown()).optional(),
  prompt: z.string().optional(),
  system: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  topP: z.number().min(0).max(1).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  response: AiCellResponseSchema.optional(),
});

export const NotebookFileHttpCellSchema = z.object({
  type: z.literal("http"),
  metadata: z.record(z.string(), z.unknown()).optional(),
  request: HttpRequestSchema.optional(),
  response: HttpResponseSchema.optional(),
  assignVariable: z.string().optional(),
  assignBody: z.string().optional(),
  assignHeaders: z.string().optional(),
});

export const NotebookFileSqlCellSchema = z.object({
  type: z.literal("sql"),
  metadata: z.record(z.string(), z.unknown()).optional(),
  connectionId: z.string().optional(),
  query: z.string().optional(),
  assignVariable: z.string().optional(),
  result: SqlResultSchema.optional(),
});

export const NotebookFilePlotCellSchema = z.object({
  type: z.literal("plot"),
  metadata: z.record(z.string(), z.unknown()).optional(),
  chartType: z.string().optional(),
  dataSource: PlotDataSourceSchema.optional(),
  bindings: PlotBindingsSchema.optional(),
  layout: z.record(z.string(), z.unknown()).optional(),
  layoutEnabled: z.boolean().optional(),
  result: PlotCellResultSchema.optional(),
  snapshot: PlotSnapshotSchema.optional(),
});

export const NOTEBOOK_FILE_CELL_SCHEMAS = {
  markdown: NotebookFileMarkdownCellSchema,
  terminal: NotebookFileTerminalCellSchema,
  command: NotebookFileCommandCellSchema,
  legacyShell: NotebookFileLegacyShellCellSchema,
  code: NotebookFileCodeCellSchema,
  ai: NotebookFileAiCellSchema,
  http: NotebookFileHttpCellSchema,
  sql: NotebookFileSqlCellSchema,
  plot: NotebookFilePlotCellSchema,
} as const;

export type NotebookFileCellType = keyof typeof NOTEBOOK_FILE_CELL_SCHEMAS;

export const NOTEBOOK_FILE_CELL_TYPES = Object.keys(
  NOTEBOOK_FILE_CELL_SCHEMAS
) as [NotebookFileCellType, ...NotebookFileCellType[]];

const NOTEBOOK_FILE_CELL_SCHEMA_LIST = Object.values(
  NOTEBOOK_FILE_CELL_SCHEMAS
) as [
  typeof NotebookFileMarkdownCellSchema,
  typeof NotebookFileTerminalCellSchema,
  typeof NotebookFileCommandCellSchema,
  typeof NotebookFileLegacyShellCellSchema,
  typeof NotebookFileCodeCellSchema,
  typeof NotebookFileAiCellSchema,
  typeof NotebookFileHttpCellSchema,
  typeof NotebookFileSqlCellSchema,
  typeof NotebookFilePlotCellSchema,
];

export const NotebookFileCellSchema = z.discriminatedUnion(
  "type",
  NOTEBOOK_FILE_CELL_SCHEMA_LIST
);

export const NotebookFileNotebookSchema = z.object({
  name: z.string().optional(),
  env: NotebookFileEnvSchema.optional(),
  sql: NotebookSqlSchema.optional(),
  cells: z.array(NotebookFileCellSchema).default([]),
});

export const NotebookFileSummarySchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  badge: NotebookTemplateBadgeSchema.optional(),
  tags: z.array(z.string()).optional(),
  order: z.number().int().nonnegative().optional(),
});

export const NotebookFileSchema = NotebookFileSummarySchema.extend({
  notebook: NotebookFileNotebookSchema,
});

export const NotebookEnvSchema = z.object({
  runtime: z.enum(["node"]).default("node"),
  version: z.string().default(() => detectNodeRuntimeVersion()),
  packages: z.record(z.string(), z.string()).default({}),
  // Key-value environment variables available to code cells via process.env
  variables: z.record(z.string(), z.string()).default({}),
});

export const NotebookSchema = z.object({
  id: z.string(),
  name: z.string(),
  env: NotebookEnvSchema,
  sql: NotebookSqlSchema.default({ connections: [] }),
  cells: z.array(NotebookCellSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
  projectId: z.string().optional().nullable(),
  projectOrder: z.number().int().nonnegative().optional().nullable(),
  published: z.boolean().default(false),
  publicSlug: SlugSchema.nullish(),
});

export type Notebook = z.infer<typeof NotebookSchema>;
export type NotebookCell = z.infer<typeof NotebookCellSchema>;
export type NotebookEnv = z.infer<typeof NotebookEnvSchema>;
export type CodeCell = z.infer<typeof CodeCellSchema>;
export type HttpCell = z.infer<typeof HttpCellSchema>;
export type MarkdownCell = z.infer<typeof MarkdownCellSchema>;
export type TerminalCell = z.infer<typeof TerminalCellSchema>;
export type CommandCell = z.infer<typeof CommandCellSchema>;
export type LegacyShellCell = z.infer<typeof LegacyShellCellSchema>;
export type NotebookOutput = z.infer<typeof NotebookOutputSchema>;
export type StreamOutput = z.infer<typeof StreamOutputSchema>;
export type DisplayDataOutput = z.infer<typeof DisplayDataSchema>;
export type ErrorOutput = z.infer<typeof ErrorOutputSchema>;
export type OutputExecution = z.infer<typeof OutputExecutionSchema>;
export type NotebookFileEnv = z.infer<typeof NotebookFileEnvSchema>;
export type NotebookFileMarkdownCell = z.infer<
  typeof NotebookFileMarkdownCellSchema
>;
export type NotebookFileTerminalCell = z.infer<
  typeof NotebookFileTerminalCellSchema
>;
export type NotebookFileCommandCell = z.infer<
  typeof NotebookFileCommandCellSchema
>;
export type NotebookFileLegacyShellCell = z.infer<
  typeof NotebookFileLegacyShellCellSchema
>;
export type NotebookFileCodeCell = z.infer<typeof NotebookFileCodeCellSchema>;
export type NotebookFileAiCell = z.infer<typeof NotebookFileAiCellSchema>;
export type NotebookFileHttpCell = z.infer<typeof NotebookFileHttpCellSchema>;
export type NotebookFileSqlCell = z.infer<typeof NotebookFileSqlCellSchema>;
export type NotebookFilePlotCell = z.infer<typeof NotebookFilePlotCellSchema>;
export type NotebookFileCell = z.infer<typeof NotebookFileCellSchema>;
export type NotebookFileNotebook = z.infer<typeof NotebookFileNotebookSchema>;
export type NotebookFileSummary = z.infer<typeof NotebookFileSummarySchema>;
export type NotebookFile = z.infer<typeof NotebookFileSchema>;

export const ProjectRoleSchema = z.enum(["editor", "viewer"]);
export type ProjectRole = z.infer<typeof ProjectRoleSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: SlugSchema,
  published: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const normalizeNotebookEnvVersion = <
  T extends { runtime: NotebookEnv["runtime"]; version?: string },
>(
  env: T
): T & { version: string } => {
  const rawVersion = typeof env.version === "string" ? env.version.trim() : "";
  if (env.runtime === "node") {
    const normalized =
      rawVersion && rawVersion !== FALLBACK_NODE_VERSION
        ? rawVersion
        : detectNodeRuntimeVersion();
    return { ...env, version: normalized };
  }
  if (rawVersion) {
    return { ...env, version: rawVersion };
  }
  return { ...env, version: FALLBACK_GENERIC_RUNTIME_VERSION };
};

export const ensureNotebookRuntimeVersion = (notebook: Notebook): Notebook => {
  const normalizedSql = NotebookSqlSchema.parse(notebook.sql ?? {});
  return {
    ...notebook,
    env: normalizeNotebookEnvVersion(notebook.env),
    sql: normalizedSql,
    projectId: notebook.projectId ?? null,
    projectOrder:
      notebook.projectOrder === undefined ? null : notebook.projectOrder,
    publicSlug: (() => {
      const candidate = notebook.publicSlug ?? null;
      if (!candidate) {
        return null;
      }
      const normalized = normalizeSlug(candidate);
      return normalized || null;
    })(),
    published: Boolean(notebook.published),
  };
};

export const createEmptyNotebook = (partial?: Partial<Notebook>): Notebook => {
  const now = new Date().toISOString();
  const base: Notebook = {
    id: partial?.id ?? createId(),
    name: partial?.name ?? "Untitled Notebook",
    env: NotebookEnvSchema.parse(partial?.env ?? {}),
    sql: NotebookSqlSchema.parse(partial?.sql ?? {}),
    cells: partial?.cells ?? [],
    createdAt: partial?.createdAt ?? now,
    updatedAt: partial?.updatedAt ?? now,
    projectId: partial?.projectId ?? null,
    projectOrder:
      partial?.projectOrder === undefined ? null : partial.projectOrder,
    published: partial?.published ?? false,
    publicSlug: partial?.publicSlug ?? null,
  };
  const parsed = NotebookSchema.parse({ ...base, ...partial });
  return ensureNotebookRuntimeVersion(parsed);
};

export const createCodeCell = (partial?: Partial<CodeCell>): CodeCell => {
  return CodeCellSchema.parse({
    id: partial?.id ?? createId(),
    type: "code",
    language: partial?.language ?? "ts",
    source: partial?.source ?? "",
    metadata: partial?.metadata ?? {},
    outputs: partial?.outputs ?? [],
    execution: partial?.execution,
  });
};

export const createHttpCell = (partial?: Partial<HttpCell>): HttpCell => {
  const request = partial?.request
    ? HttpRequestSchema.parse(partial.request)
    : HttpRequestSchema.parse({});
  const response =
    partial?.response === undefined
      ? undefined
      : HttpResponseSchema.parse(partial.response);

  return HttpCellSchema.parse({
    id: partial?.id ?? createId(),
    type: "http",
    metadata: partial?.metadata ?? {},
    request,
    response,
    assignVariable: partial?.assignVariable,
    assignBody: partial?.assignBody,
    assignHeaders: partial?.assignHeaders,
  });
};

export const createSqlCell = (partial?: Partial<SqlCell>): SqlCell => {
  return SqlCellSchema.parse({
    id: partial?.id ?? createId(),
    type: "sql",
    metadata: partial?.metadata ?? {},
    connectionId: partial?.connectionId,
    query: partial?.query ?? "",
    assignVariable: partial?.assignVariable,
    result: partial?.result,
  });
};

export const createPlotCell = (partial?: Partial<PlotCell>): PlotCell => {
  const dataSource = partial?.dataSource
    ? PlotDataSourceSchema.parse(partial.dataSource)
    : PlotDataSourceSchema.parse({ type: "sql", resultKey: "rows" });
  const bindings = partial?.bindings
    ? PlotBindingsSchema.parse(partial.bindings)
    : PlotBindingsSchema.parse({});
  const layout = partial?.layout
    ? PlotCellSchema.shape.layout.parse(partial.layout)
    : {};
  const layoutEnabled =
    partial?.layoutEnabled ??
    (partial?.layout ? Object.keys(partial.layout).length > 0 : false);
  return PlotCellSchema.parse({
    id: partial?.id ?? createId(),
    type: "plot",
    metadata: partial?.metadata ?? {},
    chartType: partial?.chartType ?? "scatter",
    dataSource,
    bindings,
    layout,
    layoutEnabled,
    result: partial?.result,
    snapshot: partial?.snapshot,
  });
};

export const createAiCell = (partial?: Partial<AiCell>): AiCell => {
  return AiCellSchema.parse({
    id: partial?.id ?? createId(),
    type: "ai",
    metadata: partial?.metadata ?? {},
    prompt: partial?.prompt ?? "",
    system: partial?.system ?? "",
    model: partial?.model,
    temperature: partial?.temperature,
    maxTokens: partial?.maxTokens,
    topP: partial?.topP,
    frequencyPenalty: partial?.frequencyPenalty,
    presencePenalty: partial?.presencePenalty,
    response: partial?.response,
  });
};

export const createMarkdownCell = (
  partial?: Partial<MarkdownCell>
): MarkdownCell => {
  return MarkdownCellSchema.parse({
    id: partial?.id ?? createId(),
    type: "markdown",
    source: partial?.source ?? "",
    metadata: partial?.metadata ?? {},
  });
};

export const createTerminalCell = (
  partial?: Partial<TerminalCell>
): TerminalCell => {
  return TerminalCellSchema.parse({
    id: partial?.id ?? createId(),
    type: "terminal",
    metadata: partial?.metadata ?? {},
    buffer: partial?.buffer ?? "",
  });
};

export const createCommandCell = (
  partial?: Partial<CommandCell>
): CommandCell => {
  return CommandCellSchema.parse({
    id: partial?.id ?? createId(),
    type: "command",
    metadata: partial?.metadata ?? {},
    command: partial?.command ?? "",
    notes: partial?.notes ?? "",
  });
};

export const upgradeLegacyShellCell = (
  legacy: LegacyShellCell
): TerminalCell => {
  return TerminalCellSchema.parse({
    ...legacy,
    type: "terminal",
  });
};

export const KernelHelloMessageSchema = z.object({
  type: z.literal("hello"),
  notebookId: z.string(),
  sessionId: z.string(),
});

export const KernelStatusMessageSchema = z.object({
  type: z.literal("status"),
  state: z.enum(["idle", "busy"]),
});

export const KernelExecuteReplySchema = z.object({
  type: z.literal("execute_reply"),
  cellId: z.string(),
  status: z.enum(["ok", "error", "aborted"]).default("ok"),
  execTimeMs: z.number().nonnegative(),
  globals: z.record(z.string(), z.unknown()).optional(),
});

export const KernelStreamMessageSchema = StreamOutputSchema.extend({
  cellId: z.string(),
});

export const KernelDisplayMessageSchema = DisplayDataSchema.extend({
  cellId: z.string(),
});

export const KernelErrorMessageSchema = ErrorOutputSchema.extend({
  cellId: z.string(),
});

export const KernelServerMessageSchema = z.discriminatedUnion("type", [
  KernelHelloMessageSchema,
  KernelStatusMessageSchema,
  KernelStreamMessageSchema,
  KernelDisplayMessageSchema,
  KernelErrorMessageSchema,
  KernelExecuteReplySchema,
]);

export const KernelExecuteRequestSchema = z.object({
  type: z.literal("execute_request"),
  cellId: z.string(),
  code: z.string(),
  language: z.enum(["js", "ts"]).default("js"),
  timeoutMs: z.number().int().positive().max(600_000).optional(),
  globals: z.record(z.string(), z.unknown()).optional(),
});

export const KernelInterruptRequestSchema = z.object({
  type: z.literal("interrupt_request"),
  notebookId: z.string(),
});

export const KernelUiEventRequestSchema = z.object({
  type: z.literal("ui_event"),
  cellId: z.string(),
  handlerId: z.string(),
  event: z.string().min(1),
  payload: z.unknown().optional(),
  displayId: z.string().optional(),
  componentId: z.string().optional(),
  globals: z.record(z.string(), z.unknown()).optional(),
});

export const KernelClientMessageSchema = z.discriminatedUnion("type", [
  KernelExecuteRequestSchema,
  KernelInterruptRequestSchema,
  KernelUiEventRequestSchema,
]);

export type KernelHelloMessage = z.infer<typeof KernelHelloMessageSchema>;
export type KernelStatusMessage = z.infer<typeof KernelStatusMessageSchema>;
export type KernelExecuteReplyMessage = z.infer<
  typeof KernelExecuteReplySchema
>;
export type KernelStreamMessage = z.infer<typeof KernelStreamMessageSchema>;
export type KernelDisplayMessage = z.infer<typeof KernelDisplayMessageSchema>;
export type KernelErrorMessage = z.infer<typeof KernelErrorMessageSchema>;
export type KernelServerMessage = z.infer<typeof KernelServerMessageSchema>;
export type KernelExecuteRequest = z.infer<typeof KernelExecuteRequestSchema>;
export type KernelInterruptRequest = z.infer<
  typeof KernelInterruptRequestSchema
>;
export type KernelUiEventRequest = z.infer<typeof KernelUiEventRequestSchema>;
export type KernelClientMessage = z.infer<typeof KernelClientMessageSchema>;

export {
  NotebookTemplateSummarySchema,
  NotebookTemplateBadgeSchema,
  TemplateBadgeToneSchema,
} from "./templates.js";
export type {
  NotebookTemplateSummary,
  NotebookTemplateBadge,
  TemplateBadgeTone,
  NotebookTemplateId,
} from "./templates.js";
