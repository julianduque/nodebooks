"use client";

import clsx from "clsx";
import { useCallback, useState } from "react";
import { Button } from "../ui/button";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Eraser,
  Loader2,
  Pencil,
  Play,
  Settings as SettingsIcon,
  Trash2,
  Plus,
  XCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { NotebookCell } from "@nodebooks/notebook-schema";
import CodeCellView from "./code-cell-view";
import MarkdownCellView from "./markdown-cell-view";
import type { AttachmentMetadata } from "@/components/notebook/attachment-utils";

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
  onAddBelow: (type: NotebookCell["type"]) => void;
  onMove: (direction: "up" | "down") => void;
  isRunning: boolean;
  queued?: boolean;
  canRun: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  editorKey: string;
  editorPath?: string;
  active: boolean;
  onActivate: () => void;
}

type CodeCellMetadata = Record<string, unknown> & { timeoutMs?: number };

const AddCellMenu = ({
  onAdd,
  className,
}: {
  onAdd: (type: NotebookCell["type"]) => void;
  className?: string;
}) => {
  return (
    <div
      className={clsx(
        "mt-1 flex items-center gap-1 text-xs text-muted-foreground shadow-sm",
        className
      )}
    >
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2 text-xs gap-1"
        onClick={() => onAdd("markdown")}
      >
        <Plus className="h-4 w-4" />
        Markdown
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2 text-xs gap-1"
        onClick={() => onAdd("code")}
      >
        <Plus className="h-4 w-4" />
        Code
      </Button>
    </div>
  );
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
  isRunning,
  queued,
  canRun,
  canMoveUp,
  canMoveDown,
  editorKey,
  editorPath,
  onActivate,
}: CellCardProps) => {
  const isCode = cell.type === "code";
  const [showConfig, setShowConfig] = useState(false);
  const [timeoutDraft, setTimeoutDraft] = useState("");
  const [timeoutError, setTimeoutError] = useState<string | null>(null);

  const openConfig = useCallback(() => {
    if (!isCode) return;
    const meta = cell.metadata as CodeCellMetadata;
    const timeoutValue =
      typeof meta?.timeoutMs === "number" ? String(meta.timeoutMs) : "";
    setTimeoutDraft(timeoutValue);
    setTimeoutError(null);
    setShowConfig(true);
  }, [cell, isCode]);

  const handleTimeoutChange = useCallback((value: string) => {
    setTimeoutDraft(value);
    setTimeoutError(null);
  }, []);

  const handleConfigClose = useCallback(() => {
    setShowConfig(false);
    setTimeoutError(null);
  }, []);

  const handleTimeoutSave = useCallback(() => {
    if (!isCode) {
      handleConfigClose();
      return;
    }
    const raw = timeoutDraft.trim();
    if (raw.length === 0) {
      onChange(
        (current) => {
          if (current.type !== "code") return current;
          const meta = {
            ...(current.metadata ?? {}),
          } as CodeCellMetadata;
          if (typeof meta.timeoutMs !== "undefined") {
            delete meta.timeoutMs;
          }
          return { ...current, metadata: meta };
        },
        { persist: true }
      );
      handleConfigClose();
      return;
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
      setTimeoutError("Enter a valid number in milliseconds.");
      return;
    }
    if (parsed < 1000 || parsed > 600_000) {
      setTimeoutError("Choose a value between 1,000 and 600,000 milliseconds.");
      return;
    }
    onChange(
      (current) => {
        if (current.type !== "code") return current;
        const meta = {
          ...(current.metadata ?? {}),
        } as CodeCellMetadata;
        meta.timeoutMs = parsed;
        return { ...current, metadata: meta };
      },
      { persist: true }
    );
    handleConfigClose();
  }, [handleConfigClose, isCode, onChange, timeoutDraft]);
  type MarkdownUIMeta = { ui?: { edit?: boolean } };
  const mdEditing =
    cell.type === "markdown" &&
    ((cell.metadata as MarkdownUIMeta).ui?.edit ?? true);

  return (
    <article
      id={`cell-${cell.id}`}
      className={clsx(
        "group/cell relative z-0 rounded-xl transition hover:z-40 focus-within:z-50 pr-14",
        "border-l-2 border-transparent hover:border-emerald-300/80"
      )}
      onMouseDown={onActivate}
      onFocus={onActivate}
      tabIndex={-1}
    >
      <div className="absolute right-0 top-0 z-50 flex flex-col gap-2 rounded-2xl border border-border bg-card/95 p-2 text-muted-foreground shadow-lg backdrop-blur-sm opacity-0 pointer-events-none transition group-hover/cell:opacity-100 group-hover/cell:pointer-events-auto group-focus-within/cell:opacity-100 group-focus-within/cell:pointer-events-auto">
        {isCode ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={onRun}
              disabled={isRunning || !canRun}
              aria-label="Run cell"
              title="Run cell (Shift+Enter)"
            >
              {isRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>
            {isRunning && (
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
            >
              <Eraser className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={openConfig}
              aria-label="Configure cell"
              title="Cell settings"
            >
              <SettingsIcon className="h-4 w-4" />
            </Button>
          </>
        ) : (
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
          >
            {mdEditing ? (
              <Check className="h-4 w-4" />
            ) : (
              <Pencil className="h-4 w-4" />
            )}
          </Button>
        )}
        {canMoveUp && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onMove("up")}
            aria-label="Move cell up"
            title="Move cell up"
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
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {isCode ? (
        <CodeCellView
          editorKey={editorKey}
          path={editorPath}
          cell={cell}
          onChange={onChange}
          onRun={onRun}
          isRunning={isRunning}
          queued={queued}
        />
      ) : (
        <MarkdownCellView
          editorKey={editorKey}
          path={editorPath}
          cell={cell}
          notebookId={notebookId}
          onChange={onChange}
          onAttachmentUploaded={onAttachmentUploaded}
        />
      )}

      {/* Collapse the inline add menu when idle so it doesn't add gap */}
      <div className="flex h-1 flex-1 mb-1 mt-1 justify-center overflow-hidden opacity-0 transition pointer-events-none group-hover/cell:h-10 group-focus-within/cell:h-10 group-hover/cell:opacity-100 group-focus-within/cell:opacity-100 group-hover/cell:pointer-events-auto group-focus-within/cell:pointer-events-auto">
        <AddCellMenu onAdd={onAddBelow} className="text-[11px]" />
      </div>
      {isCode ? (
        <Dialog
          open={showConfig}
          onOpenChange={(open) => (!open ? handleConfigClose() : undefined)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cell timeout</DialogTitle>
              <DialogDescription>
                Set a custom execution limit for this cell. Leave blank to use
                the workspace default.
              </DialogDescription>
            </DialogHeader>
            <form
              className="mt-2 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                handleTimeoutSave();
              }}
            >
              <label className="block text-xs font-medium text-muted-foreground">
                Timeout (ms)
                <input
                  type="number"
                  inputMode="numeric"
                  min={1000}
                  max={600000}
                  step={500}
                  value={timeoutDraft}
                  onChange={(event) => handleTimeoutChange(event.target.value)}
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
              <DialogFooter className="gap-2 sm:gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleConfigClose}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="default"
                  className="px-3 text-[11px]"
                >
                  Save
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </article>
  );
};

export default CellCard;
