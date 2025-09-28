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
export type UiVegaLiteOptions = { height?: number; width?: number; renderer?: "canvas" | "svg"; actions?: boolean };
export declare function UiVegaLite(spec: Record<string, unknown>, opts?: UiVegaLiteOptions): { ui: "vegaLite"; spec: Record<string, unknown> } & UiVegaLiteOptions;
export declare function UiVegaLite(opts: { ui?: "vegaLite"; spec: Record<string, unknown> } & UiVegaLiteOptions): { ui: "vegaLite"; spec: Record<string, unknown> } & UiVegaLiteOptions;
export type UiPlotlyOptions = { layout?: Record<string, unknown>; config?: Record<string, unknown>; responsive?: boolean };
export declare function UiPlotly(data: unknown[], opts?: UiPlotlyOptions): { ui: "plotly"; data: unknown[] } & UiPlotlyOptions;
export declare function UiPlotly(opts: { ui?: "plotly"; data: unknown[] } & UiPlotlyOptions): { ui: "plotly"; data: unknown[] } & UiPlotlyOptions;
export type UiHeatmapOptions = { xLabels?: string[]; yLabels?: string[]; colorScale?: "viridis" | "plasma" | "magma" | "inferno" | "turbo" | "custom"; min?: number; max?: number; legend?: boolean };
export declare function UiHeatmap(values: number[][], opts?: UiHeatmapOptions): { ui: "heatmap"; values: number[][] } & UiHeatmapOptions;
export declare function UiHeatmap(opts: { ui?: "heatmap"; values: number[][] } & UiHeatmapOptions): { ui: "heatmap"; values: number[][] } & UiHeatmapOptions;
export type UiNetworkGraphNode = { id: string; label?: string; group?: string; size?: number; color?: string };
export type UiNetworkGraphLink = { source: string; target: string; value?: number; directed?: boolean; color?: string };
export type UiNetworkGraphOptions = { physics?: { linkDistance?: number; chargeStrength?: number; linkStrength?: number }; layout?: "force" | "circular" | "grid" };
export declare function UiNetworkGraph(nodes: UiNetworkGraphNode[], links: UiNetworkGraphLink[], opts?: UiNetworkGraphOptions): { ui: "networkGraph"; nodes: UiNetworkGraphNode[]; links: UiNetworkGraphLink[] } & UiNetworkGraphOptions;
export declare function UiNetworkGraph(opts: { ui?: "networkGraph"; nodes: UiNetworkGraphNode[]; links: UiNetworkGraphLink[] } & UiNetworkGraphOptions): { ui: "networkGraph"; nodes: UiNetworkGraphNode[]; links: UiNetworkGraphLink[] } & UiNetworkGraphOptions;
export type UiPlot3dVector = [number, number, number];
export type UiPlot3dPoint = { position: UiPlot3dVector; color?: string; size?: number };
export type UiPlot3dLine = { points: UiPlot3dVector[]; color?: string; width?: number };
export type UiPlot3dSurface = { values: number[][]; xStep?: number; yStep?: number; colorScale?: "viridis" | "plasma" | "magma" | "inferno" | "turbo" | "grey" };
export type UiPlot3dOptions = { points?: UiPlot3dPoint[]; lines?: UiPlot3dLine[]; surface?: UiPlot3dSurface; camera?: { position?: UiPlot3dVector; target?: UiPlot3dVector }; background?: string };
export declare function UiPlot3d(opts?: UiPlot3dOptions): { ui: "plot3d" } & UiPlot3dOptions;
export type UiMapLngLat = [number, number];
export type UiMapBoundsPadding = number | [number, number, number, number];
export type UiMapBounds = { sw: UiMapLngLat; ne: UiMapLngLat; padding?: UiMapBoundsPadding };
export type UiGeoJsonGeometry = { type: string; coordinates: unknown };
export type UiGeoJsonFeature = { type: "Feature"; geometry: UiGeoJsonGeometry; properties?: Record<string, unknown> };
export type UiGeoJsonFeatureCollection = { type: "FeatureCollection"; features: UiGeoJsonFeature[] };
export type UiMapMarker = { id?: string; coordinates: UiMapLngLat; color?: string; popup?: string };
export type UiMapOptions = { center?: UiMapLngLat; zoom?: number; pitch?: number; bearing?: number; bounds?: UiMapBounds; markers?: UiMapMarker[]; style?: "streets" | "outdoors" | "light" | "dark" | "satellite" | "terrain" | string; attribution?: string; geojson?: UiGeoJsonFeatureCollection; height?: number };
export declare function UiMap(opts?: UiMapOptions): { ui: "map" } & UiMapOptions;
export type UiGeoJsonMapOptions = { center?: UiMapLngLat; zoom?: number; style?: "streets" | "outdoors" | "light" | "dark" | "satellite" | "terrain" | string; attribution?: string };
export type UiGeoJsonOptions = { map?: UiGeoJsonMapOptions; fillColor?: string; lineColor?: string; lineWidth?: number; opacity?: number; showMarkers?: boolean; height?: number };
export declare function UiGeoJson(featureCollection: UiGeoJsonFeatureCollection, opts?: UiGeoJsonOptions): { ui: "geoJson"; featureCollection: UiGeoJsonFeatureCollection } & UiGeoJsonOptions;
export declare function UiGeoJson(opts: { ui?: "geoJson"; featureCollection: UiGeoJsonFeatureCollection } & UiGeoJsonOptions): { ui: "geoJson"; featureCollection: UiGeoJsonFeatureCollection } & UiGeoJsonOptions;
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
