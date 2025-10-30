"use client";

import { useCallback, useMemo } from "react";
import type { KeyboardEvent } from "react";
import type { NotebookCell } from "@nodebooks/notebook-schema";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AlertCallout } from "@nodebooks/ui";
import { renderMarkdownToHtml } from "@/components/notebook/markdown-preview-utils";

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
  const previewHtml = useMemo(() => {
    if (!response?.text) {
      return "";
    }
    return renderMarkdownToHtml(response.text);
  }, [response?.text]);

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
        <span className="text-[12px] text-muted-foreground">
          {aiEnabled
            ? isRunning
              ? "Generating…"
              : "Run with Shift+Enter."
            : "AI is disabled in settings."}
        </span>
      </div>
      {!aiEnabled ? (
        <AlertCallout
          level="warning"
          text="AI is disabled for this workspace. Update the workspace settings to run this cell."
          className="text-left"
        />
      ) : null}
      <div className="grid gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Prompt
          {readOnly ? (
            <pre className="whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-100">
              {cell.prompt || "(empty prompt)"}
            </pre>
          ) : (
            <textarea
              className="min-h-[120px] rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              placeholder="Ask the model for help…"
              value={cell.prompt ?? ""}
              onChange={(event) => handlePromptChange(event.target.value)}
              onKeyDown={handlePromptShortcut}
              disabled={readOnly}
            />
          )}
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          System message
          {readOnly ? (
            <pre className="whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-100">
              {cell.system || "(using workspace default)"}
            </pre>
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
        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Model override
          {readOnly ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-100">
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
      </div>
      {response ? (
        <div className="space-y-3">
          {response.error ? (
            <AlertCallout
              level="error"
              text={response.error}
              className="text-left"
            />
          ) : null}
          {hasResponseText ? (
            <div
              className="markdown-preview space-y-3 text-sm leading-7 text-card-foreground"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          ) : null}
          {!hasResponseText && !response.error ? (
            <p className="text-sm text-muted-foreground">
              The assistant did not return any content.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            {effectiveModel ? (
              <span>
                Model: <span className="font-medium text-foreground">{effectiveModel}</span>
              </span>
            ) : null}
            {usageSummary?.map((entry) => (
              <span key={entry}>{entry}</span>
            ))}
            {typeof response?.costUsd === "number" ? (
              <span>Cost: {formatCurrency(response.costUsd)}</span>
            ) : null}
            {formattedTimestamp ? (
              <span>Ran at {formattedTimestamp}</span>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Run this cell to generate a response.
        </p>
      )}
    </div>
  );
};

export default AiCellView;
