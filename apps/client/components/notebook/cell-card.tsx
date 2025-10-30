"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FocusEvent, SyntheticEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Eraser,
  Loader2,
  Pencil,
  Play,
  Copy,
  Sparkles,
  Settings as SettingsIcon,
  Trash2,
  XCircle,
  Code,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { NotebookCell, SqlConnection } from "@nodebooks/notebook-schema";
import { clientConfig } from "@nodebooks/config/client";
import CodeCellView from "@/components/notebook/code-cell-view";
import MarkdownCellView from "@/components/notebook/markdown-cell-view";
import CommandCellView from "@/components/notebook/command-cell-view";
import TerminalCellView from "@/components/notebook/terminal-cell-view";
import HttpCellView from "@/components/notebook/http-cell-view";
import SqlCellView from "@/components/notebook/sql-cell-view";
import PlotCellView from "@/components/notebook/plot-cell-view";
import AiCellView from "@/components/notebook/ai-cell-view";
import AddCellMenu from "@/components/notebook/add-cell-menu";
import type { AttachmentMetadata } from "@/components/notebook/attachment-utils";
import {
  DEFAULT_CODE_EDITOR_SETTINGS,
  DEFAULT_MARKDOWN_EDITOR_SETTINGS,
  DEFAULT_TERMINAL_PREFERENCES,
  type MonacoEditorSettings,
  type TerminalPreferences,
} from "@/components/notebook/editor-preferences";
import { copyTextToClipboard } from "@/lib/clipboard";
import type { UiInteractionEvent } from "@nodebooks/ui";

interface CellCardProps {
  cell: NotebookCell;
  notebookId: string;
  onAttachmentUploaded?: (attachment: AttachmentMetadata, url: string) => void;
  onChange: (
    updater: (cell: NotebookCell) => NotebookCell,
    options?: { persist?: boolean; touch?: boolean }
  ) => void;
  onRun: () => void;
  onInterrupt?: () => void;
  onDelete: () => void;
  onAddBelow: (type: NotebookCell["type"]) => void | Promise<void>;
  onMove: (direction: "up" | "down") => void;
  onCloneHttpToCode: (id: string, source: string) => void;
  onCloneSqlToCode: (id: string, source: string) => void;
  isRunning: boolean;
  queued?: boolean;
  canRun: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  editorKey: string;
  editorPath?: string;
  active: boolean;
  onActivate: () => void;
  aiEnabled: boolean;
  terminalCellsEnabled: boolean;
  dependencies?: Record<string, string>;
  variables?: Record<string, string>;
  globals?: Record<string, unknown>;
  pendingTerminalPersist?: boolean;
  readOnly: boolean;
  sqlConnections: SqlConnection[];
  onRequestAddConnection: () => void;
  onUiInteraction?: (
    cellId: string,
    event: UiInteractionEvent
  ) => Promise<void> | void;
}

type CodeCellMetadata = Record<string, unknown> & {
  timeoutMs?: number;
  editor?: MonacoEditorSettings;
};

type MarkdownCellMetadata = Record<string, unknown> & {
  ui?: { edit?: boolean };
  editor?: MonacoEditorSettings;
};

type TerminalCellMetadata = Record<string, unknown> & {
  terminal?: TerminalPreferences;
  pendingCommand?: {
    id: string;
    command: string;
    sourceId?: string;
  };
};

const FONT_SIZE_PRESETS = [10, 12, 14, 16, 18, 20, 24, 28, 32] as const;
type FontSizePreset = (typeof FONT_SIZE_PRESETS)[number];
type FontSizePresetString = `${FontSizePreset}`;
type FontSizeSelection = "default" | "custom" | FontSizePresetString;

const FONT_SIZE_PRESET_STRINGS = new Set<string>(
  FONT_SIZE_PRESETS.map((size) => String(size))
);

type HttpCellType = Extract<NotebookCell, { type: "http" }>;

type SqlCellType = Extract<NotebookCell, { type: "sql" }>;

type PlotCellType = Extract<NotebookCell, { type: "plot" }>;

interface HttpExecutionDetails {
  method: string;
  url: string | null;
  headers: { name: string; value: string }[];
  body?: string;
}

const fontSizeSelectionForValue = (value: string): FontSizeSelection => {
  if (value.length === 0) {
    return "default";
  }
  return FONT_SIZE_PRESET_STRINGS.has(value)
    ? (value as FontSizePresetString)
    : "custom";
};

const API_BASE_URL = clientConfig().apiBaseUrl;

const HTTP_VARIABLE_PATTERN = /\{\{\s*([A-Z0-9_]+)\s*\}\}/gi;

const substituteHttpVariables = (
  value: string,
  variables: Record<string, string>
) => {
  if (typeof value !== "string" || value.length === 0) {
    return "";
  }
  HTTP_VARIABLE_PATTERN.lastIndex = 0;
  return value.replace(HTTP_VARIABLE_PATTERN, (_, rawKey: string) => {
    const key = rawKey.trim();
    if (!key) {
      return "";
    }
    const exact = variables[key] ?? variables[key.toUpperCase()] ?? "";
    return exact;
  });
};

const buildHttpExecutionDetails = (
  cell: HttpCellType,
  variables: Record<string, string>
): HttpExecutionDetails | null => {
  const request = cell.request ?? {
    method: "GET",
    url: "",
    headers: [],
    query: [],
    body: { mode: "none", text: "", contentType: "application/json" },
  };

  const method = (request.method ?? "GET").toUpperCase();

  const headers = (request.headers ?? [])
    .filter((header) => header?.enabled !== false)
    .map((header) => {
      const name = substituteHttpVariables(
        header?.name ?? "",
        variables
      ).trim();
      const value = substituteHttpVariables(header?.value ?? "", variables);
      return { name, value };
    })
    .filter((header) => header.name.length > 0);

  const query = (request.query ?? [])
    .filter((param) => param?.enabled !== false)
    .map((param) => ({
      name: substituteHttpVariables(param?.name ?? "", variables),
      value: substituteHttpVariables(param?.value ?? "", variables),
    }))
    .filter((param) => param.name.trim().length > 0);

  const rawUrl = substituteHttpVariables(request.url ?? "", variables).trim();
  let urlString: string | null = rawUrl || null;
  if (rawUrl) {
    try {
      const url = new URL(rawUrl);
      query.forEach((param) => {
        url.searchParams.append(param.name, param.value);
      });
      urlString = url.toString();
    } catch {
      if (query.length > 0) {
        const queryString = query
          .map(
            (param) =>
              `${encodeURIComponent(param.name)}=${encodeURIComponent(param.value)}`
          )
          .join("&");
        urlString = `${rawUrl}${rawUrl.includes("?") ? "&" : "?"}${queryString}`;
      }
    }
  }

  let body: string | undefined;
  if (request.body?.mode === "json") {
    const substituted = substituteHttpVariables(
      request.body?.text ?? "",
      variables
    ).trim();
    if (substituted.length > 0) {
      try {
        body = JSON.stringify(JSON.parse(substituted));
      } catch {
        body = substituted;
      }
    }
  } else if (request.body?.mode === "text") {
    body = substituteHttpVariables(request.body?.text ?? "", variables);
  }

  if (["GET", "HEAD"].includes(method)) {
    body = undefined;
  }

  return {
    method,
    url: urlString,
    headers,
    body,
  };
};

const escapeCurlValue = (value: string) => {
  return value.replace(/'/g, "'\\''");
};

const buildHttpCurlCommand = (details: HttpExecutionDetails | null) => {
  if (!details || !details.url) {
    return null;
  }
  const parts = [`curl -X ${details.method}`];
  details.headers.forEach((header) => {
    parts.push(`-H '${escapeCurlValue(`${header.name}: ${header.value}`)}'`);
  });
  if (details.body && details.body.length > 0) {
    parts.push(`--data '${escapeCurlValue(details.body)}'`);
  }
  parts.push(`'${escapeCurlValue(details.url)}'`);
  return parts.join(" ");
};

const sanitizeTemplateLiteral = (value: string) => {
  const escaped = (value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
  HTTP_VARIABLE_PATTERN.lastIndex = 0;
  return escaped.replace(HTTP_VARIABLE_PATTERN, (_, rawKey: string) => {
    const key = rawKey.trim();
    if (!key) {
      return "";
    }
    return "${process.env." + key + ' ?? ""}';
  });
};

const toTemplateLiteral = (value: string) => {
  return `\`${sanitizeTemplateLiteral(value ?? "")}\``;
};

const buildHttpCodeSnippet = (cell: HttpCellType) => {
  const request = cell.request ?? {
    method: "GET",
    url: "",
    headers: [],
    query: [],
    body: { mode: "none", text: "", contentType: "application/json" },
  };

  const lines: string[] = [];
  const rawUrl = (request.url ?? "").trim();
  const urlLiteral = rawUrl
    ? toTemplateLiteral(rawUrl)
    : "`https://example.com`";
  lines.push(`const url = new URL(${urlLiteral});`);

  (request.query ?? [])
    .filter((param) => param?.enabled !== false)
    .filter((param) => (param?.name ?? "").trim().length > 0)
    .forEach((param) => {
      lines.push(
        `url.searchParams.append(${toTemplateLiteral(param?.name ?? "")}, ${toTemplateLiteral(
          param?.value ?? ""
        )});`
      );
    });

  const headerLines = (request.headers ?? [])
    .filter((header) => header?.enabled !== false)
    .filter((header) => (header?.name ?? "").trim().length > 0)
    .map(
      (header) =>
        `headers.set(${toTemplateLiteral(header?.name ?? "")}, ${toTemplateLiteral(
          header?.value ?? ""
        )});`
    );

  if (headerLines.length > 0) {
    lines.push("", "const headers = new Headers();");
    lines.push(...headerLines);
  }

  const bodyMode = request.body?.mode ?? "none";
  const bodyText = request.body?.text ?? "";
  let bodyDeclaration: string | null = null;
  let bodyUsage: string | null = null;
  if (bodyMode === "json" && bodyText.trim().length > 0) {
    bodyDeclaration = `const payload = JSON.parse(${toTemplateLiteral(bodyText)});`;
    bodyUsage = "JSON.stringify(payload)";
  } else if (bodyMode === "text" && bodyText.length > 0) {
    bodyDeclaration = `const body = ${toTemplateLiteral(bodyText)};`;
    bodyUsage = "body";
  }

  if (bodyDeclaration) {
    lines.push("", bodyDeclaration);
  }

  const optionEntries: string[] = [
    `  method: ${JSON.stringify((request.method ?? "GET").toUpperCase())}`,
  ];
  if (headerLines.length > 0) {
    optionEntries.push("  headers");
  }
  if (bodyUsage) {
    optionEntries.push(`  body: ${bodyUsage}`);
  }

  lines.push(
    "",
    "const response = await fetch(url, {",
    ...optionEntries.map((entry) => `${entry},`),
    "});",
    "",
    "if (!response.ok) {",
    "  throw new Error(`Request failed: ${response.status} ${response.statusText}`);",
    "}",
    "",
    'const contentType = response.headers.get("content-type");',
    'if (contentType && contentType.includes("application/json")) {',
    "  const data = await response.json();",
    "  console.log(data);",
    "} else {",
    "  const text = await response.text();",
    "  console.log(text);",
    "}"
  );

  return lines.join("\n");
};

const sanitizeSqlTemplateLiteral = (value: string) => {
  return (value ?? "").replace(/\\/g, "\\\\").replace(/`/g, "\\`");
};

const toSqlTemplateLiteral = (value: string) => {
  return `\`${sanitizeSqlTemplateLiteral(value)}\``;
};

const SQL_IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const buildSqlCodeSnippet = (
  cell: SqlCellType,
  connections: SqlConnection[],
  variables: Record<string, string> | undefined
) => {
  const connection = cell.connectionId
    ? connections.find((item) => item.id === cell.connectionId)
    : undefined;
  const query = (cell.query ?? "").trim() || "select 1";
  const assign = (cell.assignVariable ?? "").trim();
  const assignTarget = SQL_IDENTIFIER_PATTERN.test(assign) ? assign : null;
  const connectionString = connection?.config?.connectionString?.trim();
  const extractEnvPlaceholder = (value: string | undefined | null) => {
    if (!value) return null;
    const match = value.match(/\{\{\s*([A-Z0-9_]+)\s*\}\}/i);
    if (!match) return null;
    return match[1]?.toUpperCase() ?? null;
  };

  const lines: string[] = [];
  lines.push('import { Client } from "pg";');
  lines.push("", "const client = new Client({");
  const resolveFallbackEnvKey = () => {
    if (variables) {
      const keys = Object.keys(variables).map((key) => key.toUpperCase());
      const preferred =
        keys.find((key) => key === "DATABASE_URL") ??
        keys.find((key) => key.endsWith("_DATABASE_URL")) ??
        keys.find((key) => key.includes("DATABASE")) ??
        keys.find((key) => key.includes("POSTGRES")) ??
        keys.find((key) => key.includes("PG"));
      if (preferred) {
        return preferred;
      }
    }
    return "DATABASE_URL";
  };

  if (connectionString) {
    const envKey = extractEnvPlaceholder(connectionString);
    if (envKey) {
      lines.push(`  connectionString: process.env.${envKey} ?? "",`);
    } else {
      lines.push(`  connectionString: ${JSON.stringify(connectionString)},`);
    }
  } else {
    const fallbackEnv = resolveFallbackEnvKey();
    lines.push(`  connectionString: process.env.${fallbackEnv} ?? "",`);
  }
  lines.push("});", "", "await client.connect();", "try {");
  lines.push(
    `  const result = await client.query(${toSqlTemplateLiteral(query)});`
  );
  if (assignTarget) {
    lines.push(`  const ${assignTarget} = result.rows;`);
  }
  lines.push(
    "  console.log(result.rows);",
    "} finally {",
    "  await client.end();",
    "}"
  );

  return lines.join("\n");
};

const CellCard = ({
  cell,
  notebookId,
  onAttachmentUploaded,
  onChange,
  onRun,
  onInterrupt,
  onDelete,
  onAddBelow,
  onMove,
  onCloneHttpToCode,
  onCloneSqlToCode,
  isRunning,
  queued,
  canRun,
  canMoveUp,
  canMoveDown,
  editorKey,
  editorPath,
  active: _active,
  onActivate,
  aiEnabled,
  terminalCellsEnabled,
  dependencies,
  variables,
  globals,
  pendingTerminalPersist = false,
  readOnly,
  sqlConnections,
  onRequestAddConnection,
  onUiInteraction,
}: CellCardProps) => {
  void _active;
  const isCode = cell.type === "code";
  const isMarkdown = cell.type === "markdown";
  const isTerminal = cell.type === "terminal";
  const isCommand = cell.type === "command";
  const isHttp = cell.type === "http";
  const isSql = cell.type === "sql";
  const isPlot = cell.type === "plot";
  const isAi = cell.type === "ai";
  const showAiActions =
    aiEnabled &&
    !isTerminal &&
    !isCommand &&
    !isHttp &&
    !isSql &&
    !isPlot &&
    !isAi &&
    !readOnly;
  const isReadOnly = readOnly;
  const codeLanguage = isCode ? cell.language : undefined;
  const cellContent = isTerminal
    ? (cell.buffer ?? "")
    : isCommand
      ? [cell.command ?? "", cell.notes ?? ""].filter(Boolean).join("\n\n")
      : isHttp
        ? JSON.stringify(cell.request ?? {})
        : isSql
          ? (cell.query ?? "")
          : isPlot
            ? JSON.stringify(cell.bindings ?? {})
            : isAi
              ? cell.prompt ?? ""
              : (cell.source ?? "");
  const handleUiInteraction = useCallback(
    (event: UiInteractionEvent) => {
      if (!onUiInteraction) return;
      onUiInteraction(cell.id, event);
    },
    [onUiInteraction, cell.id]
  );
  const [showConfig, setShowConfig] = useState(false);
  const [timeoutDraft, setTimeoutDraft] = useState("");
  const [timeoutError, setTimeoutError] = useState<string | null>(null);
  const [editorFontSizeDraft, setEditorFontSizeDraft] = useState("");
  const [editorFontSizeSelection, setEditorFontSizeSelection] =
    useState<FontSizeSelection>("default");
  const [editorWordWrapDraft, setEditorWordWrapDraft] = useState<
    "default" | "on" | "off"
  >("default");
  const [editorLineNumbersDraft, setEditorLineNumbersDraft] = useState<
    "default" | "on" | "off"
  >("default");
  const [editorMinimapDraft, setEditorMinimapDraft] = useState<
    "default" | "show" | "hide"
  >("default");
  const [editorError, setEditorError] = useState<string | null>(null);
  const [terminalFontSizeDraft, setTerminalFontSizeDraft] = useState("");
  const [terminalFontSizeSelection, setTerminalFontSizeSelection] =
    useState<FontSizeSelection>("default");
  const [terminalCursorBlinkDraft, setTerminalCursorBlinkDraft] = useState<
    "default" | "on" | "off"
  >("default");
  const [terminalCursorStyleDraft, setTerminalCursorStyleDraft] = useState<
    "default" | "block" | "bar" | "underline"
  >("default");
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const aiControllerRef = useRef<AbortController | null>(null);
  const aiCloseIntentRef = useRef<"auto" | null>(null);
  const [curlCopied, setCurlCopied] = useState(false);
  const curlCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!aiEnabled && aiOpen) {
      setAiOpen(false);
      setAiError(null);
      setAiPrompt("");
    }
  }, [aiEnabled, aiOpen]);

  useEffect(() => {
    return () => {
      if (curlCopyTimerRef.current) {
        clearTimeout(curlCopyTimerRef.current);
        curlCopyTimerRef.current = null;
      }
    };
  }, []);

  const httpVariables = useMemo(
    () => (isHttp ? (variables ?? {}) : {}),
    [isHttp, variables]
  );
  const httpDetails = useMemo(
    () =>
      isHttp
        ? buildHttpExecutionDetails(cell as HttpCellType, httpVariables)
        : null,
    [cell, httpVariables, isHttp]
  );
  const httpCurl = useMemo(
    () => (isHttp ? buildHttpCurlCommand(httpDetails) : null),
    [httpDetails, isHttp]
  );

  const openConfig = useCallback(() => {
    if (isCode) {
      const meta = cell.metadata as CodeCellMetadata;
      const timeoutValue =
        typeof meta?.timeoutMs === "number" ? String(meta.timeoutMs) : "";
      setTimeoutDraft(timeoutValue);
    } else {
      setTimeoutDraft("");
    }

    if (isCode || isMarkdown) {
      const meta = (cell.metadata as
        | CodeCellMetadata
        | MarkdownCellMetadata) ?? { editor: undefined };
      const editorMeta = (meta.editor ?? {}) as MonacoEditorSettings;
      const editorFontSizeValue =
        typeof editorMeta.fontSize === "number"
          ? String(editorMeta.fontSize)
          : "";
      setEditorFontSizeDraft(editorFontSizeValue);
      setEditorFontSizeSelection(
        fontSizeSelectionForValue(editorFontSizeValue)
      );
      setEditorWordWrapDraft(editorMeta.wordWrap ?? "default");
      setEditorLineNumbersDraft(editorMeta.lineNumbers ?? "default");
      setEditorMinimapDraft(
        typeof editorMeta.minimap === "boolean"
          ? editorMeta.minimap
            ? "show"
            : "hide"
          : "default"
      );
    } else {
      setEditorFontSizeDraft("");
      setEditorFontSizeSelection("default");
      setEditorWordWrapDraft("default");
      setEditorLineNumbersDraft("default");
      setEditorMinimapDraft("default");
    }

    if (isTerminal) {
      const meta = cell.metadata as TerminalCellMetadata;
      const terminalMeta = (meta.terminal ?? {}) as TerminalPreferences;
      const terminalFontSizeValue =
        typeof terminalMeta.fontSize === "number"
          ? String(terminalMeta.fontSize)
          : "";
      setTerminalFontSizeDraft(terminalFontSizeValue);
      setTerminalFontSizeSelection(
        fontSizeSelectionForValue(terminalFontSizeValue)
      );
      setTerminalCursorBlinkDraft(
        typeof terminalMeta.cursorBlink === "boolean"
          ? terminalMeta.cursorBlink
            ? "on"
            : "off"
          : "default"
      );
      setTerminalCursorStyleDraft(terminalMeta.cursorStyle ?? "default");
    } else {
      setTerminalFontSizeDraft("");
      setTerminalFontSizeSelection("default");
      setTerminalCursorBlinkDraft("default");
      setTerminalCursorStyleDraft("default");
    }

    setTimeoutError(null);
    setEditorError(null);
    setTerminalError(null);
    setShowConfig(true);
  }, [cell, isCode, isMarkdown, isTerminal]);

  const handleConfigClose = useCallback(() => {
    setShowConfig(false);
    setTimeoutError(null);
    setEditorError(null);
    setTerminalError(null);
  }, []);

  const handleConfigSave = useCallback(() => {
    setTimeoutError(null);
    setEditorError(null);
    setTerminalError(null);

    let timeoutValue: number | null | undefined;
    if (isCode) {
      const raw = timeoutDraft.trim();
      if (raw.length === 0) {
        timeoutValue = null;
      } else {
        const parsed = Number.parseInt(raw, 10);
        if (!Number.isFinite(parsed)) {
          setTimeoutError("Enter a valid number in milliseconds.");
          return;
        }
        if (parsed < 1000 || parsed > 600_000) {
          setTimeoutError(
            "Choose a value between 1,000 and 600,000 milliseconds."
          );
          return;
        }
        timeoutValue = parsed;
      }
    }

    let editorSettings: MonacoEditorSettings | undefined;
    if (isCode || isMarkdown) {
      const defaults = isCode
        ? DEFAULT_CODE_EDITOR_SETTINGS
        : DEFAULT_MARKDOWN_EDITOR_SETTINGS;
      const settings: MonacoEditorSettings = {};
      let hasValue = false;

      const rawFont = editorFontSizeDraft.trim();
      if (rawFont.length > 0) {
        const parsed = Number.parseInt(rawFont, 10);
        if (!Number.isFinite(parsed)) {
          setEditorError("Enter a whole number for editor font size.");
          return;
        }
        if (parsed < 8 || parsed > 72) {
          setEditorError("Choose a font size between 8 and 72.");
          return;
        }
        if (parsed !== defaults.fontSize) {
          settings.fontSize = parsed;
          hasValue = true;
        }
      }

      const wordWrap =
        editorWordWrapDraft === "default" ? undefined : editorWordWrapDraft;
      if (wordWrap && wordWrap !== defaults.wordWrap) {
        settings.wordWrap = wordWrap;
        hasValue = true;
      }

      const lineNumbers =
        editorLineNumbersDraft === "default"
          ? undefined
          : editorLineNumbersDraft;
      if (lineNumbers && lineNumbers !== defaults.lineNumbers) {
        settings.lineNumbers = lineNumbers;
        hasValue = true;
      }

      if (editorMinimapDraft === "show") {
        if (defaults.minimap !== true) {
          settings.minimap = true;
          hasValue = true;
        } else {
          settings.minimap = true;
          hasValue = true;
        }
      } else if (editorMinimapDraft === "hide") {
        if (defaults.minimap !== false) {
          settings.minimap = false;
          hasValue = true;
        } else {
          settings.minimap = false;
          hasValue = true;
        }
      }

      editorSettings = hasValue ? settings : undefined;
    }

    let terminalSettings: TerminalPreferences | undefined;
    if (isTerminal) {
      const defaults = DEFAULT_TERMINAL_PREFERENCES;
      const settings: TerminalPreferences = {};
      let hasValue = false;

      const rawFont = terminalFontSizeDraft.trim();
      if (rawFont.length > 0) {
        const parsed = Number.parseInt(rawFont, 10);
        if (!Number.isFinite(parsed)) {
          setTerminalError("Enter a whole number for terminal font size.");
          return;
        }
        if (parsed < 8 || parsed > 72) {
          setTerminalError("Choose a font size between 8 and 72.");
          return;
        }
        if (parsed !== defaults.fontSize) {
          settings.fontSize = parsed;
          hasValue = true;
        }
      }

      if (terminalCursorBlinkDraft !== "default") {
        const blinkValue = terminalCursorBlinkDraft === "on";
        if (blinkValue !== defaults.cursorBlink) {
          settings.cursorBlink = blinkValue;
          hasValue = true;
        }
      }

      if (terminalCursorStyleDraft !== "default") {
        if (terminalCursorStyleDraft !== defaults.cursorStyle) {
          settings.cursorStyle = terminalCursorStyleDraft;
          hasValue = true;
        }
      }

      terminalSettings = hasValue ? settings : undefined;
    }

    const mergeEditorSettings = (
      previous: MonacoEditorSettings | undefined,
      next: MonacoEditorSettings | undefined
    ): MonacoEditorSettings | undefined => {
      const merged: MonacoEditorSettings = { ...(previous ?? {}) };

      if (typeof next?.fontSize === "undefined") {
        delete merged.fontSize;
      } else {
        merged.fontSize = next.fontSize;
      }

      if (typeof next?.wordWrap === "undefined") {
        delete merged.wordWrap;
      } else {
        merged.wordWrap = next.wordWrap;
      }

      if (typeof next?.lineNumbers === "undefined") {
        delete merged.lineNumbers;
      } else {
        merged.lineNumbers = next.lineNumbers;
      }

      if (typeof next?.minimap === "undefined") {
        delete merged.minimap;
      } else {
        merged.minimap = next.minimap;
      }

      return Object.keys(merged).length > 0 ? merged : undefined;
    };

    const mergeTerminalSettings = (
      previous: TerminalPreferences | undefined,
      next: TerminalPreferences | undefined
    ): TerminalPreferences | undefined => {
      const merged: TerminalPreferences = { ...(previous ?? {}) };

      if (typeof next?.fontSize === "undefined") {
        delete merged.fontSize;
      } else {
        merged.fontSize = next.fontSize;
      }

      if (typeof next?.cursorBlink === "undefined") {
        delete merged.cursorBlink;
      } else {
        merged.cursorBlink = next.cursorBlink;
      }

      if (typeof next?.cursorStyle === "undefined") {
        delete merged.cursorStyle;
      } else {
        merged.cursorStyle = next.cursorStyle;
      }

      return Object.keys(merged).length > 0 ? merged : undefined;
    };

    onChange(
      (current) => {
        if (current.id !== cell.id) {
          return current;
        }
        if (current.type === "code" && isCode) {
          const meta = {
            ...(current.metadata ?? {}),
          } as CodeCellMetadata;
          if (timeoutValue === null) {
            delete meta.timeoutMs;
          } else if (typeof timeoutValue === "number") {
            meta.timeoutMs = timeoutValue;
          }
          const previousEditor = (current.metadata as CodeCellMetadata).editor;
          const mergedEditor = mergeEditorSettings(
            previousEditor,
            editorSettings
          );
          if (mergedEditor) {
            meta.editor = mergedEditor;
          } else {
            delete meta.editor;
          }
          return { ...current, metadata: meta };
        }
        if (current.type === "markdown" && isMarkdown) {
          const meta = {
            ...(current.metadata ?? {}),
          } as MarkdownCellMetadata;
          const previousEditor = (current.metadata as MarkdownCellMetadata)
            .editor;
          const mergedEditor = mergeEditorSettings(
            previousEditor,
            editorSettings
          );
          if (mergedEditor) {
            meta.editor = mergedEditor;
          } else {
            delete meta.editor;
          }
          return { ...current, metadata: meta };
        }
        if (current.type === "terminal" && isTerminal) {
          const meta = {
            ...(current.metadata ?? {}),
          } as TerminalCellMetadata;
          const previousTerminal = (current.metadata as TerminalCellMetadata)
            .terminal;
          const mergedTerminal = mergeTerminalSettings(
            previousTerminal,
            terminalSettings
          );
          if (mergedTerminal) {
            meta.terminal = mergedTerminal;
          } else {
            delete meta.terminal;
          }
          return { ...current, metadata: meta };
        }
        return current;
      },
      { persist: true }
    );

    handleConfigClose();
  }, [
    cell.id,
    editorFontSizeDraft,
    editorLineNumbersDraft,
    editorMinimapDraft,
    editorWordWrapDraft,
    handleConfigClose,
    isCode,
    isMarkdown,
    isTerminal,
    onChange,
    terminalCursorBlinkDraft,
    terminalCursorStyleDraft,
    terminalFontSizeDraft,
    timeoutDraft,
  ]);
  type MarkdownUIMeta = { ui?: { edit?: boolean } };
  const mdEditing =
    cell.type === "markdown" &&
    ((cell.metadata as MarkdownUIMeta).ui?.edit ?? true);
  const editorDefaults = isCode
    ? DEFAULT_CODE_EDITOR_SETTINGS
    : DEFAULT_MARKDOWN_EDITOR_SETTINGS;
  const minimapDefaultLabel = editorDefaults.minimap ? "shown" : "hidden";
  const terminalDefaultStyle = DEFAULT_TERMINAL_PREFERENCES.cursorStyle;
  const terminalDefaultStyleLabel =
    terminalDefaultStyle.charAt(0).toUpperCase() +
    terminalDefaultStyle.slice(1);

  const updateCellSource = useCallback(
    (nextSource: string, options?: { persist?: boolean; touch?: boolean }) => {
      onChange((current) => {
        if (current.id !== cell.id || current.type !== cell.type) {
          return current;
        }
        if (current.type === "terminal") {
          return { ...current, buffer: nextSource };
        }
        return { ...current, source: nextSource };
      }, options);
    },
    [cell.id, cell.type, onChange]
  );

  const handleAiDialogChange = useCallback(
    (open: boolean) => {
      if (!aiEnabled) {
        setAiOpen(false);
        setAiError(null);
        if (!aiGenerating) {
          setAiPrompt("");
        }
        aiCloseIntentRef.current = null;
        return;
      }
      if (!open) {
        const autoClose = aiCloseIntentRef.current === "auto";
        aiCloseIntentRef.current = null;
        if (aiGenerating && !autoClose) {
          try {
            aiControllerRef.current?.abort();
          } catch {
            /* noop */
          }
        }
        setAiOpen(false);
        if (!aiGenerating || !autoClose) {
          setAiError(null);
        }
        if (!aiGenerating) {
          setAiPrompt("");
        }
        return;
      }
      aiCloseIntentRef.current = null;
      setAiOpen(true);
    },
    [aiEnabled, aiGenerating]
  );

  const handleAiAbort = useCallback(() => {
    if (!aiGenerating) {
      return;
    }
    try {
      aiControllerRef.current?.abort();
    } catch {
      /* noop */
    }
  }, [aiGenerating]);

  const handleAiGenerate = useCallback(async () => {
    if (aiGenerating) {
      return;
    }
    if (!aiEnabled) {
      return;
    }
    const trimmed = aiPrompt.trim();
    if (trimmed.length === 0) {
      setAiError("Enter a prompt before generating.");
      return;
    }

    onActivate();
    setAiGenerating(true);
    setAiError(null);
    aiCloseIntentRef.current = "auto";
    setAiOpen(false);

    const originalSource = cellContent;
    const controller = new AbortController();
    aiControllerRef.current = controller;

    const payload: Record<string, unknown> = {
      cellType: cell.type,
      prompt: trimmed,
      context: originalSource,
    };
    if (cell.type === "code" && codeLanguage) {
      payload.language = codeLanguage;
    }
    if (cell.type === "code") {
      const envDependencies = Object.entries(dependencies ?? {})
        .filter(
          ([name, version]) =>
            name.trim().length > 0 && version.trim().length > 0
        )
        .reduce<Record<string, string>>((acc, [name, version]) => {
          acc[name] = version;
          return acc;
        }, {});
      payload.dependencies = envDependencies;
    }

    const prefix =
      originalSource.length > 0
        ? originalSource + (originalSource.endsWith("\n") ? "" : "\n\n")
        : "";
    try {
      const response = await fetch(`${API_BASE_URL}/ai/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) {
        let message: string | null = null;
        if (response.status === 403) {
          message = "AI assistant is disabled in settings.";
        } else {
          try {
            const data = await response.json();
            message = typeof data?.error === "string" ? data.error : null;
          } catch {
            message = null;
          }
        }
        throw new Error(
          message ?? `Request failed with status ${response.status}`
        );
      }
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("This browser does not support streaming responses.");
      }
      const decoder = new TextDecoder();
      let generated = prefix;
      let appended = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          if (chunk.length > 0) {
            generated += chunk;
            appended = true;
            updateCellSource(generated, { touch: true });
          }
        }
      }
      updateCellSource(appended ? generated : originalSource, {
        persist: true,
      });
      setAiPrompt("");
      setAiOpen(false);
    } catch (error) {
      updateCellSource(originalSource, { touch: true });
      if ((error as DOMException)?.name === "AbortError") {
        setAiError("Generation cancelled.");
      } else {
        setAiError(
          error instanceof Error ? error.message : "Unable to generate content."
        );
      }
      if (aiEnabled) {
        aiCloseIntentRef.current = null;
        setAiOpen(true);
      }
    } finally {
      aiControllerRef.current = null;
      setAiGenerating(false);
      aiCloseIntentRef.current = null;
    }
  }, [
    aiEnabled,
    aiGenerating,
    aiPrompt,
    codeLanguage,
    cellContent,
    cell.type,
    dependencies,
    onActivate,
    updateCellSource,
  ]);

  const handleCopyCurl = useCallback(async () => {
    if (!httpCurl) {
      return;
    }
    try {
      await copyTextToClipboard(httpCurl);
      setCurlCopied(true);
      if (curlCopyTimerRef.current) {
        clearTimeout(curlCopyTimerRef.current);
      }
      curlCopyTimerRef.current = setTimeout(() => {
        setCurlCopied(false);
        curlCopyTimerRef.current = null;
      }, 2000);
    } catch {
      setCurlCopied(false);
    }
  }, [httpCurl]);

  const handleConvertHttpToCode = useCallback(() => {
    if (cell.type !== "http") {
      return;
    }
    const snippet = buildHttpCodeSnippet(cell as HttpCellType);
    onCloneHttpToCode(cell.id, snippet);
  }, [cell, onCloneHttpToCode]);

  const handleConvertSqlToCode = useCallback(() => {
    if (cell.type !== "sql") {
      return;
    }
    const snippet = buildSqlCodeSnippet(
      cell as SqlCellType,
      sqlConnections,
      variables
    );
    onCloneSqlToCode(cell.id, snippet);
  }, [cell, onCloneSqlToCode, sqlConnections, variables]);

  const stopToolbarPropagation = useCallback((event: SyntheticEvent) => {
    event.stopPropagation();
  }, []);

  const stopToolbarFocus = useCallback((event: FocusEvent<HTMLElement>) => {
    event.stopPropagation();
  }, []);

  const actionButtons = (
    <>
      {showAiActions &&
        (aiGenerating ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleAiAbort}
            aria-label="Cancel AI generation"
            title="Cancel AI generation"
            className="text-emerald-400 hover:text-emerald-300"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setAiPrompt("");
              setAiError(null);
              aiCloseIntentRef.current = null;
              setAiOpen(true);
              onActivate();
            }}
            aria-label="Generate with AI"
            title="Generate with AI"
          >
            <Sparkles className="h-4 w-4" />
          </Button>
        ))}
      {isCode ? (
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRun}
            disabled={isReadOnly || isRunning || aiGenerating || !canRun}
            aria-label="Run cell"
            title="Run cell (Shift+Enter)"
          >
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          {isRunning && !isReadOnly && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onInterrupt}
              aria-label="Abort cell"
              title="Abort cell"
              className="text-rose-600 hover:text-rose-600"
            >
              <XCircle className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              onChange((current) =>
                current.type === "code"
                  ? { ...current, outputs: [], execution: undefined }
                  : current
              )
            }
            aria-label="Clear outputs"
            title="Clear outputs"
            disabled={isReadOnly}
          >
            <Eraser className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={openConfig}
            aria-label="Configure cell"
            title="Cell settings"
            disabled={isReadOnly}
          >
            <SettingsIcon className="h-4 w-4" />
          </Button>
        </>
      ) : isCommand ? (
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRun}
            disabled={isReadOnly || !canRun}
            aria-label="Run command"
            title="Run command"
          >
            <Play className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={openConfig}
            aria-label="Configure cell"
            title="Cell settings"
            disabled={isReadOnly}
          >
            <SettingsIcon className="h-4 w-4" />
          </Button>
        </>
      ) : isSql ? (
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRun}
            disabled={isReadOnly || !canRun || isRunning}
            aria-label="Run SQL query"
            title="Run SQL query (Shift+Enter)"
          >
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleConvertSqlToCode}
            aria-label="Convert to code cell"
            title="Convert to code cell"
            disabled={isReadOnly}
          >
            <Code className="h-4 w-4" />
          </Button>
        </>
      ) : isHttp ? (
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRun}
            disabled={isReadOnly || !canRun || isRunning}
            aria-label="Send request"
            title="Send request (Shift+Enter)"
          >
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCopyCurl}
            aria-label="Copy cURL"
            title="Copy cURL"
            disabled={!httpCurl}
          >
            {curlCopied ? (
              <Check className="h-4 w-4 text-emerald-400" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleConvertHttpToCode}
            aria-label="Convert to code cell"
            title="Convert to code cell"
            disabled={isReadOnly}
          >
            <Code className="h-4 w-4" />
          </Button>
        </>
      ) : isAi ? (
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRun}
            disabled={
              isReadOnly ||
              isRunning ||
              !canRun ||
              !aiEnabled ||
              (cell.prompt ?? "").trim().length === 0
            }
            aria-label="Run AI cell"
            title="Run AI cell (Shift+Enter)"
          >
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
          </Button>
          {isRunning && !isReadOnly && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onInterrupt}
              aria-label="Abort AI cell"
              title="Abort AI cell"
              className="text-rose-600 hover:text-rose-600"
            >
              <XCircle className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              onChange(
                (current) =>
                  current.type === "ai"
                    ? { ...current, response: undefined }
                    : current,
                { persist: true }
              )
            }
            aria-label="Clear response"
            title="Clear response"
            disabled={isReadOnly || !cell.response}
          >
            <Eraser className="h-4 w-4" />
          </Button>
        </>
      ) : isPlot ? (
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRun}
            disabled={isReadOnly || !canRun || isRunning}
            aria-label="Run plot"
            title="Generate plot data"
          >
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
        </>
      ) : isMarkdown ? (
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              onChange(
                (current) => {
                  if (current.type !== "markdown") return current;
                  type U = { ui?: { edit?: boolean } };
                  const ui = (current.metadata as U).ui ?? {};
                  return {
                    ...current,
                    metadata: {
                      ...current.metadata,
                      ui: { ...ui, edit: !ui.edit },
                    },
                  } as NotebookCell;
                },
                mdEditing ? { persist: true } : undefined
              )
            }
            aria-label="Toggle edit markdown"
            title="Toggle edit markdown"
            disabled={isReadOnly}
          >
            {mdEditing ? (
              <Check className="h-4 w-4" />
            ) : (
              <Pencil className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={openConfig}
            aria-label="Configure cell"
            title="Cell settings"
            disabled={isReadOnly}
          >
            <SettingsIcon className="h-4 w-4" />
          </Button>
        </>
      ) : isTerminal ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={openConfig}
          aria-label="Configure cell"
          title="Cell settings"
          disabled={isReadOnly}
        >
          <SettingsIcon className="h-4 w-4" />
        </Button>
      ) : null}
      {canMoveUp && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onMove("up")}
          aria-label="Move cell up"
          title="Move cell up"
          disabled={isReadOnly}
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      )}
      {canMoveDown && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onMove("down")}
          aria-label="Move cell down"
          title="Move cell down"
          disabled={isReadOnly}
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="text-rose-600 hover:text-rose-600"
        onClick={onDelete}
        aria-label="Delete cell"
        title="Delete cell"
        disabled={isReadOnly}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </>
  );

  return (
    <article
      id={`cell-${cell.id}`}
      className={clsx(
        "group/cell relative z-0 rounded-xl transition hover:z-40 focus-within:z-50",
        "border-l-2 border-transparent hover:border-emerald-300/80"
      )}
      onMouseDown={onActivate}
      onFocus={onActivate}
      tabIndex={-1}
    >
      <Dialog open={aiEnabled && aiOpen} onOpenChange={handleAiDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>AI assistant</DialogTitle>
            <DialogDescription>
              Describe what you would like this {isCode ? "code" : "markdown"}{" "}
              cell to contain.
            </DialogDescription>
          </DialogHeader>
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void handleAiGenerate();
            }}
          >
            <label className="block text-xs font-medium text-muted-foreground">
              Prompt
              <textarea
                value={aiPrompt}
                onChange={(event) => setAiPrompt(event.target.value)}
                rows={4}
                className="mt-1 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder={
                  isCode
                    ? "Generate a utility that fetches JSON and renders it with UiComponents"
                    : "Write a summary with a table and a mermaid diagram"
                }
                disabled={aiGenerating}
                required
              />
            </label>
            {aiError ? (
              <p className="text-xs font-medium text-rose-600">{aiError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                The assistant streams output directly into the cell.
              </p>
            )}
            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (aiGenerating) {
                    handleAiAbort();
                  } else {
                    aiCloseIntentRef.current = null;
                    setAiOpen(false);
                    setAiPrompt("");
                    setAiError(null);
                  }
                }}
              >
                {aiGenerating ? "Stop" : "Cancel"}
              </Button>
              <Button
                type="submit"
                disabled={aiGenerating || aiPrompt.trim().length === 0}
              >
                {aiGenerating ? "Generating…" : "Generate"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {cell.type === "code" ? (
        <CodeCellView
          editorKey={editorKey}
          path={editorPath}
          cell={cell}
          onChange={onChange}
          onRun={onRun}
          isRunning={isRunning}
          queued={queued}
          isGenerating={aiGenerating}
          readOnly={readOnly}
          onUiInteraction={handleUiInteraction}
        />
      ) : cell.type === "markdown" ? (
        <MarkdownCellView
          editorKey={editorKey}
          path={editorPath}
          cell={cell}
          notebookId={notebookId}
          onChange={onChange}
          onAttachmentUploaded={onAttachmentUploaded}
          readOnly={readOnly}
        />
      ) : cell.type === "command" ? (
        <CommandCellView
          cell={cell}
          onChange={onChange}
          onRun={onRun}
          readOnly={readOnly}
        />
      ) : cell.type === "http" ? (
        <HttpCellView
          cell={cell}
          onChange={onChange}
          variables={httpVariables}
          isRunning={isRunning}
          readOnly={readOnly}
          onRun={onRun}
        />
      ) : cell.type === "ai" ? (
        <AiCellView
          cell={cell}
          onChange={onChange}
          onRun={onRun}
          isRunning={isRunning}
          readOnly={readOnly}
          aiEnabled={aiEnabled}
        />
      ) : cell.type === "plot" ? (
        <PlotCellView
          cell={cell as PlotCellType}
          globals={globals ?? {}}
          onChange={onChange}
          onRun={onRun}
          isRunning={isRunning}
          readOnly={readOnly}
          canRun={canRun}
        />
      ) : cell.type === "sql" ? (
        <SqlCellView
          cell={cell}
          connections={sqlConnections}
          onChange={onChange}
          onRun={onRun}
          isRunning={isRunning}
          readOnly={readOnly}
          onRequestAddConnection={onRequestAddConnection}
        />
      ) : (
        <TerminalCellView
          cell={cell}
          notebookId={notebookId}
          onChange={onChange}
          pendingPersist={pendingTerminalPersist}
          readOnly={readOnly}
        />
      )}

      {/* Collapse the inline controls when idle so they don't add gap */}
      <div className="pointer-events-none mb-2 mt-2 flex max-h-0 w-full justify-center overflow-hidden opacity-0 transition-all duration-200 group-hover/cell:max-h-24 group-hover/cell:opacity-100 group-hover/cell:pointer-events-auto group-focus-within/cell:max-h-24 group-focus-within/cell:opacity-100 group-focus-within/cell:pointer-events-auto">
        <div
          className="pointer-events-auto z-50 flex w-full flex-wrap items-center gap-2 rounded-2xl border border-border bg-card/95 px-3 py-2 text-muted-foreground backdrop-blur-sm"
          onMouseDown={stopToolbarPropagation}
          onTouchStart={stopToolbarPropagation}
          onFocusCapture={stopToolbarFocus}
        >
          <div className="flex flex-1 flex-wrap items-center gap-1 [&>button]:h-10 [&>button]:w-10 [&>button]:rounded-xl">
            {actionButtons}
          </div>
          <AddCellMenu
            onAdd={onAddBelow}
            className="ml-auto flex flex-wrap items-center gap-1 text-[11px] [&>button]:h-8 [&>button]:w-auto [&>button]:rounded-lg sm:border-l sm:border-border/60 sm:pl-2 sm:[&>button]:min-w-[6.5rem]"
            disabled={readOnly}
            terminalCellsEnabled={terminalCellsEnabled}
            aiEnabled={aiEnabled}
          />
        </div>
      </div>
      <Dialog
        open={showConfig}
        onOpenChange={(open) => (!open ? handleConfigClose() : undefined)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isCode
                ? "Code cell settings"
                : isMarkdown
                  ? "Markdown cell settings"
                  : isCommand
                    ? "Command cell settings"
                    : "Terminal cell settings"}
            </DialogTitle>
            <DialogDescription>
              {isTerminal
                ? "Tune terminal preferences for this terminal cell."
                : isCode
                  ? "Adjust execution options and editor preferences for this code cell."
                  : isCommand
                    ? "Keep notes about when to run this command and how collaborators should use it."
                    : "Adjust editor preferences for this cell."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="mt-2 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              handleConfigSave();
            }}
          >
            <div className="space-y-4">
              {isCode ? (
                <section className="space-y-2">
                  <h4 className="text-sm font-semibold text-foreground">
                    Execution
                  </h4>
                  <label className="block text-xs font-medium text-muted-foreground">
                    Timeout (ms)
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1000}
                      max={600000}
                      step={500}
                      value={timeoutDraft}
                      onChange={(event) => {
                        setTimeoutDraft(event.target.value);
                        setTimeoutError(null);
                      }}
                      placeholder="Use default"
                      className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-[13px] text-foreground focus:outline-none"
                    />
                  </label>
                  {timeoutError ? (
                    <p className="text-xs font-medium text-rose-600 dark:text-rose-300">
                      {timeoutError}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Leave empty to use the workspace kernel timeout.
                    </p>
                  )}
                </section>
              ) : null}

              {(isCode || isMarkdown) && (
                <section className="space-y-2">
                  <h4 className="text-sm font-semibold text-foreground">
                    Editor
                  </h4>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-medium text-muted-foreground">
                      Font size
                      <div className="mt-1 space-y-2">
                        <select
                          className="w-full rounded-md border border-input bg-background px-2 py-1 text-[13px] text-foreground focus:outline-none"
                          value={editorFontSizeSelection}
                          onChange={(event) => {
                            const next = event.target
                              .value as FontSizeSelection;
                            setEditorFontSizeSelection(next);
                            setEditorError(null);
                            if (next === "default") {
                              setEditorFontSizeDraft("");
                              return;
                            }
                            if (next === "custom") {
                              const trimmed = editorFontSizeDraft.trim();
                              if (
                                trimmed.length === 0 ||
                                FONT_SIZE_PRESET_STRINGS.has(trimmed)
                              ) {
                                setEditorFontSizeDraft("");
                              } else {
                                setEditorFontSizeDraft(trimmed);
                              }
                              return;
                            }
                            setEditorFontSizeDraft(next);
                          }}
                        >
                          <option value="default">
                            Default ({editorDefaults.fontSize})
                          </option>
                          {FONT_SIZE_PRESETS.map((size) => (
                            <option key={size} value={String(size)}>
                              {size}
                            </option>
                          ))}
                          <option value="custom">Custom</option>
                        </select>
                        {editorFontSizeSelection === "custom" ? (
                          <input
                            type="number"
                            inputMode="numeric"
                            min={8}
                            max={72}
                            value={editorFontSizeDraft}
                            onChange={(event) => {
                              setEditorFontSizeSelection("custom");
                              setEditorFontSizeDraft(event.target.value);
                              setEditorError(null);
                            }}
                            placeholder="Enter a size"
                            className="w-full rounded-md border border-input bg-background px-2 py-1 text-[13px] text-foreground focus:outline-none"
                          />
                        ) : null}
                      </div>
                    </label>
                    <label className="block text-xs font-medium text-muted-foreground">
                      Word wrap
                      <select
                        className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-[13px] text-foreground focus:outline-none"
                        value={editorWordWrapDraft}
                        onChange={(event) =>
                          setEditorWordWrapDraft(
                            event.target.value as typeof editorWordWrapDraft
                          )
                        }
                      >
                        <option value="default">
                          Default (
                          {editorDefaults.wordWrap === "on" ? "on" : "off"})
                        </option>
                        <option value="on">On</option>
                        <option value="off">Off</option>
                      </select>
                    </label>
                    <label className="block text-xs font-medium text-muted-foreground">
                      Line numbers
                      <select
                        className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-[13px] text-foreground focus:outline-none"
                        value={editorLineNumbersDraft}
                        onChange={(event) =>
                          setEditorLineNumbersDraft(
                            event.target.value as typeof editorLineNumbersDraft
                          )
                        }
                      >
                        <option value="default">
                          Default (
                          {editorDefaults.lineNumbers === "on" ? "on" : "off"})
                        </option>
                        <option value="on">On</option>
                        <option value="off">Off</option>
                      </select>
                    </label>
                    <label className="block text-xs font-medium text-muted-foreground">
                      Minimap
                      <select
                        className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-[13px] text-foreground focus:outline-none"
                        value={editorMinimapDraft}
                        onChange={(event) =>
                          setEditorMinimapDraft(
                            event.target.value as typeof editorMinimapDraft
                          )
                        }
                      >
                        <option value="default">
                          Default ({minimapDefaultLabel})
                        </option>
                        <option value="show">Show</option>
                        <option value="hide">Hide</option>
                      </select>
                    </label>
                  </div>
                  {editorError ? (
                    <p className="text-xs font-medium text-rose-600 dark:text-rose-300">
                      {editorError}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Leave fields blank to use workspace defaults.
                    </p>
                  )}
                </section>
              )}

              {isTerminal ? (
                <section className="space-y-2">
                  <h4 className="text-sm font-semibold text-foreground">
                    Terminal
                  </h4>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-medium text-muted-foreground">
                      Font size
                      <div className="mt-1 space-y-2">
                        <select
                          className="w-full rounded-md border border-input bg-background px-2 py-1 text-[13px] text-foreground focus:outline-none"
                          value={terminalFontSizeSelection}
                          onChange={(event) => {
                            const next = event.target
                              .value as FontSizeSelection;
                            setTerminalFontSizeSelection(next);
                            setTerminalError(null);
                            if (next === "default") {
                              setTerminalFontSizeDraft("");
                              return;
                            }
                            if (next === "custom") {
                              const trimmed = terminalFontSizeDraft.trim();
                              if (
                                trimmed.length === 0 ||
                                FONT_SIZE_PRESET_STRINGS.has(trimmed)
                              ) {
                                setTerminalFontSizeDraft("");
                              } else {
                                setTerminalFontSizeDraft(trimmed);
                              }
                              return;
                            }
                            setTerminalFontSizeDraft(next);
                          }}
                        >
                          <option value="default">
                            Default ({DEFAULT_TERMINAL_PREFERENCES.fontSize})
                          </option>
                          {FONT_SIZE_PRESETS.map((size) => (
                            <option key={size} value={String(size)}>
                              {size}
                            </option>
                          ))}
                          <option value="custom">Custom</option>
                        </select>
                        {terminalFontSizeSelection === "custom" ? (
                          <input
                            type="number"
                            inputMode="numeric"
                            min={8}
                            max={72}
                            value={terminalFontSizeDraft}
                            onChange={(event) => {
                              setTerminalFontSizeSelection("custom");
                              setTerminalFontSizeDraft(event.target.value);
                              setTerminalError(null);
                            }}
                            placeholder="Enter a size"
                            className="w-full rounded-md border border-input bg-background px-2 py-1 text-[13px] text-foreground focus:outline-none"
                          />
                        ) : null}
                      </div>
                    </label>
                    <label className="block text-xs font-medium text-muted-foreground">
                      Cursor blink
                      <select
                        className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-[13px] text-foreground focus:outline-none"
                        value={terminalCursorBlinkDraft}
                        onChange={(event) =>
                          setTerminalCursorBlinkDraft(
                            event.target
                              .value as typeof terminalCursorBlinkDraft
                          )
                        }
                      >
                        <option value="default">
                          Default (
                          {DEFAULT_TERMINAL_PREFERENCES.cursorBlink
                            ? "on"
                            : "off"}
                          )
                        </option>
                        <option value="on">On</option>
                        <option value="off">Off</option>
                      </select>
                    </label>
                    <label className="block text-xs font-medium text-muted-foreground sm:col-span-2">
                      Cursor style
                      <select
                        className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-[13px] text-foreground focus:outline-none"
                        value={terminalCursorStyleDraft}
                        onChange={(event) =>
                          setTerminalCursorStyleDraft(
                            event.target
                              .value as typeof terminalCursorStyleDraft
                          )
                        }
                      >
                        <option value="default">
                          Default ({terminalDefaultStyleLabel})
                        </option>
                        <option value="block">Block</option>
                        <option value="bar">Bar</option>
                        <option value="underline">Underline</option>
                      </select>
                    </label>
                  </div>
                  {terminalError ? (
                    <p className="text-xs font-medium text-rose-600 dark:text-rose-300">
                      {terminalError}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Leave fields blank to use workspace defaults.
                    </p>
                  )}
                </section>
              ) : null}
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleConfigClose}
              >
                Cancel
              </Button>
              <Button type="submit" variant="default">
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </article>
  );
};

export default CellCard;
