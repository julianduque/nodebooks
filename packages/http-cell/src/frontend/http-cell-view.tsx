"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ClipboardEvent, FocusEvent, KeyboardEvent } from "react";
import clsx from "clsx";
import { Plus as PlusIcon, Trash2 } from "lucide-react";
import hljs from "highlight.js";
import type { NotebookCell } from "@nodebooks/notebook-schema";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Input,
  Button,
} from "@nodebooks/client-ui/components/ui";
import { AlertCallout, CodeBlock } from "@nodebooks/ui";
import type { CellComponentProps } from "@nodebooks/cell-plugin-api";
import type { HttpRequest, HttpResponse } from "../schema.js";

type HttpCellType = NotebookCell & {
  type: "http";
  request?: HttpRequest;
  response?: HttpResponse;
  assignVariable?: string;
  assignBody?: string;
  assignHeaders?: string;
};

const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const VARIABLE_PATTERN = /\{\{\s*([A-Z0-9_]+)\s*\}\}/gi;
type BodyMode = HttpRequest["body"]["mode"];
const BODY_OPTIONS: ReadonlyArray<{ value: BodyMode; label: string }> = [
  { value: "none", label: "None" },
  { value: "json", label: "JSON" },
  { value: "text", label: "Raw text" },
];
const HTTP_METHODS: ReadonlyArray<HttpRequest["method"]> = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

const SELECT_FIELD_CLASS =
  "flex h-9 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm transition focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50";

type HttpTabKey = "params" | "headers" | "auth" | "body" | "response";
type HttpAuthMode = "none" | "basic" | "bearer" | "custom";

const createItemId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `http_${Math.random().toString(36).slice(2, 10)}`;
};

const substituteVariables = (
  value: string,
  variables: Record<string, string>
) => {
  if (!value) return "";
  return value.replace(VARIABLE_PATTERN, (_, key: string) => {
    const exact = variables[key] ?? variables[key.toUpperCase()] ?? "";
    return exact;
  });
};

const escapeCurlValue = (value: string) => {
  return value.replace(/'/g, "'\\''");
};

const normalizeCurlInput = (value: string) => {
  return value
    .replace(/\\\r?\n/g, " ")
    .replace(/\r?\n/g, " ")
    .trim();
};

const tokenizeCurlCommand = (input: string) => {
  const tokens: string[] = [];
  let buffer = "";
  let quote: "'" | '"' | null = null;
  let escape = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (escape) {
      buffer += char;
      escape = false;
      continue;
    }
    if (quote === '"') {
      if (char === "\\") {
        escape = true;
        continue;
      }
      if (char === '"') {
        quote = null;
        continue;
      }
      buffer += char;
      continue;
    }
    if (quote === "'") {
      if (char === "'") {
        quote = null;
        continue;
      }
      buffer += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char as "'" | '"';
      continue;
    }
    if (/\s/.test(char)) {
      if (buffer.length > 0) {
        tokens.push(buffer);
        buffer = "";
      }
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    buffer += char;
  }
  if (buffer.length > 0) {
    tokens.push(buffer);
  }
  return tokens;
};

const looksLikeCurlCommand = (value: string) => {
  return normalizeCurlInput(value).toLowerCase().startsWith("curl");
};

const stripLeadingShellPrefix = (value: string) => {
  if (value.startsWith("$") && value.length > 1) {
    return value.slice(1);
  }
  return value;
};

const base64Encode = (value: string) => {
  try {
    if (typeof btoa === "function") {
      return btoa(value);
    }
  } catch {
    // ignore and fall back to Buffer
  }
  try {
    const maybeBuffer = (
      globalThis as unknown as {
        Buffer?: {
          from(
            data: string,
            encoding: string
          ): { toString(enc: string): string };
        };
      }
    )?.Buffer;
    if (maybeBuffer) {
      return maybeBuffer.from(value, "utf-8").toString("base64");
    }
  } catch {
    // ignore
  }
  return "";
};

const base64Decode = (value: string) => {
  try {
    if (typeof atob === "function") {
      return atob(value);
    }
  } catch {
    // ignore and fall back to Buffer
  }
  try {
    const maybeBuffer = (
      globalThis as unknown as {
        Buffer?: {
          from(
            data: string,
            encoding: string
          ): {
            toString(enc: string): string;
          };
        };
      }
    )?.Buffer;
    if (maybeBuffer) {
      return maybeBuffer.from(value, "base64").toString("utf-8");
    }
  } catch {
    // ignore
  }
  return null;
};

const looksLikeJson = (value: string) => {
  const trimmed = value.trim();
  return (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  );
};

const highlightJson = (value: string) => {
  try {
    return hljs.highlight(value, { language: "json" }).value;
  } catch {
    return undefined;
  }
};

const guessLanguageFromContentType = (
  contentType?: string | null,
  value?: string | null
) => {
  const normalized = contentType?.toLowerCase() ?? "";
  if (normalized.includes("json")) return "json";
  if (normalized.includes("javascript")) return "javascript";
  if (normalized.includes("typescript")) return "typescript";
  if (normalized.includes("html")) return "html";
  if (normalized.includes("xml")) return "xml";
  if (normalized.includes("yaml") || normalized.includes("yml")) return "yaml";
  if (normalized.includes("css")) return "css";
  if (normalized.includes("csv")) return "csv";
  if (value && looksLikeJson(value)) return "json";
  return undefined;
};

interface ParsedCurlCommand {
  method?: string;
  url?: string;
  headers: Array<{ name: string; value: string }>;
  bodyText?: string;
  isJsonBody: boolean;
  isUrlEncodedBody: boolean;
  hasBinaryBody: boolean;
  hasBody: boolean;
}

const parseCurlCommand = (raw: string): ParsedCurlCommand | null => {
  const normalized = normalizeCurlInput(raw);
  if (!normalized.toLowerCase().startsWith("curl")) {
    return null;
  }

  const tokens = tokenizeCurlCommand(normalized);
  if (tokens.length === 0) {
    return null;
  }

  let index = 0;
  if (tokens[0].toLowerCase() === "curl") {
    index = 1;
  }

  const headers: Array<{ name: string; value: string }> = [];
  const rawParts: string[] = [];
  const jsonParts: string[] = [];
  const urlencodedParts: string[] = [];

  let method: string | undefined;
  let url: string | undefined;
  let hasBody = false;
  let hasBinaryBody = false;
  let jsonHint = false;
  let basicAuth: string | null = null;

  const pushHeader = (value: string | undefined) => {
    if (!value) return;
    const cleaned = stripLeadingShellPrefix(value);
    const separator = cleaned.indexOf(":");
    if (separator === -1) return;
    const name = cleaned.slice(0, separator).trim();
    const headerValue = cleaned.slice(separator + 1).trim();
    if (!name) return;
    headers.push({ name, value: headerValue });
  };

  const pushData = (
    value: string | undefined,
    kind: "raw" | "json" | "urlencoded" | "binary"
  ) => {
    if (!value) return;
    hasBody = true;
    if (kind === "json") {
      jsonHint = true;
      jsonParts.push(value);
    } else if (kind === "urlencoded") {
      urlencodedParts.push(value);
    } else {
      if (kind === "binary") {
        hasBinaryBody = true;
      }
      rawParts.push(value);
    }
  };

  const readNext = () => {
    if (index + 1 >= tokens.length) {
      return undefined;
    }
    index += 1;
    return tokens[index];
  };

  const skipToken = () => {
    if (index + 1 < tokens.length) {
      index += 1;
    }
  };

  for (; index < tokens.length; index += 1) {
    const token = tokens[index];
    const lower = token.toLowerCase();
    if (lower === "-x") {
      const value = readNext();
      if (value) {
        method = value.toUpperCase();
      }
      continue;
    }
    if (lower === "--request") {
      const value = readNext();
      if (value) {
        method = value.toUpperCase();
      }
      continue;
    }
    if (lower.startsWith("--request=")) {
      const value = token.slice("--request=".length);
      if (value) {
        method = value.toUpperCase();
      }
      continue;
    }
    if (lower === "-u" || lower === "--user") {
      const value = readNext();
      if (value) {
        basicAuth = stripLeadingShellPrefix(value).trim();
      }
      continue;
    }
    if (token.startsWith("-u") && token.length > 2) {
      basicAuth = stripLeadingShellPrefix(token.slice(2)).trim();
      continue;
    }
    if (lower.startsWith("--user=")) {
      const value = token.slice("--user=".length);
      if (value) {
        basicAuth = stripLeadingShellPrefix(value).trim();
      }
      continue;
    }
    if (
      lower === "-h" ||
      lower === "--header" ||
      lower.startsWith("--header=")
    ) {
      const value =
        lower === "-h" || lower === "--header"
          ? readNext()
          : token.slice("--header=".length);
      pushHeader(value);
      continue;
    }
    if (
      lower === "-d" ||
      lower === "--data" ||
      lower === "--data-raw" ||
      lower.startsWith("--data=") ||
      lower.startsWith("--data-raw=")
    ) {
      const value =
        lower.startsWith("--data=") || lower.startsWith("--data-raw=")
          ? token.split("=", 2)[1]
          : readNext();
      pushData(value, "raw");
      continue;
    }
    if (lower === "--json" || lower.startsWith("--json=")) {
      const value =
        lower === "--json" ? readNext() : token.slice("--json=".length);
      pushData(value, "json");
      continue;
    }
    if (lower === "--data-binary" || lower.startsWith("--data-binary=")) {
      const value =
        lower === "--data-binary"
          ? readNext()
          : token.slice("--data-binary=".length);
      pushData(value, "binary");
      continue;
    }
    if (lower === "--data-urlencode" || lower.startsWith("--data-urlencode=")) {
      const value =
        lower === "--data-urlencode"
          ? readNext()
          : token.slice("--data-urlencode=".length);
      pushData(value, "urlencoded");
      continue;
    }
    if (lower === "-f" || lower === "--form" || lower.startsWith("--form=")) {
      const value =
        lower === "-f" || lower === "--form"
          ? readNext()
          : token.slice("--form=".length);
      pushData(value, "raw");
      continue;
    }
    if (lower === "-g" || lower === "--get") {
      // Treat -G as a marker to append data as query; handled later via urlencoded parts.
      continue;
    }
    if (lower === "--url") {
      const value = readNext();
      if (value) {
        url = value;
      }
      continue;
    }
    if (lower.startsWith("--url=")) {
      const value = token.slice("--url=".length);
      if (value) {
        url = value;
      }
      continue;
    }
    if (
      lower === "-a" ||
      lower === "--user-agent" ||
      lower === "-e" ||
      lower === "--referer" ||
      lower === "--compressed" ||
      lower === "--no-compressed" ||
      lower === "--insecure" ||
      lower === "-k" ||
      lower === "--silent" ||
      lower === "-s" ||
      lower === "--show-error" ||
      lower === "-sS"
    ) {
      if (
        lower === "-a" ||
        lower === "--user-agent" ||
        lower === "-e" ||
        lower === "--referer"
      ) {
        skipToken();
      }
      continue;
    }
    if (lower.startsWith("--")) {
      const equalsIndex = token.indexOf("=");
      if (equalsIndex > 0 && equalsIndex < token.length - 1) {
        // Unhandled --flag=value form: skip
        continue;
      }
    }
    if (!token.startsWith("-")) {
      url = token;
    }
  }

  if (basicAuth) {
    const cleaned = basicAuth.includes(":") ? basicAuth : `${basicAuth}:`;
    const encoded = base64Encode(cleaned);
    if (
      encoded &&
      !headers.some((header) => header.name.toLowerCase() === "authorization")
    ) {
      headers.push({
        name: "Authorization",
        value: `Basic ${encoded}`,
      });
    }
  }

  let bodyText: string | undefined;
  if (jsonParts.length > 0) {
    bodyText = jsonParts.join("\n");
  }
  if (rawParts.length > 0) {
    const joined = rawParts.join("&");
    bodyText = bodyText ? `${bodyText}\n${joined}` : joined;
  }
  if (urlencodedParts.length > 0) {
    const joined = urlencodedParts.join("&");
    bodyText = bodyText
      ? `${bodyText}${bodyText.endsWith("&") ? "" : "&"}${joined}`
      : joined;
  }

  const isUrlEncodedBody =
    urlencodedParts.length > 0 &&
    !jsonHint &&
    !looksLikeJson(urlencodedParts.join("&"));
  const isJsonBody = jsonHint || (bodyText ? looksLikeJson(bodyText) : false);

  return {
    method,
    url,
    headers,
    bodyText,
    isJsonBody,
    isUrlEncodedBody,
    hasBinaryBody: hasBinaryBody,
    hasBody,
  };
};

const extractUrlParts = (rawUrl: string) => {
  try {
    const parsed = new URL(rawUrl);
    const base = `${parsed.origin}${parsed.pathname}`;
    const params: Array<{ name: string; value: string }> = [];
    parsed.searchParams.forEach((value, name) => {
      params.push({ name, value });
    });
    return { baseUrl: base, params };
  } catch {
    return { baseUrl: rawUrl, params: [] };
  }
};

interface HttpCellViewProps extends CellComponentProps {
  cell: HttpCellType;
  variables?: Record<string, string>;
  isRunning?: boolean;
  theme?: "light" | "dark";
}

const HttpCellView = ({
  cell,
  onChange,
  variables = {},
  isRunning = false,
  readOnly = false,
  onRun,
  theme = "light",
}: HttpCellViewProps) => {
  const request: HttpRequest = cell.request ?? {
    method: "GET",
    url: "",
    headers: [],
    query: [],
    body: { mode: "none", text: "", contentType: "application/json" },
  };
  const response = cell.response;
  const themeMode = theme === "dark" ? "dark" : "light";

  const assignBodyValue = cell.assignBody ?? "";
  const assignHeadersValue = cell.assignHeaders ?? "";
  const assignBodyTrimmed = assignBodyValue.trim();
  const assignHeadersTrimmed = assignHeadersValue.trim();
  const assignBodyError =
    assignBodyTrimmed.length > 0 && !IDENTIFIER_PATTERN.test(assignBodyTrimmed)
      ? "Assignment must be a valid identifier"
      : null;
  const assignHeadersError =
    assignHeadersTrimmed.length > 0 &&
    !IDENTIFIER_PATTERN.test(assignHeadersTrimmed)
      ? "Assignment must be a valid identifier"
      : null;
  const assignedBodyName = (response?.assignedBody ?? "").trim();
  const assignedHeadersName = (response?.assignedHeaders ?? "").trim();
  const responseSucceeded =
    Boolean(response) && !response?.error && response?.ok !== false;
  const bodyStatus = useMemo(() => {
    if (!assignBodyTrimmed) {
      return {
        text: "Leave blank to skip assigning the response body.",
        tone: "muted" as const,
      };
    }
    if (responseSucceeded && assignedBodyName === assignBodyTrimmed) {
      return {
        text: `Last run populated ${assignBodyTrimmed}.`,
        tone: "success" as const,
      };
    }
    if (assignedBodyName && assignedBodyName !== assignBodyTrimmed) {
      return {
        text: `Last run populated ${assignedBodyName}. Run again to assign ${assignBodyTrimmed}.`,
        tone: "warn" as const,
      };
    }
    return {
      text: `Will assign to ${assignBodyTrimmed} on next run.`,
      tone: "muted" as const,
    };
  }, [assignBodyTrimmed, assignedBodyName, responseSucceeded]);
  const headersStatus = useMemo(() => {
    if (!assignHeadersTrimmed) {
      return {
        text: "Leave blank to skip assigning response headers.",
        tone: "muted" as const,
      };
    }
    if (responseSucceeded && assignedHeadersName === assignHeadersTrimmed) {
      return {
        text: `Last run populated ${assignHeadersTrimmed}.`,
        tone: "success" as const,
      };
    }
    if (assignedHeadersName && assignedHeadersName !== assignHeadersTrimmed) {
      return {
        text: `Last run populated ${assignedHeadersName}. Run again to assign ${assignHeadersTrimmed}.`,
        tone: "warn" as const,
      };
    }
    return {
      text: `Will assign to ${assignHeadersTrimmed} on next run.`,
      tone: "muted" as const,
    };
  }, [assignHeadersTrimmed, assignedHeadersName, responseSucceeded]);
  const bodyStatusClass = clsx(
    "text-[11px]",
    bodyStatus.tone === "success"
      ? "text-primary"
      : bodyStatus.tone === "warn"
        ? "text-amber-500"
        : "text-muted-foreground"
  );
  const headersStatusClass = clsx(
    "text-[11px]",
    headersStatus.tone === "success"
      ? "text-primary"
      : headersStatus.tone === "warn"
        ? "text-amber-500"
        : "text-muted-foreground"
  );

  const methodFieldId = useId();
  const urlFieldId = useId();

  const updateRequest = useCallback(
    (
      updater: (request: HttpRequest) => HttpRequest,
      options?: { persist?: boolean; touch?: boolean }
    ) => {
      onChange((current) => {
        if (current.id !== cell.id || current.type !== "http") {
          return current;
        }
        const currentHttp = current as HttpCellType;
        const currentRequest = currentHttp.request ?? {
          method: "GET",
          url: "",
          headers: [],
          query: [],
          body: { mode: "none", text: "", contentType: "application/json" },
        };
        const draft: HttpRequest = {
          method: currentRequest.method ?? "GET",
          url: currentRequest.url ?? "",
          headers: Array.isArray(currentRequest.headers)
            ? [...currentRequest.headers]
            : [],
          query: Array.isArray(currentRequest.query)
            ? [...currentRequest.query]
            : [],
          body: currentRequest.body ?? {
            mode: "none",
            text: "",
            contentType: "application/json",
          },
        };
        const nextRequest = updater(draft);
        return {
          ...current,
          request: {
            method: nextRequest.method ?? "GET",
            url: nextRequest.url ?? "",
            headers: Array.isArray(nextRequest.headers)
              ? nextRequest.headers.map((header) => ({
                  id: header.id ?? createItemId(),
                  name: header.name ?? "",
                  value: header.value ?? "",
                  enabled: header.enabled !== false,
                }))
              : [],
            query: Array.isArray(nextRequest.query)
              ? nextRequest.query.map((param) => ({
                  id: param.id ?? createItemId(),
                  name: param.name ?? "",
                  value: param.value ?? "",
                  enabled: param.enabled !== false,
                }))
              : [],
            body: {
              mode: nextRequest.body?.mode ?? "none",
              text: nextRequest.body?.text ?? "",
              contentType: nextRequest.body?.contentType ?? "application/json",
            },
          },
        } satisfies NotebookCell;
      }, options);
    },
    [cell.id, onChange]
  );

  const setAssignBody = useCallback(
    (value: string | undefined, options?: { persist?: boolean }) => {
      onChange((current) => {
        if (current.id !== cell.id || current.type !== "http") {
          return current;
        }
        return { ...current, assignBody: value } satisfies NotebookCell;
      }, options);
    },
    [cell.id, onChange]
  );

  const setAssignHeaders = useCallback(
    (value: string | undefined, options?: { persist?: boolean }) => {
      onChange((current) => {
        if (current.id !== cell.id || current.type !== "http") {
          return current;
        }
        return { ...current, assignHeaders: value } satisfies NotebookCell;
      }, options);
    },
    [cell.id, onChange]
  );

  const handleAssignBodyChange = useCallback(
    (value: string) => {
      setAssignBody(value, { persist: false });
    },
    [setAssignBody]
  );

  const handleAssignBodyBlur = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      setAssignBody(trimmed.length > 0 ? trimmed : undefined, {
        persist: true,
      });
    },
    [setAssignBody]
  );

  const handleAssignHeadersChange = useCallback(
    (value: string) => {
      setAssignHeaders(value, { persist: false });
    },
    [setAssignHeaders]
  );

  const handleAssignHeadersBlur = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      setAssignHeaders(trimmed.length > 0 ? trimmed : undefined, {
        persist: true,
      });
    },
    [setAssignHeaders]
  );

  const resolvedUrl = useMemo(() => {
    const base = substituteVariables(request.url ?? "", variables);
    const query = Array.isArray(request.query) ? request.query : [];
    try {
      if (!base) return "";
      const url = new URL(base);
      query
        .filter((param) => param.enabled !== false)
        .forEach((param) => {
          const name = substituteVariables(param.name ?? "", variables);
          const value = substituteVariables(param.value ?? "", variables);
          if (name.trim().length > 0) {
            url.searchParams.append(name, value);
          }
        });
      return url.toString();
    } catch {
      const parts = query
        .filter((param) => param.enabled !== false)
        .map((param) => ({
          name: substituteVariables(param.name ?? "", variables),
          value: substituteVariables(param.value ?? "", variables),
        }))
        .filter((param) => param.name.trim().length > 0);
      if (parts.length === 0) {
        return base;
      }
      const queryString = parts
        .map(
          (param) =>
            `${encodeURIComponent(param.name)}=${encodeURIComponent(param.value)}`
        )
        .join("&");
      if (!base) {
        return queryString ? `?${queryString}` : "";
      }
      if (base.includes("?")) {
        return `${base}&${queryString}`;
      }
      return `${base}?${queryString}`;
    }
  }, [request.url, request.query, variables]);

  const resolvedHeaders = useMemo(() => {
    const list = Array.isArray(request.headers) ? request.headers : [];
    return list
      .filter((header) => header.enabled !== false)
      .map((header) => ({
        id: header.id ?? createItemId(),
        name: substituteVariables(header.name ?? "", variables),
        value: substituteVariables(header.value ?? "", variables),
      }))
      .filter((header) => header.name.trim().length > 0);
  }, [request.headers, variables]);

  const resolvedBody = useMemo(() => {
    if (request.body?.mode === "json") {
      return substituteVariables(request.body?.text ?? "", variables);
    }
    if (request.body?.mode === "text") {
      return substituteVariables(request.body?.text ?? "", variables);
    }
    return "";
  }, [request.body?.mode, request.body?.text, variables]);

  const resolvedBodyPreview = useMemo(() => {
    if (request.body?.mode !== "json") {
      return { text: resolvedBody, highlighted: null, isJson: false } as const;
    }
    const source = resolvedBody;
    if (!source || source.trim().length === 0) {
      return { text: "", highlighted: null, isJson: true } as const;
    }
    let formatted = source;
    try {
      formatted = JSON.stringify(JSON.parse(source), null, 2);
    } catch {
      // Keep the substituted value as-is when parsing fails.
    }
    return {
      text: formatted,
      highlighted: highlightJson(formatted) ?? null,
      isJson: true,
    } as const;
  }, [request.body?.mode, resolvedBody]);

  const availableVariables = useMemo(
    () => Object.keys(variables).sort(),
    [variables]
  );

  const authInfo = useMemo(() => {
    const defaultInfo = {
      mode: "none" as HttpAuthMode,
      headerIndex: -1,
      rawValue: "",
      basic: { username: "", password: "", decodeFailed: false },
      bearer: { token: "" },
    };
    const list = Array.isArray(request.headers) ? request.headers : [];
    const index = list.findIndex(
      (header) => (header.name ?? "").toLowerCase() === "authorization"
    );
    if (index === -1) {
      return defaultInfo;
    }
    const rawValue = (list[index].value ?? "").trim();
    if (!rawValue) {
      return { ...defaultInfo, headerIndex: index };
    }
    const basicMatch = rawValue.match(/^Basic\s+(.+)$/i);
    if (basicMatch) {
      const encoded = basicMatch[1].trim();
      const decoded = base64Decode(encoded);
      if (decoded === null) {
        return {
          ...defaultInfo,
          mode: "basic" as const,
          headerIndex: index,
          rawValue,
          basic: { username: "", password: "", decodeFailed: true },
        };
      }
      const separator = decoded.indexOf(":");
      const username = separator === -1 ? decoded : decoded.slice(0, separator);
      const password = separator === -1 ? "" : decoded.slice(separator + 1);
      return {
        ...defaultInfo,
        mode: "basic" as const,
        headerIndex: index,
        rawValue,
        basic: { username, password, decodeFailed: false },
      };
    }
    const bearerMatch = rawValue.match(/^Bearer\s+(.+)$/i);
    if (bearerMatch) {
      const token = bearerMatch[1].trim();
      return {
        ...defaultInfo,
        mode: "bearer" as const,
        headerIndex: index,
        rawValue,
        bearer: { token },
      };
    }
    return {
      ...defaultInfo,
      mode: "custom" as const,
      headerIndex: index,
      rawValue,
    };
  }, [request.headers]);

  const [authMode, setAuthMode] = useState<HttpAuthMode>(authInfo.mode);
  const [authModeDirty, setAuthModeDirty] = useState(false);
  const [basicAuthDraft, setBasicAuthDraft] = useState(() => ({
    username:
      authInfo.mode === "basic" && !authInfo.basic.decodeFailed
        ? authInfo.basic.username
        : "",
    password:
      authInfo.mode === "basic" && !authInfo.basic.decodeFailed
        ? authInfo.basic.password
        : "",
  }));
  const [bearerTokenDraft, setBearerTokenDraft] = useState(
    authInfo.mode === "bearer" ? authInfo.bearer.token : ""
  );

  useEffect(() => {
    if (!authModeDirty) {
      setAuthMode(authInfo.mode);
    }
  }, [authInfo.mode, authModeDirty]);

  useEffect(() => {
    if (authInfo.mode === "basic" && !authInfo.basic.decodeFailed) {
      setBasicAuthDraft((prev) =>
        prev.username === authInfo.basic.username &&
        prev.password === authInfo.basic.password
          ? prev
          : {
              username: authInfo.basic.username,
              password: authInfo.basic.password,
            }
      );
    }
  }, [
    authInfo.basic.decodeFailed,
    authInfo.basic.password,
    authInfo.basic.username,
    authInfo.mode,
  ]);

  useEffect(() => {
    if (authInfo.mode === "bearer") {
      setBearerTokenDraft((prev) =>
        prev === authInfo.bearer.token ? prev : authInfo.bearer.token
      );
    }
  }, [authInfo.bearer.token, authInfo.mode]);

  const applyNoneAuth = useCallback(
    (persist: boolean, markClean: boolean) => {
      updateRequest(
        (prev) => {
          const headers = Array.isArray(prev.headers) ? [...prev.headers] : [];
          const nextHeaders = headers.filter((header) => {
            if ((header.name ?? "").toLowerCase() !== "authorization") {
              return true;
            }
            const value = header.value?.trim() ?? "";
            return (
              value.length > 0 &&
              !/^Basic\s+/i.test(value) &&
              !/^Bearer\s+/i.test(value)
            );
          });
          return { ...prev, headers: nextHeaders };
        },
        { persist }
      );
      if (markClean) {
        setAuthModeDirty(false);
      }
    },
    [updateRequest]
  );

  const applyBasicAuth = useCallback(
    (username: string, password: string, persist: boolean) => {
      const trimmedUser = username;
      const trimmedPass = password;
      const bothEmpty =
        trimmedUser.trim().length === 0 && trimmedPass.length === 0;
      updateRequest(
        (prev) => {
          const headers = Array.isArray(prev.headers) ? [...prev.headers] : [];
          const index = headers.findIndex(
            (header) => (header.name ?? "").toLowerCase() === "authorization"
          );
          if (bothEmpty) {
            if (index >= 0) {
              const currentValue = headers[index].value ?? "";
              if (/^Basic\s+/i.test(currentValue) || !currentValue.trim()) {
                headers.splice(index, 1);
              }
            }
            return { ...prev, headers };
          }
          const encoded = base64Encode(`${trimmedUser}:${trimmedPass}`);
          const headerValue = `Basic ${encoded}`;
          if (index >= 0) {
            headers[index] = {
              ...headers[index],
              name: "Authorization",
              value: headerValue,
              enabled: true,
            };
          } else {
            headers.push({
              id: createItemId(),
              name: "Authorization",
              value: headerValue,
              enabled: true,
            });
          }
          return { ...prev, headers };
        },
        { persist }
      );
      if (persist) {
        setAuthModeDirty(false);
      }
    },
    [updateRequest]
  );

  const applyBearerAuth = useCallback(
    (token: string, persist: boolean) => {
      const trimmedToken = token.trim();
      updateRequest(
        (prev) => {
          const headers = Array.isArray(prev.headers) ? [...prev.headers] : [];
          const index = headers.findIndex(
            (header) => (header.name ?? "").toLowerCase() === "authorization"
          );
          if (trimmedToken.length === 0) {
            if (index >= 0) {
              const currentValue = headers[index].value ?? "";
              if (/^Bearer\s+/i.test(currentValue) || !currentValue.trim()) {
                headers.splice(index, 1);
              }
            }
            return { ...prev, headers };
          }
          const headerValue = `Bearer ${trimmedToken}`;
          if (index >= 0) {
            headers[index] = {
              ...headers[index],
              name: "Authorization",
              value: headerValue,
              enabled: true,
            };
          } else {
            headers.push({
              id: createItemId(),
              name: "Authorization",
              value: headerValue,
              enabled: true,
            });
          }
          return { ...prev, headers };
        },
        { persist }
      );
      if (persist) {
        setAuthModeDirty(false);
      }
    },
    [updateRequest]
  );

  const handleClearAuth = useCallback(() => {
    setBasicAuthDraft({ username: "", password: "" });
    setBearerTokenDraft("");
    setAuthMode("none");
    setAuthModeDirty(true);
    applyNoneAuth(true, true);
    if (authInfo.mode === "custom") {
      updateRequest(
        (prev) => ({
          ...prev,
          headers: (Array.isArray(prev.headers) ? prev.headers : []).filter(
            (header) => (header.name ?? "").toLowerCase() !== "authorization"
          ),
        }),
        { persist: true }
      );
    }
  }, [applyNoneAuth, authInfo.mode, updateRequest]);

  const hasAuthHeader = authInfo.mode !== "none";

  const handleAuthModeChange = useCallback(
    (value: string) => {
      const next = value as HttpAuthMode;
      if (next === "custom") {
        setAuthMode("custom");
        setAuthModeDirty(false);
        return;
      }
      if (next === "none") {
        setAuthMode("none");
        setAuthModeDirty(true);
        applyNoneAuth(true, true);
        setBasicAuthDraft({ username: "", password: "" });
        setBearerTokenDraft("");
        return;
      }
      if (next === authInfo.mode) {
        setAuthMode(next);
        setAuthModeDirty(false);
        return;
      }
      setAuthMode(next);
      setAuthModeDirty(true);
      if (authInfo.mode === "custom") {
        updateRequest(
          (prev) => ({
            ...prev,
            headers: (Array.isArray(prev.headers) ? prev.headers : []).filter(
              (header) => (header.name ?? "").toLowerCase() !== "authorization"
            ),
          }),
          { persist: true }
        );
      } else if (authInfo.mode !== "none") {
        applyNoneAuth(true, false);
      }
    },
    [applyNoneAuth, authInfo.mode, updateRequest]
  );

  const authSelectValue = authMode === "custom" ? "custom" : authMode;
  const canClearAuth =
    !readOnly &&
    !isRunning &&
    (authMode !== "none" ||
      authInfo.mode !== "none" ||
      basicAuthDraft.username.trim().length > 0 ||
      basicAuthDraft.password.length > 0 ||
      bearerTokenDraft.trim().length > 0);

  const hasHeaders =
    Array.isArray(request.headers) && request.headers.length > 0;
  const hasParams = Array.isArray(request.query) && request.query.length > 0;

  const applyCurlImport = useCallback(
    (raw: string) => {
      const parsed = parseCurlCommand(raw);
      if (!parsed || !parsed.url) {
        return false;
      }

      const { baseUrl, params } = extractUrlParts(parsed.url);
      const headerMap = new Map<string, { name: string; value: string }>();
      parsed.headers.forEach((header) => {
        const key = header.name.toLowerCase();
        headerMap.set(key, { name: header.name, value: header.value });
      });

      let bodyText = parsed.bodyText ?? "";
      let bodyMode: BodyMode = "none";
      let jsonParsedSuccessfully = false;
      if (parsed.hasBody && bodyText.trim().length > 0) {
        if (parsed.isJsonBody) {
          try {
            bodyText = JSON.stringify(JSON.parse(bodyText), null, 2);
            bodyMode = "json";
            jsonParsedSuccessfully = true;
          } catch {
            bodyMode = "text";
            jsonParsedSuccessfully = false;
          }
        } else {
          bodyMode = "text";
        }
      } else {
        bodyText = "";
        bodyMode = "none";
      }

      let contentType = headerMap.get("content-type")?.value;
      if (jsonParsedSuccessfully && !contentType) {
        contentType = "application/json";
        headerMap.set("content-type", {
          name: "Content-Type",
          value: contentType,
        });
      } else if (
        bodyMode === "text" &&
        parsed.isUrlEncodedBody &&
        !contentType
      ) {
        contentType = "application/x-www-form-urlencoded";
        headerMap.set("content-type", {
          name: "Content-Type",
          value: contentType,
        });
      } else if (!contentType) {
        if (bodyMode === "text" && parsed.hasBinaryBody) {
          contentType = "application/octet-stream";
        } else if (bodyMode === "text" && parsed.hasBody) {
          contentType = request.body?.contentType ?? "text/plain";
        } else {
          contentType = request.body?.contentType ?? "application/json";
        }
      }

      const finalHeaders = Array.from(headerMap.values()).map((header) => ({
        id: createItemId(),
        name: header.name,
        value: header.value,
        enabled: true,
      }));
      const queryParams = params
        .filter((param) => param.name.trim().length > 0)
        .map((param) => ({
          id: createItemId(),
          name: param.name,
          value: param.value,
          enabled: true,
        }));

      const candidateMethod = (parsed.method?.toUpperCase() ??
        (parsed.hasBody ? "POST" : "GET")) as string;
      const methodValue = HTTP_METHODS.includes(
        candidateMethod as HttpRequest["method"]
      )
        ? (candidateMethod as HttpRequest["method"])
        : parsed.hasBody
          ? "POST"
          : "GET";

      const resolvedContentType =
        contentType ?? request.body?.contentType ?? "application/json";

      updateRequest(
        () => ({
          method: methodValue,
          url: baseUrl,
          headers: finalHeaders,
          query: queryParams,
          body: {
            mode: bodyMode,
            text: bodyMode === "none" ? "" : bodyText,
            contentType: resolvedContentType,
          },
        }),
        { persist: true }
      );
      return true;
    },
    [request.body?.contentType, updateRequest]
  );

  const defaultTab: HttpTabKey = hasAuthHeader
    ? "auth"
    : hasHeaders
      ? "headers"
      : hasParams
        ? "params"
        : "body";

  const [activeTab, setActiveTab] = useState<HttpTabKey>(defaultTab);
  const previousCellStateRef = useRef<{ id: string; tab: HttpTabKey }>({
    id: cell.id,
    tab: defaultTab,
  });

  useEffect(() => {
    if (previousCellStateRef.current.id !== cell.id) {
      previousCellStateRef.current = { id: cell.id, tab: defaultTab };
      setActiveTab(defaultTab);
      setAuthModeDirty(false);
    }
  }, [cell.id, defaultTab]);

  useEffect(() => {
    if (response) {
      setActiveTab("response");
    }
  }, [response]);

  const handleTabChange = useCallback((value: string) => {
    if (
      value === "params" ||
      value === "headers" ||
      value === "auth" ||
      value === "body" ||
      value === "response"
    ) {
      setActiveTab(value);
    }
  }, []);

  const curlBody = useMemo(() => {
    if (request.body?.mode === "json") {
      const substituted = substituteVariables(
        request.body?.text ?? "",
        variables
      ).trim();
      if (!substituted) {
        return undefined;
      }
      try {
        return JSON.stringify(JSON.parse(substituted));
      } catch {
        return substituted;
      }
    }
    if (request.body?.mode === "text") {
      return substituteVariables(request.body?.text ?? "", variables);
    }
    return undefined;
  }, [request.body?.mode, request.body?.text, variables]);

  const curlCommand = useMemo(() => {
    const method = (request.method ?? "GET").toUpperCase();
    const targetUrl = resolvedUrl || (request.url ?? "");
    if (!targetUrl) {
      return null;
    }
    const parts: string[] = [`curl -X ${method}`];
    resolvedHeaders.forEach((header) => {
      if (!header.name) return;
      parts.push(
        `-H '${escapeCurlValue(`${header.name}: ${header.value ?? ""}`)}'`
      );
    });
    if (curlBody && curlBody.length > 0 && !["GET", "HEAD"].includes(method)) {
      parts.push(`--data '${escapeCurlValue(curlBody)}'`);
    }
    parts.push(`'${escapeCurlValue(targetUrl)}'`);
    return parts.join(" ");
  }, [curlBody, request.method, request.url, resolvedHeaders, resolvedUrl]);

  const displayedCurl = response?.curl ?? curlCommand;

  const responseBodyContent = useMemo(() => {
    if (!response?.body) {
      return { text: null, language: undefined } as const;
    }
    if (response.body.type === "json") {
      let rawText: string | null = null;
      if (typeof response.body.text === "string") {
        rawText = response.body.text;
      } else if (response.body.json) {
        try {
          rawText = JSON.stringify(response.body.json, null, 2);
        } catch {
          rawText = null;
        }
      }
      if (rawText === null) {
        return { text: null, language: "json" } as const;
      }
      let formatted = rawText;
      try {
        formatted = JSON.stringify(JSON.parse(rawText), null, 2);
      } catch {
        // Keep original formatting when parsing fails.
      }
      return {
        text: formatted,
        language: "json",
      } as const;
    }
    if (response.body.type === "text") {
      const text = response.body.text ?? "";
      return {
        text,
        language: guessLanguageFromContentType(response.body.contentType, text),
      } as const;
    }
    if (response.body.type === "binary") {
      return { text: null, language: undefined } as const;
    }
    return { text: null, language: undefined } as const;
  }, [response]);

  const responseCopyText = responseBodyContent.text ?? response?.error ?? null;
  const responseHasBodyText =
    typeof responseBodyContent.text === "string" &&
    responseBodyContent.text.trim().length > 0;
  const responseDisplayText =
    typeof responseBodyContent.text === "string"
      ? responseHasBodyText
        ? responseBodyContent.text
        : "(empty)"
      : "";
  const responseLanguage = responseHasBodyText
    ? responseBodyContent.language
    : undefined;
  const responseCopyPayload =
    responseCopyText && responseCopyText.length > 0 ? responseCopyText : null;

  const [responseCopied, setResponseCopied] = useState(false);
  const [curlCopied, setCurlCopied] = useState(false);
  const responseCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const curlCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (responseCopyTimerRef.current) {
        clearTimeout(responseCopyTimerRef.current);
        responseCopyTimerRef.current = null;
      }
      if (curlCopyTimerRef.current) {
        clearTimeout(curlCopyTimerRef.current);
        curlCopyTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setCurlCopied(false);
  }, [displayedCurl]);

  useEffect(() => {
    setResponseCopied(false);
  }, [responseBodyContent.text, response?.error]);

  const handleResponseCopied = useCallback(() => {
    setResponseCopied(true);
    if (responseCopyTimerRef.current) {
      clearTimeout(responseCopyTimerRef.current);
    }
    responseCopyTimerRef.current = setTimeout(() => {
      setResponseCopied(false);
      responseCopyTimerRef.current = null;
    }, 2000);
  }, []);

  const handleCurlCopied = useCallback(() => {
    setCurlCopied(true);
    if (curlCopyTimerRef.current) {
      clearTimeout(curlCopyTimerRef.current);
    }
    curlCopyTimerRef.current = setTimeout(() => {
      setCurlCopied(false);
      curlCopyTimerRef.current = null;
    }, 2000);
  }, []);

  const handleUrlPaste = useCallback(
    (event: ClipboardEvent<HTMLInputElement>) => {
      const text = event.clipboardData?.getData("text") ?? "";
      if (!text || !looksLikeCurlCommand(text)) {
        return;
      }
      if (applyCurlImport(text)) {
        event.preventDefault();
      }
    },
    [applyCurlImport]
  );

  const handleUrlBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      const nextValue = event.target.value.trim();
      if (nextValue.length === 0) {
        updateRequest(
          (prev) => ({
            ...prev,
            url: "",
          }),
          { persist: true }
        );
        return;
      }
      if (looksLikeCurlCommand(nextValue) && applyCurlImport(nextValue)) {
        return;
      }
      updateRequest(
        (prev) => ({
          ...prev,
          url: nextValue,
        }),
        { persist: true }
      );
    },
    [applyCurlImport, updateRequest]
  );

  const handleSubmitShortcut = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!event.shiftKey || event.key !== "Enter") {
        return;
      }
      if (readOnly) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (isRunning) {
        return;
      }
      onRun();
    },
    [isRunning, onRun, readOnly]
  );

  return (
    <div className="space-y-4" onKeyDownCapture={handleSubmitShortcut}>
      <div className="rounded-lg border border-border bg-card p-4 text-sm md:p-5">
        <div className="flex flex-col gap-3">
          <div className="flex flex-nowrap items-end gap-3 md:gap-4">
            <label
              htmlFor={methodFieldId}
              className="flex w-[120px] flex-none flex-col gap-1"
            >
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Method
              </span>
              <select
                id={methodFieldId}
                className={`${SELECT_FIELD_CLASS} px-2`}
                value={request.method ?? "GET"}
                onChange={(event) =>
                  updateRequest(
                    (prev) => ({
                      ...prev,
                      method: event.target.value as HttpRequest["method"],
                    }),
                    { persist: true }
                  )
                }
                disabled={readOnly || isRunning}
              >
                {HTTP_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </label>
            <label
              htmlFor={urlFieldId}
              className="flex min-w-0 flex-1 flex-col gap-1"
            >
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                URL
              </span>
              <Input
                id={urlFieldId}
                value={request.url ?? ""}
                onChange={(event) =>
                  updateRequest(
                    (prev) => ({ ...prev, url: event.target.value }),
                    { persist: false }
                  )
                }
                onBlur={handleUrlBlur}
                onPaste={handleUrlPaste}
                placeholder="https://api.example.com/resource"
                className="h-9"
                disabled={readOnly || isRunning}
              />
            </label>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">URL:</span>
            <span className="truncate text-primary" title={resolvedUrl}>
              {resolvedUrl || "Enter a request URL"}
            </span>
          </div>
        </div>
        {availableVariables.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="uppercase tracking-wide">Variables:</span>
            {availableVariables.map((name) => (
              <span
                key={name}
                className="rounded border border-border bg-background px-2 py-0.5 font-mono text-xs"
                title={variables[name] ?? ""}
              >
                {name}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="w-full overflow-x-auto">
          <TabsTrigger value="params" className="flex-1">
            Query Params
          </TabsTrigger>
          <TabsTrigger value="headers" className="flex-1">
            Headers
          </TabsTrigger>
          <TabsTrigger value="auth" className="flex-1">
            Auth
          </TabsTrigger>
          <TabsTrigger value="body" className="flex-1">
            Body
          </TabsTrigger>
          <TabsTrigger value="response" className="flex-1">
            Response
          </TabsTrigger>
        </TabsList>
        <TabsContent value="auth">
          <div className="rounded-lg border border-border bg-card p-4 text-sm sm:p-5">
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1 sm:max-w-xs">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Authorization Type
                </span>
                <select
                  className={`${SELECT_FIELD_CLASS} px-2`}
                  value={authSelectValue}
                  onChange={(event) => handleAuthModeChange(event.target.value)}
                  disabled={readOnly || isRunning}
                >
                  <option value="none">No Auth</option>
                  <option value="basic">Basic</option>
                  <option value="bearer">Bearer Token</option>
                  {authInfo.mode === "custom" ? (
                    <option value="custom">Custom Header</option>
                  ) : null}
                </select>
                <span className="text-[11px] text-muted-foreground">
                  Configure credentials without editing headers manually.
                </span>
              </label>

              {authMode === "basic" ? (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Username
                      </span>
                      <Input
                        value={basicAuthDraft.username}
                        onChange={(event) =>
                          setBasicAuthDraft((prev) => {
                            const next = {
                              ...prev,
                              username: event.target.value,
                            };
                            applyBasicAuth(next.username, next.password, false);
                            return next;
                          })
                        }
                        onBlur={() =>
                          applyBasicAuth(
                            basicAuthDraft.username,
                            basicAuthDraft.password,
                            true
                          )
                        }
                        placeholder="user or {{API_USER}}"
                        disabled={readOnly || isRunning}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Password
                      </span>
                      <Input
                        type="password"
                        value={basicAuthDraft.password}
                        onChange={(event) =>
                          setBasicAuthDraft((prev) => {
                            const next = {
                              ...prev,
                              password: event.target.value,
                            };
                            applyBasicAuth(next.username, next.password, false);
                            return next;
                          })
                        }
                        onBlur={() =>
                          applyBasicAuth(
                            basicAuthDraft.username,
                            basicAuthDraft.password,
                            true
                          )
                        }
                        placeholder="secret or {{API_PASS}}"
                        disabled={readOnly || isRunning}
                      />
                    </label>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Values are stored with the notebook. Leave fields blank to
                    remove the Authorization header.
                  </p>
                  {authInfo.basic.decodeFailed ? (
                    <AlertCallout
                      level="warn"
                      className="mt-2"
                      text="We could not decode the existing Basic token. Updating either field will replace it."
                    />
                  ) : null}
                </div>
              ) : null}

              {authMode === "bearer" ? (
                <div className="space-y-3">
                  <label className="flex flex-col gap-1 sm:max-w-lg">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Token
                    </span>
                    <Input
                      type="password"
                      value={bearerTokenDraft}
                      onChange={(event) => {
                        const next = event.target.value;
                        setBearerTokenDraft(next);
                        applyBearerAuth(next, false);
                      }}
                      onBlur={() => applyBearerAuth(bearerTokenDraft, true)}
                      placeholder="Bearer token or {{API_TOKEN}}"
                      disabled={readOnly || isRunning}
                    />
                  </label>
                  <p className="text-[11px] text-muted-foreground">
                    Token is inserted as{" "}
                    <code>Authorization: Bearer &lt;token&gt;</code>. Clear the
                    field to remove the header.
                  </p>
                </div>
              ) : null}

              {authMode === "custom" ? (
                <AlertCallout
                  level="info"
                  className="mt-1"
                  text="This request already defines an Authorization header in the Headers tab. Adjust it there or choose a new auth type to replace it."
                />
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>
                  Header updates are applied when leaving a field. Variables
                  such as <code>{"{{API_TOKEN}}"}</code> are supported.
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="px-2 py-1 text-xs"
                  onClick={handleClearAuth}
                  disabled={!canClearAuth}
                >
                  Clear
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="params">
          <div className="rounded-lg border border-border bg-card">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="w-1/3 px-3 py-2 text-left">Name</th>
                  <th className="w-1/2 px-3 py-2 text-left">Value</th>
                  <th className="w-[80px] px-3 py-2 text-left">Enabled</th>
                  <th className="w-[60px] px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {(request.query ?? []).map((param) => (
                  <tr
                    key={param.id ?? createItemId()}
                    className="border-t border-border/60"
                  >
                    <td className="px-3 py-2">
                      <Input
                        value={param.name ?? ""}
                        onChange={(event) =>
                          updateRequest(
                            (prev) => ({
                              ...prev,
                              query: (prev.query ?? []).map((item) =>
                                item.id === param.id
                                  ? { ...item, name: event.target.value }
                                  : item
                              ),
                            }),
                            { persist: false }
                          )
                        }
                        onBlur={(event) =>
                          updateRequest(
                            (prev) => ({
                              ...prev,
                              query: (prev.query ?? []).map((item) =>
                                item.id === param.id
                                  ? { ...item, name: event.target.value }
                                  : item
                              ),
                            }),
                            { persist: true }
                          )
                        }
                        disabled={readOnly || isRunning}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={param.value ?? ""}
                        onChange={(event) =>
                          updateRequest(
                            (prev) => ({
                              ...prev,
                              query: (prev.query ?? []).map((item) =>
                                item.id === param.id
                                  ? { ...item, value: event.target.value }
                                  : item
                              ),
                            }),
                            { persist: false }
                          )
                        }
                        onBlur={(event) =>
                          updateRequest(
                            (prev) => ({
                              ...prev,
                              query: (prev.query ?? []).map((item) =>
                                item.id === param.id
                                  ? { ...item, value: event.target.value }
                                  : item
                              ),
                            }),
                            { persist: true }
                          )
                        }
                        disabled={readOnly || isRunning}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <label className="inline-flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={param.enabled !== false}
                          onChange={(event) =>
                            updateRequest(
                              (prev) => ({
                                ...prev,
                                query: (prev.query ?? []).map((item) =>
                                  item.id === param.id
                                    ? { ...item, enabled: event.target.checked }
                                    : item
                                ),
                              }),
                              { persist: true }
                            )
                          }
                          disabled={readOnly || isRunning}
                        />
                        Enabled
                      </label>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive/80"
                        onClick={() =>
                          updateRequest(
                            (prev) => ({
                              ...prev,
                              query: (prev.query ?? []).filter(
                                (item) => item.id !== param.id
                              ),
                            }),
                            { persist: true }
                          )
                        }
                        disabled={readOnly || isRunning}
                        aria-label="Remove query parameter"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {readOnly ? null : (
              <div className="flex items-center justify-end border-t border-border/60 bg-muted/40 px-3 py-2">
                <Button
                  variant="default"
                  size="sm"
                  className="flex items-center gap-1 px-3"
                  onClick={() =>
                    updateRequest(
                      (prev) => ({
                        ...prev,
                        query: [
                          ...(prev.query ?? []),
                          {
                            id: createItemId(),
                            name: "",
                            value: "",
                            enabled: true,
                          },
                        ],
                      }),
                      { persist: true }
                    )
                  }
                  disabled={isRunning}
                >
                  <PlusIcon className="h-4 w-4" />
                  Add param
                </Button>
              </div>
            )}
          </div>
        </TabsContent>
        <TabsContent value="headers">
          <div className="rounded-lg border border-border bg-card">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="w-1/3 px-3 py-2 text-left">Header</th>
                  <th className="w-1/2 px-3 py-2 text-left">Value</th>
                  <th className="w-[80px] px-3 py-2 text-left">Enabled</th>
                  <th className="w-[60px] px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {(request.headers ?? []).map((header) => (
                  <tr
                    key={header.id ?? createItemId()}
                    className="border-t border-border/60"
                  >
                    <td className="px-3 py-2">
                      <Input
                        value={header.name ?? ""}
                        onChange={(event) =>
                          updateRequest(
                            (prev) => ({
                              ...prev,
                              headers: (prev.headers ?? []).map((item) =>
                                item.id === header.id
                                  ? { ...item, name: event.target.value }
                                  : item
                              ),
                            }),
                            { persist: false }
                          )
                        }
                        onBlur={(event) =>
                          updateRequest(
                            (prev) => ({
                              ...prev,
                              headers: (prev.headers ?? []).map((item) =>
                                item.id === header.id
                                  ? { ...item, name: event.target.value }
                                  : item
                              ),
                            }),
                            { persist: true }
                          )
                        }
                        disabled={readOnly || isRunning}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={header.value ?? ""}
                        onChange={(event) =>
                          updateRequest(
                            (prev) => ({
                              ...prev,
                              headers: (prev.headers ?? []).map((item) =>
                                item.id === header.id
                                  ? { ...item, value: event.target.value }
                                  : item
                              ),
                            }),
                            { persist: false }
                          )
                        }
                        onBlur={(event) =>
                          updateRequest(
                            (prev) => ({
                              ...prev,
                              headers: (prev.headers ?? []).map((item) =>
                                item.id === header.id
                                  ? { ...item, value: event.target.value }
                                  : item
                              ),
                            }),
                            { persist: true }
                          )
                        }
                        disabled={readOnly || isRunning}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <label className="inline-flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={header.enabled !== false}
                          onChange={(event) =>
                            updateRequest(
                              (prev) => ({
                                ...prev,
                                headers: (prev.headers ?? []).map((item) =>
                                  item.id === header.id
                                    ? { ...item, enabled: event.target.checked }
                                    : item
                                ),
                              }),
                              { persist: true }
                            )
                          }
                          disabled={readOnly || isRunning}
                        />
                        Enabled
                      </label>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive/80"
                        onClick={() =>
                          updateRequest(
                            (prev) => ({
                              ...prev,
                              headers: (prev.headers ?? []).filter(
                                (item) => item.id !== header.id
                              ),
                            }),
                            { persist: true }
                          )
                        }
                        disabled={readOnly || isRunning}
                        aria-label="Remove header"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {readOnly ? null : (
              <div className="flex items-center justify-end border-t border-border/60 bg-muted/40 px-3 py-2">
                <Button
                  variant="default"
                  size="sm"
                  className="flex items-center gap-1 px-3"
                  onClick={() =>
                    updateRequest(
                      (prev) => ({
                        ...prev,
                        headers: [
                          ...(prev.headers ?? []),
                          {
                            id: createItemId(),
                            name: "",
                            value: "",
                            enabled: true,
                          },
                        ],
                      }),
                      { persist: true }
                    )
                  }
                  disabled={isRunning}
                >
                  <PlusIcon className="h-4 w-4" />
                  Add header
                </Button>
              </div>
            )}
          </div>
        </TabsContent>
        <TabsContent value="body">
          <div className="space-y-3 rounded-lg border border-border bg-card p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Body type
              </span>
              {BODY_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  variant={
                    request.body?.mode === option.value ? "secondary" : "ghost"
                  }
                  size="sm"
                  onClick={() =>
                    updateRequest(
                      (prev) => ({
                        ...prev,
                        body: {
                          mode: option.value,
                          text:
                            option.value === prev.body?.mode
                              ? (prev.body?.text ?? "")
                              : "",
                          contentType:
                            option.value === "json"
                              ? "application/json"
                              : option.value === "text"
                                ? (prev.body?.contentType ?? "text/plain")
                                : (prev.body?.contentType ??
                                  "application/json"),
                        },
                      }),
                      { persist: true }
                    )
                  }
                  disabled={readOnly || isRunning}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            {request.body?.mode === "json" ? (
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  JSON body
                </label>
                <textarea
                  className="min-h-[140px] w-full rounded-md border border-input bg-background p-3 font-mono text-sm text-foreground shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
                  value={request.body?.text ?? ""}
                  onChange={(event) =>
                    updateRequest(
                      (prev) => ({
                        ...prev,
                        body: {
                          mode: "json",
                          text: event.target.value,
                          contentType:
                            prev.body?.contentType ?? "application/json",
                        },
                      }),
                      { persist: false }
                    )
                  }
                  onBlur={(event) =>
                    updateRequest(
                      (prev) => ({
                        ...prev,
                        body: {
                          mode: "json",
                          text: event.target.value,
                          contentType:
                            prev.body?.contentType ?? "application/json",
                        },
                      }),
                      { persist: true }
                    )
                  }
                  disabled={readOnly || isRunning}
                />
              </div>
            ) : null}
            {request.body?.mode === "text" ? (
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Request body
                </label>
                <textarea
                  className="min-h-[120px] w-full rounded-md border border-input bg-background p-3 font-mono text-sm text-foreground shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
                  value={request.body?.text ?? ""}
                  onChange={(event) =>
                    updateRequest(
                      (prev) => ({
                        ...prev,
                        body: {
                          mode: "text",
                          text: event.target.value,
                          contentType: prev.body?.contentType ?? "text/plain",
                        },
                      }),
                      { persist: false }
                    )
                  }
                  onBlur={(event) =>
                    updateRequest(
                      (prev) => ({
                        ...prev,
                        body: {
                          mode: "text",
                          text: event.target.value,
                          contentType: prev.body?.contentType ?? "text/plain",
                        },
                      }),
                      { persist: true }
                    )
                  }
                  disabled={readOnly || isRunning}
                />
              </div>
            ) : null}
            <div className="rounded-md border border-dashed border-border/80 bg-muted/40 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Preview</p>
              {request.body?.mode === "none" ? (
                <p>No body will be sent with this request.</p>
              ) : request.body?.mode === "json" &&
                resolvedBodyPreview.highlighted ? (
                <div className="mt-1 max-h-48 overflow-auto">
                  <div className="markdown-preview text-[11px]">
                    <pre className="whitespace-pre-wrap break-words font-mono !text-[11px] leading-6 text-left text-slate-700 dark:text-slate-100 !m-0 !border-0 !bg-transparent !p-0">
                      <code
                        className="hljs language-json block !text-[11px] leading-6"
                        dangerouslySetInnerHTML={{
                          __html: resolvedBodyPreview.highlighted,
                        }}
                      />
                    </pre>
                  </div>
                </div>
              ) : (
                <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-slate-700 dark:text-slate-200">
                  {resolvedBodyPreview.text || "(empty)"}
                </pre>
              )}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="response">
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-card p-4 text-sm">
              <div className="mb-3 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Assignments
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Store the parsed response body or headers in globals for reuse
                  in code cells.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Assign body
                  </span>
                  <Input
                    value={assignBodyValue}
                    onChange={(event) =>
                      handleAssignBodyChange(event.target.value)
                    }
                    onBlur={(event) => handleAssignBodyBlur(event.target.value)}
                    placeholder="e.g. latestResponse"
                    disabled={readOnly || isRunning}
                  />
                  {assignBodyError ? (
                    <span className="text-xs font-medium text-rose-500">
                      {assignBodyError}
                    </span>
                  ) : (
                    <span className={bodyStatusClass}>{bodyStatus.text}</span>
                  )}
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Assign headers
                  </span>
                  <Input
                    value={assignHeadersValue}
                    onChange={(event) =>
                      handleAssignHeadersChange(event.target.value)
                    }
                    onBlur={(event) =>
                      handleAssignHeadersBlur(event.target.value)
                    }
                    placeholder="e.g. latestHeaders"
                    disabled={readOnly || isRunning}
                  />
                  {assignHeadersError ? (
                    <span className="text-xs font-medium text-rose-500">
                      {assignHeadersError}
                    </span>
                  ) : (
                    <span className={headersStatusClass}>
                      {headersStatus.text}
                    </span>
                  )}
                </label>
              </div>
            </div>
            <div className="space-y-4 rounded-lg border border-border bg-card p-4 text-sm">
              {response ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={clsx(
                        "rounded px-2 py-1 text-xs font-semibold",
                        response.status &&
                          response.status >= 200 &&
                          response.status < 300
                          ? "bg-primary/10 text-primary"
                          : "bg-rose-500/10 text-rose-400"
                      )}
                    >
                      {response.status ?? "--"}
                    </span>
                    {response.statusText ? (
                      <span className="text-xs text-muted-foreground">
                        {response.statusText}
                      </span>
                    ) : null}
                    {typeof response.durationMs === "number" ? (
                      <span className="text-xs text-muted-foreground">
                        {response.durationMs} ms
                      </span>
                    ) : null}
                    {typeof response.body?.size === "number" ? (
                      <span className="text-xs text-muted-foreground">
                        {response.body.size} bytes
                      </span>
                    ) : null}
                    {response.body?.contentType ? (
                      <span className="text-xs text-muted-foreground">
                        {response.body.contentType}
                      </span>
                    ) : null}
                    {response.error ? (
                      <span className="text-xs text-rose-400">
                        {response.error}
                      </span>
                    ) : null}
                  </div>
                  {responseBodyContent.text !== null ? (
                    <div className="space-y-1">
                      <CodeBlock
                        code={responseDisplayText}
                        language={responseLanguage}
                        themeMode={themeMode}
                        className="max-h-64"
                        contentClassName="max-h-64 whitespace-pre-wrap break-words text-xs leading-6"
                        copyValue={responseCopyPayload ?? null}
                        onCopy={
                          responseCopyPayload ? handleResponseCopied : undefined
                        }
                        copyButtonClassName="right-3 top-3"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        {responseCopied ? " • Copied!" : ""}
                      </p>
                    </div>
                  ) : null}
                  {response.body?.type === "binary" ? (
                    <p className="text-xs text-muted-foreground">
                      Binary response captured as base64 (
                      {response.body?.contentType ?? "unknown"}).
                    </p>
                  ) : null}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Response headers
                    </p>
                    <div className="rounded-md border border-border/80 bg-muted/30 p-3 text-xs">
                      {Array.isArray(response.headers) &&
                      response.headers.length > 0 ? (
                        <ul className="space-y-1">
                          {response.headers.map((header) => (
                            <li
                              key={`${header.name}-${header.value}`}
                              className="flex w-full flex-wrap gap-2"
                            >
                              <span className="break-all font-medium text-foreground">
                                {header.name}
                              </span>
                              <span className="break-all text-muted-foreground">
                                {header.value}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-muted-foreground">
                          No headers returned.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
                  Run the request to see the response here.
                </div>
              )}
              {displayedCurl ? (
                <div className="space-y-1 border-t border-border/60 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    cURL Command
                  </p>
                  <CodeBlock
                    code={displayedCurl}
                    language="bash"
                    themeMode={themeMode}
                    className="max-h-48"
                    contentClassName="max-h-48 whitespace-pre-wrap break-words text-xs leading-6"
                    copyValue={displayedCurl}
                    onCopy={handleCurlCopied}
                    copyButtonClassName="right-3 top-3"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {curlCopied ? " • Copied!" : ""}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default HttpCellView;
