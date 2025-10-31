"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { NotebookCell } from "@nodebooks/notebook-schema";
import { Badge, Input, Textarea } from "@nodebooks/client-ui/components/ui";
import { AlertCallout, Markdown } from "@nodebooks/ui";
import { ChevronDown, ChevronUp, Settings, User, Sparkles } from "lucide-react";
import type { CellComponentProps } from "@nodebooks/cell-plugin-api";
import type { AiCell } from "../schema.js";
import type { ComponentType } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@nodebooks/client-ui/components/ui/collapsible";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  Message,
  MessageContent,
  MessageAvatar,
} from "@nodebooks/client-ui/components/ai-elements";

type AiCellType = AiCell & NotebookCell;

type AiCellViewProps = CellComponentProps & {
  cell: AiCellType;
  isRunning?: boolean;
  readOnly?: boolean;
  aiEnabled?: boolean;
  aiAssistantEnabled?: boolean;
  theme?: "light" | "dark";
  userAvatarUrl?: string;
  userEmail?: string;
  MarkdownComponent?: ComponentType<{
    markdown: string;
    themeMode?: "light" | "dark";
  }>;
};

const formatNumber = (value: number): string => {
  return new Intl.NumberFormat("en-US").format(value);
};

const AiCellView = ({
  cell,
  onChange,
  onRun,
  isRunning = false,
  readOnly = false,
  aiEnabled = true,
  aiAssistantEnabled = true, // Default to true if not provided
  theme: _theme = "light",
  userAvatarUrl,
  userEmail: _userEmail,
  MarkdownComponent = Markdown,
}: AiCellViewProps) => {
  const [showConfig, setShowConfig] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cursorPosition = useRef<{ start: number; end: number } | null>(null);

  // Preserve focus AND cursor position across re-renders (e.g., during auto-save)
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || !cursorPosition.current) return;

    // Restore focus and cursor position after re-render
    if (document.activeElement !== textarea) {
      textarea.focus();
    }

    // Restore cursor position
    textarea.setSelectionRange(
      cursorPosition.current.start,
      cursorPosition.current.end
    );

    // Clear the saved position
    cursorPosition.current = null;
  });

  // Track when user is actively editing to preserve focus during saves
  const handlePromptChangeWithFocus = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const textarea = event.target;
      const value = textarea.value;

      // Save cursor position BEFORE state update triggers re-render
      cursorPosition.current = {
        start: textarea.selectionStart,
        end: textarea.selectionEnd,
      };

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

  const hasConversation =
    Array.isArray(cell.messages) && cell.messages.length > 0;
  const canCollapse = hasConversation && !isRunning;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge className="text-xs font-semibold uppercase tracking-[0.2em] bg-primary text-primary-foreground">
          AI
        </Badge>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowConfig((prev) => !prev)}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
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
          text="AI Cell plugin is disabled. Enable it in workspace settings to use this cell type."
          className="text-left"
        />
      ) : aiEnabled && aiAssistantEnabled === false ? (
        <AlertCallout
          level="warn"
          text="AI Cell plugin is enabled, but the AI assistant feature is disabled in workspace settings. Enable the AI assistant in Settings → AI to run this cell."
          className="text-left"
        />
      ) : null}

      {/* Configuration Panel */}
      {showConfig && (
        <div className="rounded-lg border border-border bg-muted/50 p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Model Configuration
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground sm:col-span-2">
              System message
              {readOnly ? (
                <div className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground">
                  {cell.system || "(using workspace default)"}
                </div>
              ) : (
                <Textarea
                  className="min-h-[80px] text-sm"
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
                <div className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground">
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

      {/* Multi-turn conversation display using ai-elements */}
      <Conversation
        className="w-full"
        style={{
          maxHeight: "400px",
          height:
            (Array.isArray(cell.messages) && cell.messages.length > 0) ||
            (isRunning && prompt)
              ? "400px"
              : "50px",
        }}
      >
        <ConversationContent className="space-y-4 w-full">
          {/* Collapsible history */}
          {Array.isArray(cell.messages) && cell.messages.length > 0 && (
            <Collapsible
              open={!isCollapsed}
              onOpenChange={(open) => setIsCollapsed(!open)}
            >
              {canCollapse && (
                <CollapsibleTrigger className="mb-4 flex w-full items-center gap-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground">
                  {isCollapsed ? (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      <span>
                        Show {cell.messages.length} previous{" "}
                        {cell.messages.length === 1 ? "message" : "messages"}
                      </span>
                    </>
                  ) : (
                    <>
                      <ChevronUp className="h-4 w-4" />
                      <span>Hide conversation</span>
                    </>
                  )}
                </CollapsibleTrigger>
              )}
              <CollapsibleContent>
                <div className="space-y-4">
                  {cell.messages.map((message, index) => (
                    <Message
                      key={index}
                      from={message.role as "user" | "assistant"}
                    >
                      <MessageAvatar
                        src={
                          message.role === "user" ? userAvatarUrl : undefined
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
                          <MarkdownComponent
                            markdown={message.content}
                            themeMode={_theme}
                          />
                          {message.timestamp && (
                            <div className="text-[11px] font-medium text-muted-foreground">
                              {new Date(message.timestamp).toLocaleString()}
                            </div>
                          )}
                        </div>
                      </MessageContent>
                    </Message>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Current user message (shown immediately when running) */}
          {isRunning && prompt && (
            <Message from="user">
              <MessageAvatar src={userAvatarUrl}>
                <User className="h-4 w-4" />
              </MessageAvatar>
              <MessageContent>
                <MarkdownComponent markdown={prompt} themeMode={_theme} />
              </MessageContent>
            </Message>
          )}

          {/* Current streaming response */}
          {isRunning && (
            <Message from="assistant">
              <MessageAvatar src={undefined}>
                <Sparkles className="h-4 w-4" />
              </MessageAvatar>
              <MessageContent>
                {hasResponseText ? (
                  <MarkdownComponent
                    markdown={response?.text ?? ""}
                    themeMode={_theme}
                  />
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="thinking-text">Thinking…</span>
                  </div>
                )}
              </MessageContent>
            </Message>
          )}

          {readOnly &&
            (!Array.isArray(cell.messages) || cell.messages.length === 0) && (
              <p className="text-sm text-muted-foreground">
                This AI cell has no content.
              </p>
            )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Prompt input at footer - always visible */}
      {!readOnly && (
        <div className="flex-shrink-0">
          <Textarea
            ref={textareaRef}
            className="min-h-[100px] rounded-lg text-sm"
            placeholder={
              Array.isArray(cell.messages) && cell.messages.length > 0
                ? "Continue the conversation…"
                : "Ask the model for help…"
            }
            value={prompt}
            onChange={handlePromptChangeWithFocus}
            onKeyDown={handlePromptShortcut}
            disabled={readOnly || isRunning}
          />
        </div>
      )}

      {/* Usage info at footer of cell */}
      {response && !isRunning && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {effectiveModel && (
            <span className="font-medium text-foreground">
              {effectiveModel}
            </span>
          )}
          {response.usage?.inputTokens !== undefined && (
            <>
              <span>•</span>
              <span>{formatNumber(response.usage.inputTokens)} in</span>
            </>
          )}
          {response.usage?.outputTokens !== undefined && (
            <>
              <span>•</span>
              <span>{formatNumber(response.usage.outputTokens)} out</span>
            </>
          )}
          {response.usage?.totalTokens !== undefined && (
            <>
              <span>•</span>
              <span>{formatNumber(response.usage.totalTokens)} total</span>
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

      {/* Error display */}
      {response?.error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {response.error}
        </div>
      )}
    </div>
  );
};

export default AiCellView;
