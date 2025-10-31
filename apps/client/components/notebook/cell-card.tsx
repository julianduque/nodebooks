"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FocusEvent, SyntheticEvent } from "react";
import { useCompletion } from "@ai-sdk/react";
import { Button } from "@nodebooks/client-ui/components/ui";
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
} from "@nodebooks/client-ui/components/ui";
import {
  isAiCell,
  isCodeCell,
  isCommandCell,
  isHttpCell,
  isMarkdownCell,
  isPlotCell,
  isSqlCell,
  isTerminalCell,
  isUnknownCell,
  type HttpCell,
  type NotebookCell,
  type SqlCell,
  type SqlConnection,
} from "@/types/notebook";
import { clientConfig } from "@nodebooks/config/client";
import CodeCellView from "@/components/notebook/code-cell-view";
import MarkdownCellView from "@/components/notebook/markdown-cell-view";
import { UnknownCell as UnknownCellComponent } from "@/components/notebook/unknown-cell";
import AddCellMenu from "@/components/notebook/add-cell-menu";
import { pluginRegistry } from "@/lib/plugins";
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
import {
  getDiagnosticPolicy,
  setDiagnosticPolicy,
  type DiagnosticPolicy,
} from "@nodebooks/client-ui/components/monaco";
import {
  buildHttpCodeSnippet,
  buildHttpCurlCommand,
  buildHttpExecutionDetails,
  type HttpExecutionDetails,
} from "@nodebooks/http-cell/frontend";
import { buildSqlCodeSnippet } from "@nodebooks/sql-cell/frontend";
import { useTheme } from "@/components/theme-context";
import { SharedMarkdown } from "@/components/notebook/shared-markdown";

const SELECT_FIELD_CLASS =
  "appearance-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm transition focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50";

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
  dependencies?: Record<string, string>;
  variables?: Record<string, string>;
  globals?: Record<string, unknown>;
  pendingTerminalPersist?: boolean;
  readOnly: boolean;
  aiAvailable: boolean;
  sqlConnections: SqlConnection[];
  userEmail?: string;
  userAvatarUrl?: string;
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
type HttpCellType = HttpCell;
type SqlCellType = SqlCell;

const fontSizeSelectionForValue = (value: string): FontSizeSelection => {
  if (value.length === 0) {
    return "default";
  }
  return FONT_SIZE_PRESET_STRINGS.has(value)
    ? (value as FontSizePresetString)
    : "custom";
};

const API_BASE_URL = clientConfig().apiBaseUrl;

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
  active,
  onActivate,
  dependencies,
  variables,
  globals,
  pendingTerminalPersist = false,
  readOnly,
  sqlConnections,
  aiAvailable = true,
  userEmail,
  userAvatarUrl,
  onRequestAddConnection,
  onUiInteraction,
}: CellCardProps) => {
  const { theme } = useTheme();
  const isActive = active;
  const isCode = isCodeCell(cell);
  const isMarkdown = isMarkdownCell(cell);
  const isTerminal = isTerminalCell(cell);
  const isCommand = isCommandCell(cell);
  const isHttp = isHttpCell(cell);
  const isSql = isSqlCell(cell);
  const isPlot = isPlotCell(cell);
  const isAi = isAiCell(cell);
  // Check if AI cell type is enabled via plugin registry
  const aiCellEnabled = pluginRegistry
    .getEnabledCellTypesSync()
    .some((def) => def.type === "ai");
  const showAiActions =
    aiAvailable &&
    aiCellEnabled &&
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
              ? (cell.prompt ?? "")
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
  const [editorTypeCheckingDraft, setEditorTypeCheckingDraft] = useState<
    "off" | "ignore" | "full"
  >("off");
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
  const aiCloseIntentRef = useRef<"auto" | null>(null);
  const [curlCopied, setCurlCopied] = useState(false);
  const curlCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiOriginalSourceRef = useRef<string>("");

  // Use AI SDK useCompletion hook for AI Assistant
  const {
    complete,
    completion,
    isLoading: aiGenerating,
    error: completionError,
    stop: stopCompletion,
  } = useCompletion({
    api: `${API_BASE_URL}/ai/generate`,
    streamProtocol: "text",
    onError: (error) => {
      console.error("[AI Assistant] Error:", error);
    },
  });

  useEffect(() => {
    if (!aiCellEnabled && aiOpen) {
      setAiOpen(false);
      setAiError(null);
      setAiPrompt("");
    }
  }, [aiCellEnabled, aiOpen]);

  // Sync completion error to aiError
  useEffect(() => {
    if (completionError) {
      setAiError(completionError.message || "Failed to generate content.");
    }
  }, [completionError]);

  // Update cell source as completion streams
  useEffect(() => {
    if (completion && aiGenerating) {
      // Use the ref that was captured at the start of generation
      const originalSource = aiOriginalSourceRef.current;
      const prefix =
        originalSource.length > 0
          ? originalSource + (originalSource.endsWith("\n") ? "" : "\n\n")
          : "";
      const generated = prefix + completion;
      onChange((current) => {
        if (current.id !== cell.id) {
          return current;
        }
        if (isCodeCell(current)) {
          return { ...current, source: generated };
        } else if (isMarkdownCell(current)) {
          return { ...current, source: generated };
        }
        return current;
      });
    }
  }, [completion, aiGenerating, cell.id, onChange]);

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
  // Memoize MarkdownComponent for AI cells to prevent infinite re-renders
  const aiMarkdownComponent = useMemo(() => {
    if (!isAi) return undefined;
    return (props: { markdown: string; themeMode?: "light" | "dark" }) => (
      <SharedMarkdown {...props} cellId={cell.id} />
    );
  }, [isAi, cell.id]);

  const httpDetails = useMemo<HttpExecutionDetails | null>(
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
      const policy = getDiagnosticPolicy();
      const mode =
        policy.mode === "ignore-list" ? "ignore" : (policy.mode ?? "off");
      setEditorTypeCheckingDraft(mode);
    } else {
      setTimeoutDraft("");
      setEditorTypeCheckingDraft("off");
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

    let nextDiagnosticPolicy: DiagnosticPolicy | null = null;
    if (isCode) {
      nextDiagnosticPolicy =
        editorTypeCheckingDraft === "off"
          ? { mode: "off" }
          : editorTypeCheckingDraft === "full"
            ? { mode: "full" }
            : { mode: "ignore-list" };
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

    if (nextDiagnosticPolicy) {
      setDiagnosticPolicy(nextDiagnosticPolicy);
    }

    handleConfigClose();
  }, [
    cell.id,
    editorFontSizeDraft,
    editorLineNumbersDraft,
    editorMinimapDraft,
    editorTypeCheckingDraft,
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
    ((cell.metadata as MarkdownUIMeta).ui?.edit ?? false);
  const editorDefaults = isCode
    ? DEFAULT_CODE_EDITOR_SETTINGS
    : DEFAULT_MARKDOWN_EDITOR_SETTINGS;
  const minimapDefaultLabel = editorDefaults.minimap ? "shown" : "hidden";
  const terminalDefaultStyle = DEFAULT_TERMINAL_PREFERENCES.cursorStyle;
  const terminalDefaultStyleLabel =
    terminalDefaultStyle.charAt(0).toUpperCase() +
    terminalDefaultStyle.slice(1);

  const handleAiDialogChange = useCallback(
    (open: boolean) => {
      if (!aiCellEnabled) {
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
          stopCompletion();
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
    [aiCellEnabled, aiGenerating, stopCompletion]
  );

  const handleAiAbort = useCallback(() => {
    if (!aiGenerating) {
      return;
    }
    stopCompletion();
  }, [aiGenerating, stopCompletion]);

  const handleAiGenerate = useCallback(async () => {
    if (aiGenerating) {
      return;
    }
    if (!aiCellEnabled) {
      return;
    }
    const trimmed = aiPrompt.trim();
    if (trimmed.length === 0) {
      setAiError("Enter a prompt before generating.");
      return;
    }

    onActivate();
    setAiError(null);
    aiCloseIntentRef.current = "auto";
    setAiOpen(false);

    const originalSource = String(cellContent ?? "");

    // Capture the original source before generation starts
    aiOriginalSourceRef.current = originalSource;

    // Build body for completion request
    const body: Record<string, unknown> = {
      cellType: cell.type,
      prompt: trimmed,
      context: originalSource,
    };
    if (cell.type === "code" && codeLanguage) {
      body.language = codeLanguage;
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
      body.dependencies = envDependencies;
    }

    try {
      await complete(trimmed, { body });
      setAiPrompt("");
      setAiOpen(false);
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") {
        setAiError("Generation cancelled.");
      } else {
        setAiError(
          error instanceof Error ? error.message : "Unable to generate content."
        );
      }
      if (aiCellEnabled) {
        aiCloseIntentRef.current = null;
        setAiOpen(true);
      }
    }
  }, [
    aiCellEnabled,
    aiGenerating,
    aiPrompt,
    codeLanguage,
    cellContent,
    cell.type,
    dependencies,
    onActivate,
    complete,
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
            className="text-primary hover:text-primary/80"
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
              className="text-destructive hover:text-destructive/90"
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
              <Check className="h-4 w-4 text-primary" />
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
              !aiCellEnabled ||
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
              className="text-destructive hover:text-destructive/90"
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
                    ? { ...current, response: undefined, messages: [] }
                    : current,
                { persist: true }
              )
            }
            aria-label="Clear conversation"
            title="Clear conversation"
            disabled={
              isReadOnly ||
              (!cell.response && (!cell.messages || cell.messages.length === 0))
            }
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
        className="text-destructive hover:text-destructive/90"
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
      data-cell="true"
      data-active={isActive ? "true" : "false"}
      className={clsx(
        "group/cell relative z-0 rounded-xl border-l-2 border-transparent transition focus-within:z-50 focus-within:border-[color:var(--primary)]/70",
        isActive && "z-40 border-[color:var(--primary)]/70"
      )}
      onMouseDown={onActivate}
      onFocus={onActivate}
      tabIndex={-1}
    >
      <Dialog
        open={aiCellEnabled && aiOpen}
        onOpenChange={handleAiDialogChange}
      >
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
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    event.shiftKey &&
                    !aiGenerating
                  ) {
                    event.preventDefault();
                    void handleAiGenerate();
                  }
                }}
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
                The assistant streams output directly into the cell. Press
                Shift+Enter to generate.
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

      {(() => {
        if (isCodeCell(cell)) {
          return (
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
          );
        }
        if (isMarkdownCell(cell)) {
          return (
            <MarkdownCellView
              editorKey={editorKey}
              path={editorPath}
              cell={cell}
              notebookId={notebookId}
              onChange={onChange}
              onAttachmentUploaded={onAttachmentUploaded}
              readOnly={readOnly}
            />
          );
        }
        if (isUnknownCell(cell)) {
          return <UnknownCellComponent cell={cell} />;
        }

        const cellDef = pluginRegistry.getCellType(cell.type);
        const isEnabled = pluginRegistry.isCellTypeEnabledSync(cell.type);

        if (!cellDef || !cellDef.frontend?.Component) {
          return (
            <div className="rounded-lg border border-red-500 bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
              Unknown cell type: {cell.type}. Plugin may not be loaded.
            </div>
          );
        }

        if (!isEnabled) {
          return (
            <div className="rounded-lg border border-yellow-500 bg-yellow-50 p-4 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
              Cell type &quot;{cell.type}&quot; is disabled. Enable the plugin
              in settings to view this cell.
            </div>
          );
        }

        const Component = cellDef.frontend.Component;
        const baseProps = {
          cell,
          onChange,
          notebookId,
          onRun,
          readOnly,
          path: editorPath,
        } satisfies Record<string, unknown>;

        const additionalProps: Record<string, unknown> = {};
        if (isTerminalCell(cell)) {
          additionalProps.pendingPersist = pendingTerminalPersist;
        } else if (isHttpCell(cell)) {
          additionalProps.variables = httpVariables;
          additionalProps.isRunning = isRunning;
        } else if (isSqlCell(cell)) {
          additionalProps.connections = sqlConnections;
          additionalProps.isRunning = isRunning;
          additionalProps.onRequestAddConnection = onRequestAddConnection;
        } else if (isPlotCell(cell)) {
          additionalProps.globals = globals ?? {};
          additionalProps.isRunning = isRunning;
          additionalProps.canRun = canRun;
        } else if (isAiCell(cell)) {
          additionalProps.isRunning = isRunning;
          additionalProps.aiEnabled = aiCellEnabled;
          additionalProps.aiAssistantEnabled = aiAvailable;
          additionalProps.theme = theme;
          additionalProps.userAvatarUrl = userAvatarUrl;
          additionalProps.userEmail = userEmail;
          // Use SharedMarkdown for mermaid diagram support (same as markdown cells)
          if (aiMarkdownComponent) {
            additionalProps.MarkdownComponent = aiMarkdownComponent;
          }
        } else if (isCommandCell(cell)) {
          // no extras
        }

        return <Component {...baseProps} {...additionalProps} />;
      })()}

      {/* Collapse the inline controls when idle so they don't add gap */}
      <div className="pointer-events-none mb-2 mt-2 flex max-h-0 w-full justify-center overflow-hidden opacity-0 transition-all duration-200 group-data-[active=true]/cell:max-h-24 group-data-[active=true]/cell:opacity-100 group-data-[active=true]/cell:pointer-events-auto">
        <div
          className="pointer-events-auto z-50 flex w-full flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-muted/80 px-2 py-1 text-muted-foreground shadow-sm backdrop-blur-sm"
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
                          className={clsx(
                            SELECT_FIELD_CLASS,
                            "w-full px-2 py-1 text-[13px]"
                          )}
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
                        className={clsx(
                          SELECT_FIELD_CLASS,
                          "mt-1 w-full px-2 py-1 text-[13px]"
                        )}
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
                        className={clsx(
                          SELECT_FIELD_CLASS,
                          "mt-1 w-full px-2 py-1 text-[13px]"
                        )}
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
                        className={clsx(
                          SELECT_FIELD_CLASS,
                          "mt-1 w-full px-2 py-1 text-[13px]"
                        )}
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
                    {isCode ? (
                      <label className="block text-xs font-medium text-muted-foreground sm:col-span-2">
                        Type checking
                        <select
                          className={clsx(
                            SELECT_FIELD_CLASS,
                            "mt-1 w-full px-2 py-1 text-[13px]"
                          )}
                          value={editorTypeCheckingDraft}
                          onChange={(event) =>
                            setEditorTypeCheckingDraft(
                              event.target
                                .value as typeof editorTypeCheckingDraft
                            )
                          }
                        >
                          <option value="off">No diagnostics</option>
                          <option value="ignore">Ignore noisy errors</option>
                          <option value="full">Full TypeScript checks</option>
                        </select>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Controls Monaco diagnostics for code editors.
                        </p>
                      </label>
                    ) : null}
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
                          className={clsx(
                            SELECT_FIELD_CLASS,
                            "w-full px-2 py-1 text-[13px]"
                          )}
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
                        className={clsx(
                          SELECT_FIELD_CLASS,
                          "mt-1 w-full px-2 py-1 text-[13px]"
                        )}
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
                        className={clsx(
                          SELECT_FIELD_CLASS,
                          "mt-1 w-full px-2 py-1 text-[13px]"
                        )}
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
