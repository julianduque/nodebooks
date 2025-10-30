"use client";

import { useCallback, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import type { NotebookCell } from "@nodebooks/notebook-schema";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AlertCallout } from "@nodebooks/ui";
import { renderMarkdownToHtml } from "@/components/notebook/markdown-preview-utils";
import { ChevronDown, ChevronUp, Settings, Sparkles } from "lucide-react";
import { useMermaidRenderer } from "@/components/notebook/hooks/use-mermaid-renderer";
import { useTheme } from "@/components/theme-context";

interface AiCellViewProps {
  cell: Extract<NotebookCell, { type: "ai" }>;
  onChange: (
    updater: (cell: NotebookCell) => NotebookCell,
    options?: { persist?: boolean; touch?: boolean }
  ) => void;
  onRun: () => void;
  isRunning: boolean;
  readOnly?: boolean;
  aiEnabled: boolean;
}

const formatNumber = (value: number): string => {
  return new Intl.NumberFormat("en-US").format(value);
};

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value);
};

const AiCellView = ({
  cell,
  onChange,
  onRun,
  isRunning,
  readOnly = false,
  aiEnabled,
}: AiCellViewProps) => {
  const [showConfig, setShowConfig] = useState(false);
  const { theme } = useTheme();

  const handlePromptChange = useCallback(
    (value: string) => {
      onChange((current) => {
        if (current.id !== cell.id || current.type !== "ai") {
          return current;
        }
        return { ...current, prompt: value };
      });
    },
    [cell.id, onChange]
  );

  const handleSystemChange = useCallback(
    (value: string) => {
      onChange((current) => {
        if (current.id !== cell.id || current.type !== "ai") {
          return current;
        }
        return { ...current, system: value };
      });
    },
    [cell.id, onChange]
  );

  const handleModelChange = useCallback(
    (value: string) => {
      onChange((current) => {
        if (current.id !== cell.id || current.type !== "ai") {
          return current;
        }
        const trimmed = value.trim();
        return { ...current, model: trimmed.length > 0 ? trimmed : undefined };
      });
    },
    [cell.id, onChange]
  );

  const handleParameterChange = useCallback(
    (
      param:
        | "temperature"
        | "maxTokens"
        | "topP"
        | "frequencyPenalty"
        | "presencePenalty"
    ) =>
      (value: string) => {
        onChange((current) => {
          if (current.id !== cell.id || current.type !== "ai") {
            return current;
          }
          const numValue =
            value.trim() === "" ? undefined : Number.parseFloat(value);
          if (numValue !== undefined && !Number.isFinite(numValue)) {
            return current;
          }
          return { ...current, [param]: numValue };
        });
      },
    [cell.id, onChange]
  );

  const handlePromptShortcut = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (
        event.key === "Enter" &&
        event.shiftKey &&
        !readOnly &&
        aiEnabled &&
        !isRunning
      ) {
        event.preventDefault();
        event.stopPropagation();
        const trimmed = (cell.prompt ?? "").trim();
        if (trimmed.length === 0) {
          return;
        }
        onRun();
      }
    },
    [aiEnabled, cell.prompt, isRunning, onRun, readOnly]
  );

  const response = cell.response;
  const hasResponseText = Boolean(response?.text?.trim());
  const prompt = cell.prompt ?? "";
  const hasPrompt = Boolean(prompt.trim());

  const promptHtml = useMemo(() => {
    if (!prompt.trim()) {
      return null;
    }
    return renderMarkdownToHtml(prompt);
  }, [prompt]);

  const responseHtml = useMemo(() => {
    if (!response?.text) {
      return null;
    }
    return renderMarkdownToHtml(response.text);
  }, [response?.text]);

  const promptContainerRef = useMermaidRenderer({
    cellId: `${cell.id}-prompt`,
    html: promptHtml ?? "",
    theme,
  });

  const responseContainerRef = useMermaidRenderer({
    cellId: `${cell.id}-response`,
    html: responseHtml ?? "",
    theme,
  });

  const usageSummary = useMemo(() => {
    const usage = response?.usage;
    if (!usage) {
      return null;
    }
    const entries: string[] = [];
    if (typeof usage.inputTokens === "number") {
      entries.push(`Input: ${formatNumber(usage.inputTokens)}`);
    }
    if (typeof usage.outputTokens === "number") {
      entries.push(`Output: ${formatNumber(usage.outputTokens)}`);
    }
    if (typeof usage.totalTokens === "number") {
      entries.push(`Total: ${formatNumber(usage.totalTokens)}`);
    }
    return entries.length > 0 ? entries : null;
  }, [response?.usage]);

  const effectiveModel = response?.model ?? cell.model;
  const formattedTimestamp = useMemo(() => {
    if (!response?.timestamp) {
      return null;
    }
    const parsed = new Date(response.timestamp);
    if (Number.isNaN(parsed.getTime())) {
      return response.timestamp;
    }
    return parsed.toLocaleString();
  }, [response?.timestamp]);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/60">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge className="bg-emerald-100 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200">
          AI
        </Badge>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowConfig((prev) => !prev)}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-slate-100 dark:hover:bg-slate-800"
            disabled={readOnly}
          >
            <Settings className="h-3 w-3" />
            {showConfig ? (
              <>
                <ChevronUp className="h-3 w-3" />
                Hide
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                Config
              </>
            )}
          </button>
          <span className="text-[12px] text-muted-foreground">
            {aiEnabled
              ? isRunning
                ? "Generating…"
                : "Run with Shift+Enter."
              : "AI is disabled in settings."}
          </span>
        </div>
      </div>

      {!aiEnabled ? (
        <AlertCallout
          level="warn"
          text="AI is disabled for this workspace. Update the workspace settings to run this cell."
          className="text-left"
        />
      ) : null}

      {/* Configuration Panel */}
      {showConfig && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-900/30">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Model Configuration
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground sm:col-span-2">
              System message
              {readOnly ? (
                <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-100">
                  {cell.system || "(using workspace default)"}
                </div>
              ) : (
                <textarea
                  className="min-h-[80px] rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  placeholder="Optional additional guidance for the assistant"
                  value={cell.system ?? ""}
                  onChange={(event) => handleSystemChange(event.target.value)}
                  disabled={readOnly}
                />
              )}
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Model override
              {readOnly ? (
                <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-100">
                  {cell.model ?? "Using workspace default"}
                </div>
              ) : (
                <Input
                  value={cell.model ?? ""}
                  onChange={(event) => handleModelChange(event.target.value)}
                  placeholder="Use workspace default"
                  disabled={readOnly}
                />
              )}
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Temperature (0-2)
              <Input
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={cell.temperature ?? ""}
                onChange={(event) =>
                  handleParameterChange("temperature")(event.target.value)
                }
                placeholder="Default"
                disabled={readOnly}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Max tokens
              <Input
                type="number"
                min="1"
                value={cell.maxTokens ?? ""}
                onChange={(event) =>
                  handleParameterChange("maxTokens")(event.target.value)
                }
                placeholder="Default"
                disabled={readOnly}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Top P (0-1)
              <Input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={cell.topP ?? ""}
                onChange={(event) =>
                  handleParameterChange("topP")(event.target.value)
                }
                placeholder="Default"
                disabled={readOnly}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Frequency penalty (-2 to 2)
              <Input
                type="number"
                min="-2"
                max="2"
                step="0.1"
                value={cell.frequencyPenalty ?? ""}
                onChange={(event) =>
                  handleParameterChange("frequencyPenalty")(event.target.value)
                }
                placeholder="Default"
                disabled={readOnly}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Presence penalty (-2 to 2)
              <Input
                type="number"
                min="-2"
                max="2"
                step="0.1"
                value={cell.presencePenalty ?? ""}
                onChange={(event) =>
                  handleParameterChange("presencePenalty")(event.target.value)
                }
                placeholder="Default"
                disabled={readOnly}
              />
            </label>
          </div>
        </div>
      )}

      {/* ChatGPT-style messages */}
      <div className="space-y-6">
        {/* User Message (Prompt) */}
        {hasPrompt && (
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
            </div>
            <div className="flex-1 space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                User
              </div>
              {readOnly ? (
                <div
                  ref={promptContainerRef}
                  className="markdown-preview space-y-3 text-base leading-7 text-foreground"
                  dangerouslySetInnerHTML={{ __html: promptHtml ?? "" }}
                />
              ) : (
                <textarea
                  className="min-h-[100px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  placeholder="Ask the model for help…"
                  value={prompt}
                  onChange={(event) => handlePromptChange(event.target.value)}
                  onKeyDown={handlePromptShortcut}
                  disabled={readOnly}
                />
              )}
            </div>
          </div>
        )}

        {/* Assistant Response */}
        {(response || isRunning) && (
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                <Sparkles className="h-4 w-4" />
              </div>
            </div>
            <div className="flex-1 space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Assistant
              </div>
              {response?.error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
                  {response.error}
                </div>
              ) : hasResponseText ? (
                <div
                  ref={responseContainerRef}
                  className="markdown-preview space-y-3 text-base leading-7 text-foreground"
                  dangerouslySetInnerHTML={{ __html: responseHtml ?? "" }}
                />
              ) : isRunning ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                  <span>Generating response…</span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  The assistant did not return any content.
                </p>
              )}

              {/* Metadata */}
              {response &&
                !response.error &&
                (effectiveModel ||
                  usageSummary ||
                  typeof response.costUsd === "number" ||
                  formattedTimestamp) && (
                  <div className="mt-4 flex flex-wrap gap-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                    {effectiveModel && (
                      <span>
                        Model:{" "}
                        <span className="font-medium text-foreground">
                          {effectiveModel}
                        </span>
                      </span>
                    )}
                    {usageSummary?.map((entry) => (
                      <span key={entry}>{entry}</span>
                    ))}
                    {typeof response.costUsd === "number" && (
                      <span>Cost: {formatCurrency(response.costUsd)}</span>
                    )}
                    {formattedTimestamp && (
                      <span>Ran at {formattedTimestamp}</span>
                    )}
                  </div>
                )}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!hasPrompt && !response && !isRunning && (
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
            </div>
            <div className="flex-1">
              {readOnly ? (
                <p className="text-sm text-muted-foreground">
                  This AI cell has no content.
                </p>
              ) : (
                <textarea
                  className="min-h-[100px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  placeholder="Ask the model for help…"
                  value={prompt}
                  onChange={(event) => handlePromptChange(event.target.value)}
                  onKeyDown={handlePromptShortcut}
                  disabled={readOnly}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AiCellView;
