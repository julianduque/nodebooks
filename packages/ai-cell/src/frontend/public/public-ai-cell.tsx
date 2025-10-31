"use client";

import { useMemo } from "react";
import type { ComponentType } from "react";
import type { NotebookCell } from "@nodebooks/notebook-schema";
import type { PublicCellComponentProps } from "@nodebooks/cell-plugin-api";
import { Markdown } from "@nodebooks/ui";
import { User, Sparkles } from "lucide-react";
import type { AiCell } from "../../schema.js";
import {
  Message,
  MessageContent,
  MessageAvatar,
} from "@nodebooks/client-ui/components/ai-elements";

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

type AiCellType = AiCell & NotebookCell;

const PublicAiCell = ({
  cell,
  theme: _theme = "light",
  userAvatarUrl,
  MarkdownComponent = Markdown,
}: PublicCellComponentProps & {
  cell: AiCellType;
  theme?: "light" | "dark";
  MarkdownComponent?: ComponentType<{
    markdown: string;
    themeMode?: "light" | "dark";
  }>;
}) => {
  const hasMessages = Array.isArray(cell.messages) && cell.messages.length > 0;

  const lastMessage = hasMessages
    ? cell.messages[cell.messages.length - 1]
    : null;
  const lastResponse = lastMessage?.role === "assistant" ? cell.response : null;

  const effectiveModel = lastResponse?.model ?? cell.model;
  const usageSummary = useMemo(() => {
    const usage = lastResponse?.usage;
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
  }, [lastResponse?.usage]);

  const formattedTimestamp = useMemo(() => {
    if (!lastResponse?.timestamp) {
      return null;
    }
    const parsed = new Date(lastResponse.timestamp);
    if (Number.isNaN(parsed.getTime())) {
      return lastResponse.timestamp;
    }
    return parsed.toLocaleString();
  }, [lastResponse?.timestamp]);

  if (!hasMessages) {
    return (
      <section id={`cell-${cell.id}`} className="w-full">
        <p className="text-sm text-muted-foreground">
          This AI cell has no content.
        </p>
      </section>
    );
  }

  return (
    <section id={`cell-${cell.id}`} className="w-full space-y-4">
      {cell.messages.map((message, index) => {
        const isLastMessage = index === cell.messages.length - 1;
        const showMetadata =
          isLastMessage &&
          message.role === "assistant" &&
          lastResponse &&
          (effectiveModel ||
            usageSummary ||
            typeof lastResponse.costUsd === "number" ||
            formattedTimestamp);

        return (
          <Message key={index} from={message.role as "user" | "assistant"}>
            <MessageAvatar
              src={
                message.role === "user"
                  ? (userAvatarUrl ?? undefined)
                  : undefined
              }
            >
              {message.role === "user" ? (
                <User className="h-4 w-4" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
            </MessageAvatar>
            <MessageContent>
              <div className="space-y-2">
                {isLastMessage &&
                message.role === "assistant" &&
                lastResponse?.error ? (
                  <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
                    {lastResponse.error}
                  </div>
                ) : (
                  <MarkdownComponent
                    markdown={message.content}
                    themeMode={_theme}
                  />
                )}
                {message.timestamp && (
                  <div className="text-[11px] font-medium text-muted-foreground">
                    {new Date(message.timestamp).toLocaleString()}
                  </div>
                )}
                {showMetadata && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
                    {effectiveModel && (
                      <span className="font-medium text-foreground">
                        {effectiveModel}
                      </span>
                    )}
                    {usageSummary?.map((entry, index) => (
                      <span key={index}>
                        {index > 0 || effectiveModel ? "•" : ""} {entry}
                      </span>
                    ))}
                    {typeof lastResponse.costUsd === "number" && (
                      <>
                        <span>•</span>
                        <span>
                          Cost: {formatCurrency(lastResponse.costUsd)}
                        </span>
                      </>
                    )}
                    {formattedTimestamp && (
                      <>
                        <span>•</span>
                        <span>{formattedTimestamp}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </MessageContent>
          </Message>
        );
      })}
    </section>
  );
};

export default PublicAiCell;
