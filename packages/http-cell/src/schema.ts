import { z } from "zod";

/**
 * HTTP method enum.
 */
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

/**
 * HTTP request header schema.
 */
export const HttpHeaderSchema = z.object({
  id: z.string(),
  name: z.string().default(""),
  value: z.string().default(""),
  enabled: z.boolean().default(true),
});
export type HttpHeader = z.infer<typeof HttpHeaderSchema>;

/**
 * HTTP query parameter schema.
 */
export const HttpQueryParamSchema = z.object({
  id: z.string(),
  name: z.string().default(""),
  value: z.string().default(""),
  enabled: z.boolean().default(true),
});
export type HttpQueryParam = z.infer<typeof HttpQueryParamSchema>;

/**
 * HTTP request body schema.
 */
export const HttpRequestBodySchema = z.object({
  mode: z.enum(["none", "json", "text"]).default("none"),
  text: z.string().default(""),
  contentType: z.string().default("application/json"),
});
export type HttpRequestBody = z.infer<typeof HttpRequestBodySchema>;

/**
 * HTTP request schema.
 */
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

/**
 * HTTP response header schema.
 */
export const HttpResponseHeaderSchema = z.object({
  name: z.string(),
  value: z.string(),
});
export type HttpResponseHeader = z.infer<typeof HttpResponseHeaderSchema>;

/**
 * HTTP response body schema.
 */
export const HttpResponseBodySchema = z.object({
  type: z.enum(["json", "text", "binary"]).default("text"),
  text: z.string().optional(),
  json: z.unknown().optional(),
  size: z.number().int().nonnegative().optional(),
  contentType: z.string().optional(),
  encoding: z.enum(["utf8", "base64"]).optional(),
});
export type HttpResponseBody = z.infer<typeof HttpResponseBodySchema>;

/**
 * HTTP response schema.
 */
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

const DEFAULT_HTTP_REQUEST = HttpRequestSchema.parse({});

/**
 * HTTP cell schema - Make HTTP requests and inspect responses.
 */
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
export type HttpCell = z.infer<typeof HttpCellSchema>;

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
 * Factory function to create a new HTTP cell.
 */
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

/**
 * HTTP cell file schema - For notebook file serialization.
 */
export const NotebookFileHttpCellSchema = z.object({
  type: z.literal("http"),
  metadata: z.record(z.string(), z.unknown()).optional(),
  request: HttpRequestSchema.optional(),
  response: HttpResponseSchema.optional(),
  assignVariable: z.string().optional(),
  assignBody: z.string().optional(),
  assignHeaders: z.string().optional(),
});
export type NotebookFileHttpCell = z.infer<typeof NotebookFileHttpCellSchema>;
