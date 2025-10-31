import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { isIP } from "node:net";
import type { Notebook } from "@nodebooks/notebook-schema";
import type {
  NotebookCollaboratorStore,
  NotebookStore,
  NotebookRole,
} from "@nodebooks/cell-plugin-api";
import {
  HttpRequestSchema,
  HttpResponseSchema,
  type HttpHeader,
  type HttpMethod,
  type HttpRequest,
  type HttpResponse,
} from "../schema.js";

const VARIABLE_PATTERN = /\{\{\s*([A-Z0-9_]+)\s*\}\}/gi;

const substituteVariables = (
  value: string,
  variables: Record<string, string>
) => {
  if (!value) {
    return "";
  }
  return value.replace(VARIABLE_PATTERN, (_, key: string) => {
    const exact = variables[key] ?? variables[key.toUpperCase()] ?? "";
    return exact;
  });
};

const isPrivateIp = (hostname: string) => {
  const ipType = isIP(hostname);
  if (ipType === 0) {
    return false;
  }
  if (hostname === "::1") {
    return true;
  }
  if (ipType === 6) {
    // IPv6 private range: fc00::/7, fe80::/10, ::1 already handled
    const normalized = hostname.toLowerCase();
    return (
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb")
    );
  }
  const parts = hostname
    .split(".")
    .map((segment) => Number.parseInt(segment, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false;
  }
  if (parts[0] === 10) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 0) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  return false;
};

const isBlockedUrl = (target: URL) => {
  if (!target.protocol || !["http:", "https:"].includes(target.protocol)) {
    return true;
  }
  const hostname = target.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::" ||
    hostname === "::1"
  ) {
    return true;
  }
  if (isPrivateIp(hostname)) {
    return true;
  }
  return false;
};

const escapeShellArg = (value: string) => {
  return value.replace(/'/g, "'\\''");
};

const createHeaderId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `hdr_${Math.random().toString(36).slice(2, 10)}`;
};

const buildCurlCommand = (
  method: HttpMethod,
  url: string,
  headers: HttpHeader[],
  body: string | undefined
) => {
  const parts: string[] = [];
  parts.push(`curl -X ${method.toUpperCase()}`);
  headers.forEach((header) => {
    if (!header.enabled) return;
    const name = header.name.trim();
    if (!name) return;
    const value = header.value ?? "";
    parts.push(`-H '${escapeShellArg(`${name}: ${value}`)}'`);
  });
  if (body && body.length > 0) {
    parts.push(`--data '${escapeShellArg(body)}'`);
  }
  parts.push(`'${escapeShellArg(url)}'`);
  return parts.join(" ");
};

const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const HttpExecutePayloadSchema = z.object({
  cellId: z.string(),
  request: HttpRequestSchema,
  assignVariable: z.string().optional(),
  assignBody: z.string().optional(),
  assignHeaders: z.string().optional(),
});

const normalizeRequest = (
  request: HttpRequest,
  variables: Record<string, string>
): {
  method: HttpMethod;
  url: URL;
  headers: HttpHeader[];
  bodyText?: string;
  curl: string;
} => {
  const enabledHeaders = (request.headers ?? []).filter(
    (header) => header.enabled
  );
  const headers: HttpHeader[] = enabledHeaders
    .map((header) => ({
      ...header,
      name: substituteVariables(header.name ?? "", variables),
      value: substituteVariables(header.value ?? "", variables),
    }))
    .filter((header) => header.name.trim().length > 0);

  const enabledQuery = (request.query ?? []).filter((param) => param.enabled);
  const baseUrl = substituteVariables(request.url ?? "", variables);
  const queryPairs = enabledQuery
    .map((param) => ({
      name: substituteVariables(param.name ?? "", variables),
      value: substituteVariables(param.value ?? "", variables),
    }))
    .filter((param) => param.name.trim().length > 0);

  let finalUrl: URL;
  try {
    finalUrl = new URL(baseUrl);
  } catch {
    throw new Error("Invalid request URL");
  }

  queryPairs.forEach((param) => {
    finalUrl.searchParams.append(param.name, param.value);
  });

  let bodyText: string | undefined;
  const mode = request.body?.mode ?? "none";
  if (mode === "json") {
    const substituted = substituteVariables(
      request.body?.text ?? "",
      variables
    ).trim();
    if (substituted.length > 0) {
      try {
        bodyText = JSON.stringify(JSON.parse(substituted));
      } catch {
        throw new Error("JSON body is not valid after substitutions");
      }
    } else {
      bodyText = undefined;
    }
    const contentTypeHeader = headers.find(
      (header) => header.name.toLowerCase() === "content-type"
    );
    if (!contentTypeHeader) {
      headers.push({
        id: createHeaderId(),
        name: "Content-Type",
        value: request.body?.contentType ?? "application/json",
        enabled: true,
      });
    }
  } else if (mode === "text") {
    bodyText = substituteVariables(request.body?.text ?? "", variables);
  }

  const method = (request.method ?? "GET").toUpperCase() as HttpMethod;
  const shouldSendBody =
    bodyText !== undefined &&
    bodyText.length > 0 &&
    !["GET", "HEAD"].includes(method);

  return {
    method,
    url: finalUrl,
    headers,
    bodyText: shouldSendBody ? bodyText : undefined,
    curl: buildCurlCommand(
      method,
      finalUrl.toString(),
      headers,
      shouldSendBody ? bodyText : undefined
    ),
  };
};

interface ResponseAssignments {
  variable?: string;
  body?: string;
  headers?: string;
}

const buildResponsePayload = async (
  response: Response,
  requestedUrl: string,
  curl: string,
  startedAt: number,
  assignments: ResponseAssignments
): Promise<HttpResponse> => {
  const durationMs = Date.now() - startedAt;
  const buffer = new Uint8Array(await response.arrayBuffer());
  const size = buffer.byteLength;
  const contentType = response.headers.get("content-type") ?? undefined;
  const headers: HttpHeader[] = [];
  response.headers.forEach((value, name) => {
    headers.push({ id: createHeaderId(), name, value, enabled: true });
  });

  let bodyType: "json" | "text" | "binary" = "text";
  let bodyText: string | undefined;
  let bodyJson: unknown;
  let encoding: "utf8" | "base64" | undefined;

  const textDecoder = new TextDecoder();
  if (contentType && contentType.includes("application/json")) {
    const text = textDecoder.decode(buffer);
    try {
      bodyJson = JSON.parse(text);
      bodyText = JSON.stringify(bodyJson, null, 2);
      bodyType = "json";
      encoding = "utf8";
    } catch {
      bodyText = text;
      bodyType = "text";
      encoding = "utf8";
    }
  } else if (
    contentType &&
    (contentType.startsWith("text/") ||
      contentType.includes("xml") ||
      contentType.includes("html"))
  ) {
    bodyText = textDecoder.decode(buffer);
    bodyType = "text";
    encoding = "utf8";
  } else if (size > 0) {
    bodyText = Buffer.from(buffer).toString("base64");
    bodyType = "binary";
    encoding = "base64";
  } else {
    bodyText = "";
    encoding = "utf8";
  }

  return HttpResponseSchema.parse({
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    url: response.url || requestedUrl,
    durationMs,
    timestamp: new Date().toISOString(),
    headers,
    body:
      bodyText !== undefined
        ? {
            type: bodyType,
            text: bodyText,
            json: bodyJson,
            size,
            contentType,
            encoding,
          }
        : undefined,
    curl,
    assignedVariable: assignments.variable,
    assignedBody: assignments.body,
    assignedHeaders: assignments.headers,
  });
};

const buildErrorResponse = (
  message: string,
  curl: string,
  assignments: ResponseAssignments
): HttpResponse => {
  return HttpResponseSchema.parse({
    error: message,
    timestamp: new Date().toISOString(),
    curl,
    assignedVariable: assignments.variable,
    assignedBody: assignments.body,
    assignedHeaders: assignments.headers,
  });
};

const getNotebookVariables = (notebook: Notebook) => {
  return notebook.env?.variables ?? {};
};

type RequestUser = {
  id: string;
  role?: string;
};

const getRequestUser = (request: FastifyRequest): RequestUser | null => {
  const candidate = (request as FastifyRequest & { user?: RequestUser }).user;
  if (!candidate) {
    return null;
  }
  if (typeof candidate.id !== "string" || candidate.id.length === 0) {
    return null;
  }
  return { id: candidate.id, role: candidate.role };
};

export const registerHttpRoutes = (
  app: FastifyInstance,
  store: NotebookStore,
  collaborators: NotebookCollaboratorStore
) => {
  app.post("/notebooks/:id/http", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const payload = HttpExecutePayloadSchema.parse(request.body ?? {});

    const normalizeAssignment = (value: string | undefined | null) => {
      const trimmed = value?.trim() ?? "";
      return trimmed.length > 0 ? trimmed : undefined;
    };

    const assignVariable = normalizeAssignment(payload.assignVariable);
    if (assignVariable && !IDENTIFIER_PATTERN.test(assignVariable)) {
      reply
        .code(400)
        .send({ error: "Assignment target must be a valid identifier" });
      return;
    }

    const assignBody = normalizeAssignment(payload.assignBody);
    if (assignBody && !IDENTIFIER_PATTERN.test(assignBody)) {
      reply
        .code(400)
        .send({ error: "Body assignment must be a valid identifier" });
      return;
    }

    const assignHeaders = normalizeAssignment(payload.assignHeaders);
    if (assignHeaders && !IDENTIFIER_PATTERN.test(assignHeaders)) {
      reply
        .code(400)
        .send({ error: "Header assignment must be a valid identifier" });
      return;
    }

    const assignments: ResponseAssignments = {
      variable: assignVariable,
      body: assignBody,
      headers: assignHeaders,
    };

    const notebook = await store.get(params.id);
    if (!notebook) {
      reply.code(404);
      return { error: "Notebook not found" };
    }

    // Check authentication
    const user = getRequestUser(request);
    if (!user) {
      void reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    // Admin users have editor access
    let _role: NotebookRole | null = null;
    if (user.role === "admin") {
      _role = "editor";
    } else {
      // Check collaborator access
      const collaborator = await collaborators.get(notebook.id, user.id);
      if (!collaborator) {
        void reply.code(403).send({ error: "Notebook access denied" });
        return;
      }
      const ROLE_RANK: Record<NotebookRole, number> = {
        viewer: 0,
        editor: 1,
        owner: 2,
      };
      if (ROLE_RANK[collaborator.role] < ROLE_RANK.editor) {
        void reply
          .code(403)
          .send({ error: "Notebook permission level is insufficient" });
        return;
      }
      _role = collaborator.role;
    }

    const variables = getNotebookVariables(notebook);
    let normalized;
    try {
      normalized = normalizeRequest(payload.request, variables);
    } catch (error) {
      reply.code(400);
      const message =
        error instanceof Error ? error.message : "Invalid HTTP request";
      return { error: message };
    }

    if (isBlockedUrl(normalized.url)) {
      reply.code(400);
      return { error: "Destination URL is not allowed" };
    }

    const init: RequestInit = {
      method: normalized.method,
      headers: normalized.headers.reduce(
        (acc, header) => {
          if (!header.enabled) return acc;
          const name = header.name.trim();
          if (!name) return acc;
          acc[name] = header.value ?? "";
          return acc;
        },
        {} as Record<string, string>
      ),
      body: normalized.bodyText,
    };

    const started = Date.now();
    const url = normalized.url.toString();
    try {
      const response = await fetch(url, init);
      const payloadResponse = await buildResponsePayload(
        response,
        url,
        normalized.curl,
        started,
        assignments
      );
      return { data: { response: payloadResponse, assignments } };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "HTTP request failed";
      return {
        data: {
          response: buildErrorResponse(message, normalized.curl, assignments),
          assignments,
        },
      };
    }
  });
};
