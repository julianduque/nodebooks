const body = `export type UiDisplayPatch<T extends { ui: string }> =
  | Partial<Omit<T, "ui">>
  | ((current: T) => Partial<Omit<T, "ui">> | void)
  | void;
export type UiDisplayHandle<T extends { ui: string }> = T & {
  update(patch?: UiDisplayPatch<T>): T;
};
export type UiEmitOptions = { emit?: boolean };
export type UiEmitless<T> = Omit<T, "emit">;
export type UiImageOptions = UiEmitOptions & {
  alt?: string;
  width?: number | string;
  height?: number | string;
  fit?: "contain" | "cover" | "fill" | "none" | "scale-down";
  borderRadius?: number;
  mimeType?: string;
};
export declare function UiImage(
  src: string,
  opts?: UiImageOptions
): UiDisplayHandle<{ ui: "image" } & UiEmitless<UiImageOptions> & { src: string }>;
export declare function UiImage(
  opts: { ui?: "image"; src: string } & UiImageOptions
): UiDisplayHandle<{ ui: "image" } & UiEmitless<UiImageOptions> & { src: string }>;
export type UiMarkdownOptions = UiEmitOptions;
export declare function UiMarkdown(
  markdown: string,
  opts?: UiMarkdownOptions
): UiDisplayHandle<{ ui: "markdown"; markdown: string }>;
export declare function UiMarkdown(
  opts: { ui?: "markdown"; markdown: string } & UiMarkdownOptions
): UiDisplayHandle<{ ui: "markdown"; markdown: string }>;
export type UiHtmlOptions = UiEmitOptions;
export declare function UiHTML(
  html: string,
  opts?: UiHtmlOptions
): UiDisplayHandle<{ ui: "html"; html: string }>;
export declare function UiHTML(
  opts: { ui?: "html"; html: string } & UiHtmlOptions
): UiDisplayHandle<{ ui: "html"; html: string }>;
export type UiJsonOptions = UiEmitOptions & { collapsed?: boolean; maxDepth?: number };
export declare function UiJSON(
  json: unknown,
  opts?: UiJsonOptions
): UiDisplayHandle<{ ui: "json"; json: unknown } & UiEmitless<UiJsonOptions>>;
export declare function UiJSON(
  opts: { ui?: "json"; json: unknown } & UiJsonOptions
): UiDisplayHandle<{ ui: "json"; json: unknown } & UiEmitless<UiJsonOptions>>;
export type UiCodeOptions = UiEmitOptions & { language?: string };
export declare function UiCode(
  code: string,
  opts?: UiCodeOptions
): UiDisplayHandle<{ ui: "code"; code: string } & UiEmitless<UiCodeOptions>>;
export declare function UiCode(
  opts: { ui?: "code"; code: string } & UiCodeOptions
): UiDisplayHandle<{ ui: "code"; code: string } & UiEmitless<UiCodeOptions>>;
export type UiTableColumn = {
  key: string;
  label?: string;
  align?: "left" | "center" | "right";
};
export type UiTableOptions = UiEmitOptions & {
  columns?: UiTableColumn[];
  sort?: { key: string; direction?: "asc" | "desc" };
  page?: { index?: number; size?: number };
  density?: "compact" | "normal" | "spacious";
};
export declare function UiTable(
  rows: Array<Record<string, unknown>>,
  opts?: UiTableOptions
): UiDisplayHandle<
  { ui: "table"; rows: Array<Record<string, unknown>> } & UiEmitless<UiTableOptions>
>;
export declare function UiTable(
  opts: { ui?: "table"; rows: Array<Record<string, unknown>> } & UiTableOptions
): UiDisplayHandle<
  { ui: "table"; rows: Array<Record<string, unknown>> } & UiEmitless<UiTableOptions>
>;
export type UiDataSummaryOptions = UiEmitOptions & {
  title?: string;
  schema?: Array<{ name: string; type: string; nullable?: boolean }>;
  stats?: Record<
    string,
    {
      count?: number;
      distinct?: number;
      min?: number;
      max?: number;
      mean?: number;
      median?: number;
      p25?: number;
      p75?: number;
      stddev?: number;
      nulls?: number;
    }
  >;
  sample?: Array<Record<string, unknown>>;
  note?: string;
};
export declare function UiDataSummary(
  opts: UiDataSummaryOptions
): UiDisplayHandle<{ ui: "dataSummary" } & UiEmitless<UiDataSummaryOptions>>;
export type UiVegaLiteOptions = UiEmitOptions & {
  height?: number;
  width?: number;
  renderer?: "canvas" | "svg";
  actions?: boolean;
};
export declare function UiVegaLite(
  spec: Record<string, unknown>,
  opts?: UiVegaLiteOptions
): UiDisplayHandle<
  { ui: "vegaLite"; spec: Record<string, unknown> } & UiEmitless<UiVegaLiteOptions>
>;
export declare function UiVegaLite(
  opts: { ui?: "vegaLite"; spec: Record<string, unknown> } & UiVegaLiteOptions
): UiDisplayHandle<
  { ui: "vegaLite"; spec: Record<string, unknown> } & UiEmitless<UiVegaLiteOptions>
>;
export type UiPlotlyOptions = UiEmitOptions & {
  layout?: Record<string, unknown>;
  config?: Record<string, unknown>;
  responsive?: boolean;
};
export declare function UiPlotly(
  data: unknown[],
  opts?: UiPlotlyOptions
): UiDisplayHandle<
  { ui: "plotly"; data: unknown[] } & UiEmitless<UiPlotlyOptions>
>;
export declare function UiPlotly(
  opts: { ui?: "plotly"; data: unknown[] } & UiPlotlyOptions
): UiDisplayHandle<
  { ui: "plotly"; data: unknown[] } & UiEmitless<UiPlotlyOptions>
>;
export type UiHeatmapOptions = UiEmitOptions & {
  xLabels?: string[];
  yLabels?: string[];
  colorScale?:
    | "viridis"
    | "plasma"
    | "magma"
    | "inferno"
    | "turbo"
    | "custom";
  min?: number;
  max?: number;
  legend?: boolean;
};
export declare function UiHeatmap(
  values: number[][],
  opts?: UiHeatmapOptions
): UiDisplayHandle<{ ui: "heatmap"; values: number[][] } & UiEmitless<UiHeatmapOptions>>;
export declare function UiHeatmap(
  opts: { ui?: "heatmap"; values: number[][] } & UiHeatmapOptions
): UiDisplayHandle<{ ui: "heatmap"; values: number[][] } & UiEmitless<UiHeatmapOptions>>;
export type UiNetworkGraphNode = {
  id: string;
  label?: string;
  group?: string;
  size?: number;
  color?: string;
};
export type UiNetworkGraphLink = {
  source: string;
  target: string;
  value?: number;
  directed?: boolean;
  color?: string;
};
export type UiNetworkGraphOptions = UiEmitOptions & {
  physics?: {
    linkDistance?: number;
    chargeStrength?: number;
    linkStrength?: number;
  };
  layout?: "force" | "circular" | "grid";
};
export declare function UiNetworkGraph(
  nodes: UiNetworkGraphNode[],
  links: UiNetworkGraphLink[],
  opts?: UiNetworkGraphOptions
): UiDisplayHandle<
  {
    ui: "networkGraph";
    nodes: UiNetworkGraphNode[];
    links: UiNetworkGraphLink[];
  } & UiEmitless<UiNetworkGraphOptions>
>;
export declare function UiNetworkGraph(
  opts: { ui?: "networkGraph"; nodes: UiNetworkGraphNode[]; links: UiNetworkGraphLink[] } &
    UiNetworkGraphOptions
): UiDisplayHandle<
  {
    ui: "networkGraph";
    nodes: UiNetworkGraphNode[];
    links: UiNetworkGraphLink[];
  } & UiEmitless<UiNetworkGraphOptions>
>;
export type UiPlot3dVector = [number, number, number];
export type UiPlot3dPoint = {
  position: UiPlot3dVector;
  color?: string;
  size?: number;
};
export type UiPlot3dLine = {
  points: UiPlot3dVector[];
  color?: string;
  width?: number;
};
export type UiPlot3dSurface = {
  values: number[][];
  xStep?: number;
  yStep?: number;
  colorScale?: "viridis" | "plasma" | "magma" | "inferno" | "turbo" | "grey";
};
export type UiPlot3dOptions = UiEmitOptions & {
  points?: UiPlot3dPoint[];
  lines?: UiPlot3dLine[];
  surface?: UiPlot3dSurface;
  camera?: { position?: UiPlot3dVector; target?: UiPlot3dVector };
  background?: string;
};
export declare function UiPlot3d(
  opts?: UiPlot3dOptions
): UiDisplayHandle<{ ui: "plot3d" } & UiEmitless<UiPlot3dOptions>>;
export type UiMapLngLat = [number, number];
export type UiMapBoundsPadding =
  | number
  | [number, number, number, number];
export type UiMapBounds = {
  sw: UiMapLngLat;
  ne: UiMapLngLat;
  padding?: UiMapBoundsPadding;
};
export type UiGeoJsonGeometry = { type: string; coordinates: unknown };
export type UiGeoJsonFeature = {
  type: "Feature";
  geometry: UiGeoJsonGeometry;
  properties?: Record<string, unknown>;
};
export type UiGeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: UiGeoJsonFeature[];
};
export type UiMapMarker = {
  id?: string;
  coordinates: UiMapLngLat;
  color?: string;
  popup?: string;
};
export type UiMapOptions = UiEmitOptions & {
  center?: UiMapLngLat;
  zoom?: number;
  pitch?: number;
  bearing?: number;
  bounds?: UiMapBounds;
  markers?: UiMapMarker[];
  style?:
    | "streets"
    | "outdoors"
    | "light"
    | "dark"
    | "satellite"
    | "terrain"
    | string;
  attribution?: string;
  geojson?: UiGeoJsonFeatureCollection;
  height?: number;
};
export declare function UiMap(
  opts?: UiMapOptions
): UiDisplayHandle<{ ui: "map" } & UiEmitless<UiMapOptions>>;
export type UiGeoJsonMapOptions = {
  center?: UiMapLngLat;
  zoom?: number;
  style?:
    | "streets"
    | "outdoors"
    | "light"
    | "dark"
    | "satellite"
    | "terrain"
    | string;
  attribution?: string;
};
export type UiGeoJsonOptions = UiEmitOptions & {
  map?: UiGeoJsonMapOptions;
  fillColor?: string;
  lineColor?: string;
  lineWidth?: number;
  opacity?: number;
  showMarkers?: boolean;
  height?: number;
};
export declare function UiGeoJson(
  featureCollection: UiGeoJsonFeatureCollection,
  opts?: UiGeoJsonOptions
): UiDisplayHandle<
  { ui: "geoJson"; featureCollection: UiGeoJsonFeatureCollection } &
    UiEmitless<UiGeoJsonOptions>
>;
export declare function UiGeoJson(
  opts: { ui?: "geoJson"; featureCollection: UiGeoJsonFeatureCollection } &
    UiGeoJsonOptions
): UiDisplayHandle<
  { ui: "geoJson"; featureCollection: UiGeoJsonFeatureCollection } &
    UiEmitless<UiGeoJsonOptions>
>;
export type UiAlertOptions = UiEmitOptions & {
  level?: "info" | "success" | "warn" | "error";
  title?: string;
  text?: string;
  html?: string;
};
export declare function UiAlert(
  opts: UiAlertOptions
): UiDisplayHandle<{ ui: "alert" } & UiEmitless<UiAlertOptions>>;
export type UiBadgeOptions = UiEmitOptions & {
  color?: "neutral" | "info" | "success" | "warn" | "error";
};
export declare function UiBadge(
  text: string,
  opts?: UiBadgeOptions
): UiDisplayHandle<{ ui: "badge"; text: string } & UiEmitless<UiBadgeOptions>>;
export declare function UiBadge(
  opts: { ui?: "badge"; text: string } & UiBadgeOptions
): UiDisplayHandle<{ ui: "badge"; text: string } & UiEmitless<UiBadgeOptions>>;
export type UiMetricOptions = UiEmitOptions & {
  label?: string;
  unit?: string;
  delta?: number;
  helpText?: string;
};
export declare function UiMetric(
  value: string | number,
  opts?: UiMetricOptions
): UiDisplayHandle<{ ui: "metric"; value: string | number } & UiEmitless<UiMetricOptions>>;
export declare function UiMetric(
  opts: { ui?: "metric"; value: string | number } & UiMetricOptions
): UiDisplayHandle<{ ui: "metric"; value: string | number } & UiEmitless<UiMetricOptions>>;
export type UiProgressOptions = UiEmitOptions & {
  label?: string;
  max?: number;
  indeterminate?: boolean;
};
export declare function UiProgress(
  value: number,
  opts?: UiProgressOptions
): UiDisplayHandle<
  { ui: "progress"; value: number } & UiEmitless<UiProgressOptions>
>;
export declare function UiProgress(
  opts: { ui?: "progress"; value?: number } & UiProgressOptions
): UiDisplayHandle<
  { ui: "progress" } & UiEmitless<UiProgressOptions> & { value?: number }
>;
export type UiSpinnerOptions = UiEmitOptions & {
  label?: string;
  size?: number | "sm" | "md" | "lg";
};
export declare function UiSpinner(
  opts?: UiSpinnerOptions
): UiDisplayHandle<{ ui: "spinner" } & UiEmitless<UiSpinnerOptions>>;
export type UiInteractionPayload = "none" | "value" | "text" | "json";
export type UiInteractionAction = {
  handlerId: string;
  event?: string;
  payload?: UiInteractionPayload;
  debounceMs?: number;
};
export type UiContainerChild =
  | UiDisplayHandle<{ ui: string }>
  | { ui: string }
  | null
  | undefined;
export type UiContainerOptions = UiEmitOptions & {
  componentId?: string;
  direction?: "vertical" | "horizontal";
  wrap?: boolean;
  gap?: number;
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "between";
  padding?: number | [number, number] | [number, number, number, number];
  background?: string;
  border?: { color?: string; width?: number; radius?: number };
  title?: string;
  subtitle?: string;
  children?: UiContainerChild[];
};
export type UiContainerResolved = Omit<UiContainerOptions, "children" | "emit"> & {
  children: UiContainerChild[];
};
export declare function UiContainer(
  children: UiContainerChild[],
  opts?: Omit<UiContainerOptions, "children">
): UiDisplayHandle<{ ui: "container" } & UiContainerResolved>;
export declare function UiContainer(
  opts: UiContainerOptions
): UiDisplayHandle<{ ui: "container" } & UiContainerResolved>;
export type UiButtonOptions = UiEmitOptions & {
  componentId?: string;
  label?: string;
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  tooltip?: string;
  busy?: boolean;
  action?: UiInteractionAction;
  onClick?: () => unknown | Promise<unknown>;
};
export declare function UiButton(
  opts: UiButtonOptions
): UiDisplayHandle<
  { ui: "button" } & Omit<UiButtonOptions, "onClick" | "action" | "emit"> & {
    action: UiInteractionAction;
  }
>;
export type UiSliderOptions = UiEmitOptions & {
  componentId?: string;
  label?: string;
  description?: string;
  min?: number;
  max: number;
  step?: number;
  value?: number;
  defaultValue?: number;
  disabled?: boolean;
  showValue?: boolean;
  onChange?:
    | UiInteractionAction
    | ((value: number) => unknown | Promise<unknown>);
  onCommit?:
    | UiInteractionAction
    | ((value: number) => unknown | Promise<unknown>);
};
export type UiSliderResolved = Omit<
  UiSliderOptions,
  "onChange" | "onCommit" | "emit"
> & {
  onChange?: UiInteractionAction;
  onCommit?: UiInteractionAction;
};
export declare function UiSlider(
  opts: UiSliderOptions
): UiDisplayHandle<{ ui: "slider" } & UiSliderResolved>;
export type UiTextInputOptions = UiEmitOptions & {
  componentId?: string;
  label?: string;
  description?: string;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  disabled?: boolean;
  multiline?: boolean;
  rows?: number;
  onChange?:
    | UiInteractionAction
    | ((value: string) => unknown | Promise<unknown>);
  onSubmit?:
    | UiInteractionAction
    | ((value: string) => unknown | Promise<unknown>);
};
export type UiTextInputResolved = Omit<
  UiTextInputOptions,
  "onChange" | "onSubmit" | "emit"
> & {
  onChange?: UiInteractionAction;
  onSubmit?: UiInteractionAction;
};
export declare function UiTextInput(
  opts: UiTextInputOptions
): UiDisplayHandle<{ ui: "textInput" } & UiTextInputResolved>;
export type UiHelperAliases = {
  image: typeof UiImage;
  markdown: typeof UiMarkdown;
  html: typeof UiHTML;
  json: typeof UiJSON;
  code: typeof UiCode;
  table: typeof UiTable;
  dataSummary: typeof UiDataSummary;
  vegaLite: typeof UiVegaLite;
  plotly: typeof UiPlotly;
  heatmap: typeof UiHeatmap;
  networkGraph: typeof UiNetworkGraph;
  plot3d: typeof UiPlot3d;
  map: typeof UiMap;
  geoJson: typeof UiGeoJson;
  alert: typeof UiAlert;
  badge: typeof UiBadge;
  metric: typeof UiMetric;
  progress: typeof UiProgress;
  spinner: typeof UiSpinner;
  container: typeof UiContainer;
  button: typeof UiButton;
  slider: typeof UiSlider;
  textInput: typeof UiTextInput;
};
export declare const image: typeof UiImage;
export declare const markdown: typeof UiMarkdown;
export declare const html: typeof UiHTML;
export declare const json: typeof UiJSON;
export declare const code: typeof UiCode;
export declare const table: typeof UiTable;
export declare const dataSummary: typeof UiDataSummary;
export declare const vegaLite: typeof UiVegaLite;
export declare const plotly: typeof UiPlotly;
export declare const heatmap: typeof UiHeatmap;
export declare const networkGraph: typeof UiNetworkGraph;
export declare const plot3d: typeof UiPlot3d;
export declare const map: typeof UiMap;
export declare const geoJson: typeof UiGeoJson;
export declare const alert: typeof UiAlert;
export declare const badge: typeof UiBadge;
export declare const metric: typeof UiMetric;
export declare const progress: typeof UiProgress;
export declare const spinner: typeof UiSpinner;
export declare const container: typeof UiContainer;
export declare const button: typeof UiButton;
export declare const slider: typeof UiSlider;
export declare const textInput: typeof UiTextInput;
export declare const ui: UiHelperAliases;
export default ui;
`;

export const uiHelpersDts = `${body}\n`;

export const uiHelpersModuleDts = `declare module "@nodebooks/ui" {\n${body
  .split("\n")
  .map((line) => (line.length > 0 ? `  ${line}` : ""))
  .join("\n")}\n}\n`;
