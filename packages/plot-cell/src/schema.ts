import { z } from "zod";

const createId = (): string => {
  if (
    typeof globalThis.crypto !== "undefined" &&
    "randomUUID" in globalThis.crypto
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `nb_${Math.random().toString(36).slice(2, 10)}`;
};

/**
 * Plot data source schemas - different ways to load data into a plot.
 */
const PlotSqlDataSourceSchema = z.object({
  type: z.literal("sql"),
  cellId: z.string().optional(),
  resultKey: z.enum(["rows", "assigned"]).default("rows"),
});
export type PlotSqlDataSource = z.infer<typeof PlotSqlDataSourceSchema>;

const PlotHttpDataSourceSchema = z.object({
  type: z.literal("http"),
  cellId: z.string().optional(),
  path: z.array(z.union([z.string(), z.number()])).default([]),
});
export type PlotHttpDataSource = z.infer<typeof PlotHttpDataSourceSchema>;

const PlotCodeDataSourceSchema = z.object({
  type: z.literal("code"),
  cellId: z.string().optional(),
  outputIndex: z.number().int().nonnegative().optional(),
  path: z.array(z.union([z.string(), z.number()])).default([]),
});
export type PlotCodeDataSource = z.infer<typeof PlotCodeDataSourceSchema>;

const PlotGlobalDataSourceSchema = z.object({
  type: z.literal("global"),
  variable: z.string().optional(),
  path: z.array(z.union([z.string(), z.number()])).default([]),
});
export type PlotGlobalDataSource = z.infer<typeof PlotGlobalDataSourceSchema>;

export const PlotDataSourceSchema = z.discriminatedUnion("type", [
  PlotSqlDataSourceSchema,
  PlotHttpDataSourceSchema,
  PlotCodeDataSourceSchema,
  PlotGlobalDataSourceSchema,
]);
export type PlotDataSource = z.infer<typeof PlotDataSourceSchema>;

/**
 * Plot trace binding schema - maps data fields to chart dimensions.
 */
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

/**
 * Plot bindings schema - collection of trace bindings.
 */
export const PlotBindingsSchema = z
  .object({
    traces: z.array(PlotTraceBindingSchema).default([]),
  })
  .strict();
export type PlotBindings = z.infer<typeof PlotBindingsSchema>;

/**
 * Plot snapshot schema - captured PNG image of the chart.
 */
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

/**
 * Plotly trace schema - rendered trace data.
 */
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

/**
 * Plot cell result schema - output of plot rendering.
 */
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

/**
 * Plot cell schema - Create interactive charts and visualizations.
 */
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

/**
 * Factory function to create a new plot cell.
 */
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

/**
 * Plot cell file schema - For notebook file serialization.
 */
export const NotebookFilePlotCellSchema = z.object({
  type: z.literal("plot"),
  metadata: z.record(z.string(), z.unknown()).optional(),
  chartType: z.string().optional(),
  dataSource: PlotDataSourceSchema.optional(),
  bindings: PlotBindingsSchema.optional(),
  layout: z.record(z.string(), z.unknown()).optional(),
  result: PlotCellResultSchema.optional(),
  snapshot: PlotSnapshotSchema.optional(),
});
export type NotebookFilePlotCell = z.infer<typeof NotebookFilePlotCellSchema>;
