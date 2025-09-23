import { z } from "zod";

// Vendor MIME type for structured UI displays
export const NODEBOOKS_UI_MIME = "application/vnd.nodebooks.ui+json" as const;

const FALLBACK_NODE_VERSION = "20.x" as const;
const FALLBACK_GENERIC_RUNTIME_VERSION = "latest" as const;

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
  wrap: z.boolean().optional(),
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
  color: z
    .enum(["neutral", "info", "success", "warn", "error", "brand"])
    .optional(),
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

export const UiDisplaySchema = z.discriminatedUnion("ui", [
  UiImageSchema,
  UiMarkdownSchema,
  UiHtmlSchema,
  UiJsonSchema,
  UiCodeSchema,
  UiTableSchema,
  UiDataSummarySchema,
  UiAlertSchema,
  UiBadgeSchema,
  UiMetricSchema,
  UiProgressSchema,
  UiSpinnerSchema,
]);
export type UiDisplay = z.infer<typeof UiDisplaySchema>;
export type UiImage = z.infer<typeof UiImageSchema>;
export type UiMarkdown = z.infer<typeof UiMarkdownSchema>;
export type UiHtml = z.infer<typeof UiHtmlSchema>;
export type UiJson = z.infer<typeof UiJsonSchema>;
export type UiCode = z.infer<typeof UiCodeSchema>;
export type UiTable = z.infer<typeof UiTableSchema>;
export type UiDataSummary = z.infer<typeof UiDataSummarySchema>;
export type UiAlert = z.infer<typeof UiAlertSchema>;
export type UiBadge = z.infer<typeof UiBadgeSchema>;
export type UiMetric = z.infer<typeof UiMetricSchema>;
export type UiProgress = z.infer<typeof UiProgressSchema>;
export type UiSpinner = z.infer<typeof UiSpinnerSchema>;

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

export const MarkdownCellSchema = z.object({
  id: z.string(),
  type: z.literal("markdown"),
  source: z.string().default(""),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const CodeCellSchema = z.object({
  id: z.string(),
  type: z.literal("code"),
  language: z.enum(["js", "ts"]).default("js"),
  source: z.string().default(""),
  metadata: z
    .object({
      timeoutMs: z.number().int().positive().max(600_000).optional(),
      display: z.record(z.string(), z.unknown()).optional(),
    })
    .default({}),
  outputs: z.array(NotebookOutputSchema).default([]),
  execution: OutputExecutionSchema.optional(),
});

export const NotebookCellSchema = z.discriminatedUnion("type", [
  MarkdownCellSchema,
  CodeCellSchema,
]);

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
  cells: z.array(NotebookCellSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Notebook = z.infer<typeof NotebookSchema>;
export type NotebookCell = z.infer<typeof NotebookCellSchema>;
export type NotebookEnv = z.infer<typeof NotebookEnvSchema>;
export type CodeCell = z.infer<typeof CodeCellSchema>;
export type MarkdownCell = z.infer<typeof MarkdownCellSchema>;
export type NotebookOutput = z.infer<typeof NotebookOutputSchema>;
export type StreamOutput = z.infer<typeof StreamOutputSchema>;
export type DisplayDataOutput = z.infer<typeof DisplayDataSchema>;
export type ErrorOutput = z.infer<typeof ErrorOutputSchema>;
export type OutputExecution = z.infer<typeof OutputExecutionSchema>;

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
  return { ...notebook, env: normalizeNotebookEnvVersion(notebook.env) };
};

export const createEmptyNotebook = (partial?: Partial<Notebook>): Notebook => {
  const now = new Date().toISOString();
  const base: Notebook = {
    id: partial?.id ?? createId(),
    name: partial?.name ?? "Untitled Notebook",
    env: NotebookEnvSchema.parse(partial?.env ?? {}),
    cells: partial?.cells ?? [],
    createdAt: partial?.createdAt ?? now,
    updatedAt: partial?.updatedAt ?? now,
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
});

export const KernelInterruptRequestSchema = z.object({
  type: z.literal("interrupt_request"),
  notebookId: z.string(),
});

export const KernelClientMessageSchema = z.discriminatedUnion("type", [
  KernelExecuteRequestSchema,
  KernelInterruptRequestSchema,
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
