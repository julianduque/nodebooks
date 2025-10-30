"use client";

import { useMemo } from "react";
import type { NotebookCell } from "@nodebooks/notebook-schema";
import type { ThemeMode } from "@/components/theme-context";
import { renderMarkdownToHtml } from "@/components/notebook/markdown-preview-utils";
import { useMermaidRenderer } from "@/components/notebook/hooks/use-mermaid-renderer";

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

const PublicAiCell = ({
  cell,
  theme,
}: {
  cell: Extract<NotebookCell, { type: "ai" }>;
  theme: ThemeMode;
}) => {
  const prompt = cell.prompt ?? "";
  const response = cell.response;
  const hasResponseText = Boolean(response?.text?.trim());

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

  const effectiveModel = response?.model ?? cell.model;
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
    <section id={`cell-${cell.id}`} className="space-y-6">
      {/* User Message (Prompt) */}
      {promptHtml && (
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
            <div
              ref={promptContainerRef}
              className="markdown-preview space-y-3 text-base leading-7 text-foreground"
              dangerouslySetInnerHTML={{ __html: promptHtml }}
            />
          </div>
        </div>
      )}

      {/* Assistant Response */}
      {response && (
        <div className="flex gap-4">
          <div className="flex-shrink-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
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
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
          </div>
          <div className="flex-1 space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Assistant
            </div>
            {response.error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
                {response.error}
              </div>
            ) : hasResponseText ? (
              <div
                ref={responseContainerRef}
                className="markdown-preview space-y-3 text-base leading-7 text-foreground"
                dangerouslySetInnerHTML={{ __html: responseHtml ?? "" }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                The assistant did not return any content.
              </p>
            )}

            {/* Metadata */}
            {(effectiveModel ||
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
                {formattedTimestamp && <span>Ran at {formattedTimestamp}</span>}
              </div>
            )}
          </div>
        </div>
      )}

      {!promptHtml && !response && (
        <div className="text-sm text-muted-foreground">
          This AI cell has no content.
        </div>
      )}
    </section>
  );
};

export default PublicAiCell;
