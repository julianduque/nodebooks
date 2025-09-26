// Local type definitions injected into Monaco for virtual/sandbox modules.
// These mirror the helpers provided by the runtime for users to import
// inside code cells, e.g. `import { UiImage } from "@nodebooks/ui"`.

export const nodebooksUiDts = `declare module "@nodebooks/ui" {
export type UiImageOptions = {
  alt?: string;
  width?: number | string;
  height?: number | string;
  fit?: "contain" | "cover" | "fill" | "none" | "scale-down";
  borderRadius?: number;
  mimeType?: string;
};
export declare function UiImage(src: string, opts?: UiImageOptions): { ui: "image" } & UiImageOptions & { src: string };
export declare function UiImage(opts: { ui?: "image"; src: string } & UiImageOptions): { ui: "image" } & UiImageOptions & { src: string };
export declare function UiMarkdown(markdown: string): { ui: "markdown"; markdown: string };
export declare function UiHTML(html: string): { ui: "html"; html: string };
export type UiJsonOptions = { collapsed?: boolean; maxDepth?: number };
export declare function UiJSON(json: unknown, opts?: UiJsonOptions): { ui: "json"; json: unknown } & UiJsonOptions;
export type UiCodeOptions = { language?: string; wrap?: boolean };
export declare function UiCode(code: string, opts?: UiCodeOptions): { ui: "code"; code: string } & UiCodeOptions;
export type UiTableColumn = { key: string; label?: string; align?: "left" | "center" | "right" };
export type UiTableOptions = {
  columns?: UiTableColumn[];
  sort?: { key: string; direction?: "asc" | "desc" };
  page?: { index?: number; size?: number };
  density?: "compact" | "normal" | "spacious";
};
export declare function UiTable(rows: Array<Record<string, unknown>>, opts?: UiTableOptions): { ui: "table"; rows: Array<Record<string, unknown>> } & UiTableOptions;
export declare function UiTable(opts: { ui?: "table"; rows: Array<Record<string, unknown>> } & UiTableOptions): { ui: "table"; rows: Array<Record<string, unknown>> } & UiTableOptions;
export type UiDataSummaryOptions = {
  title?: string;
  schema?: Array<{ name: string; type: string; nullable?: boolean }>;
  stats?: Record<string, { count?: number; distinct?: number; min?: number; max?: number; mean?: number; median?: number; p25?: number; p75?: number; stddev?: number; nulls?: number }>;
  sample?: Array<Record<string, unknown>>;
  note?: string;
};
export declare function UiDataSummary(opts: UiDataSummaryOptions): { ui: "dataSummary" } & UiDataSummaryOptions;
export type UiAlertOptions = { level?: "info" | "success" | "warn" | "error"; title?: string; text?: string; html?: string };
export declare function UiAlert(opts: UiAlertOptions): { ui: "alert" } & UiAlertOptions;
export type UiBadgeOptions = { color?: "neutral" | "info" | "success" | "warn" | "error" };
export declare function UiBadge(text: string, opts?: UiBadgeOptions): { ui: "badge"; text: string } & UiBadgeOptions;
export declare function UiBadge(opts: { ui?: "badge"; text: string } & UiBadgeOptions): { ui: "badge"; text: string } & UiBadgeOptions;
export type UiMetricOptions = { label?: string; unit?: string; delta?: number; helpText?: string };
export declare function UiMetric(value: string | number, opts?: UiMetricOptions): { ui: "metric"; value: string | number } & UiMetricOptions;
export declare function UiMetric(opts: { ui?: "metric"; value: string | number } & UiMetricOptions): { ui: "metric"; value: string | number } & UiMetricOptions;
export type UiProgressOptions = { label?: string; max?: number; indeterminate?: boolean };
export declare function UiProgress(value: number, opts?: UiProgressOptions): { ui: "progress"; value: number } & UiProgressOptions;
export declare function UiProgress(opts: { ui?: "progress"; value?: number; max?: number; indeterminate?: boolean }): { ui: "progress" } & UiProgressOptions & { value?: number };
export type UiSpinnerOptions = { label?: string; size?: number | "sm" | "md" | "lg" };
export declare function UiSpinner(opts?: UiSpinnerOptions): { ui: "spinner" } & UiSpinnerOptions;
}
`;
