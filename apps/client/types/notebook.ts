import type {
  CodeCell as SchemaCodeCell,
  MarkdownCell as SchemaMarkdownCell,
  Notebook as SchemaNotebook,
  NotebookCell as SchemaNotebookCell,
  NotebookEnv,
  NotebookOutput as SchemaNotebookOutput,
  NotebookSql,
  OutputExecution,
  SqlConnection as SchemaSqlConnection,
  UnknownCell as SchemaUnknownCell,
} from "@nodebooks/notebook-schema";

type BaseCell<
  TType extends string,
  TFields extends object = object,
> = SchemaNotebookCell & {
  type: TType;
} & TFields;

export type Notebook = SchemaNotebook;
export type NotebookCell = SchemaNotebookCell;
export type CodeCell = SchemaCodeCell;
export type MarkdownCell = SchemaMarkdownCell;
export type UnknownCell = SchemaUnknownCell;

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export interface TerminalCell extends BaseCell<
  "terminal",
  { buffer: string }
> {}

export interface CommandCell extends BaseCell<
  "command",
  {
    command: string;
    notes: string;
  }
> {}

export interface HttpHeader {
  id: string;
  name: string;
  value: string;
  enabled: boolean;
}

export interface HttpQueryParam {
  id: string;
  name: string;
  value: string;
  enabled: boolean;
}

export interface HttpRequestBody {
  mode: "none" | "json" | "text";
  text: string;
  contentType: string;
}

export interface HttpRequest {
  method: HttpMethod;
  url: string;
  headers: HttpHeader[];
  query: HttpQueryParam[];
  body: HttpRequestBody;
}

export interface HttpResponseHeader {
  name: string;
  value: string;
}

export interface HttpResponseBody {
  type: "json" | "text" | "binary";
  text?: string;
  json?: unknown;
  size?: number;
  contentType?: string;
  encoding?: "utf8" | "base64";
}

export interface HttpResponse {
  status?: number;
  statusText?: string;
  ok?: boolean;
  url?: string;
  durationMs?: number;
  timestamp?: string;
  headers: HttpResponseHeader[];
  body?: HttpResponseBody;
  error?: string;
  curl?: string;
  assignedVariable?: string;
  assignedBody?: string;
  assignedHeaders?: string;
}

export interface HttpCell extends BaseCell<
  "http",
  {
    request: HttpRequest;
    response?: HttpResponse;
    assignVariable?: string;
    assignBody?: string;
    assignHeaders?: string;
  }
> {}

export interface SqlColumn {
  name: string;
  dataType?: string;
}

export interface SqlResult {
  rowCount?: number;
  durationMs?: number;
  columns: SqlColumn[];
  rows: Array<Record<string, unknown>>;
  assignedVariable?: string;
  timestamp?: string;
  error?: string;
}

export interface SqlCell extends BaseCell<
  "sql",
  {
    connectionId?: string;
    query: string;
    assignVariable?: string;
    result?: SqlResult;
  }
> {}

export interface PlotSqlDataSource {
  type: "sql";
  cellId?: string;
  resultKey: "rows" | "assigned";
}

export interface PlotHttpDataSource {
  type: "http";
  cellId?: string;
  path: Array<string | number>;
}

export interface PlotCodeDataSource {
  type: "code";
  cellId?: string;
  outputIndex?: number;
  path: Array<string | number>;
}

export interface PlotGlobalDataSource {
  type: "global";
  variable?: string;
  path: Array<string | number>;
}

export type PlotDataSource =
  | PlotSqlDataSource
  | PlotHttpDataSource
  | PlotCodeDataSource
  | PlotGlobalDataSource;

export interface PlotTraceBinding {
  id: string;
  name?: string;
  type?: string;
  mode?: string;
  x?: string;
  y?: string;
  z?: string;
  color?: string;
  size?: string;
  text?: string;
  fill?: string;
  stackgroup?: string;
}

export interface PlotBindings {
  traces: PlotTraceBinding[];
}

export interface PlotSnapshot {
  dataUrl: string;
  width?: number;
  height?: number;
  capturedAt?: string;
  fileName?: string;
}

export interface PlotlyTrace {
  id: string;
  name?: string;
  type?: string;
  mode?: string;
  x?: unknown[];
  y?: unknown[];
  z?: unknown[];
  text?: unknown[];
  marker?: Record<string, unknown>;
  hovertemplate?: string;
  customdata?: unknown[];
  [key: string]: unknown;
}

export interface PlotCellResult {
  traces: PlotlyTrace[];
  layout: Record<string, unknown>;
  fields: string[];
  source: PlotDataSource;
  chartType?: string;
  timestamp?: string;
  error?: string;
}

export interface PlotCell extends BaseCell<
  "plot",
  {
    chartType: string;
    dataSource: PlotDataSource;
    bindings: PlotBindings;
    layout: Record<string, unknown>;
    layoutEnabled?: boolean;
    result?: PlotCellResult;
    snapshot?: PlotSnapshot;
  }
> {}

export interface AiCellMessage {
  role: "user" | "assistant" | "system";
  content: string;
  id?: string;
}

export interface AiCellResponseUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface AiCellResponse {
  text?: string;
  model?: string;
  finishReason?: string;
  timestamp?: string;
  usage?: AiCellResponseUsage;
  costUsd?: number;
  error?: string;
  raw?: unknown;
}

export interface AiCell extends BaseCell<
  "ai",
  {
    messages: AiCellMessage[];
    prompt: string;
    system: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    response?: AiCellResponse;
  }
> {}

export type NotebookOutput = SchemaNotebookOutput;
export type SqlConnection = SchemaSqlConnection;

export type { NotebookEnv, NotebookSql, OutputExecution };

export const isCodeCell = (cell: NotebookCell): cell is CodeCell =>
  cell.type === "code";

export const isMarkdownCell = (cell: NotebookCell): cell is MarkdownCell =>
  cell.type === "markdown";

export const isUnknownCell = (cell: NotebookCell): cell is UnknownCell =>
  cell.type === "unknown";

export const isTerminalCell = (cell: NotebookCell): cell is TerminalCell =>
  cell.type === "terminal";

export const isCommandCell = (cell: NotebookCell): cell is CommandCell =>
  cell.type === "command";

export const isHttpCell = (cell: NotebookCell): cell is HttpCell =>
  cell.type === "http";

export const isSqlCell = (cell: NotebookCell): cell is SqlCell =>
  cell.type === "sql";

export const isPlotCell = (cell: NotebookCell): cell is PlotCell =>
  cell.type === "plot";

export const isAiCell = (cell: NotebookCell): cell is AiCell =>
  cell.type === "ai";
