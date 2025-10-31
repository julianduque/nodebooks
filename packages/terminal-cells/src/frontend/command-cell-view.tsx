"use client";

import { useCallback } from "react";
import type { KeyboardEvent } from "react";
import type { CellComponentProps } from "@nodebooks/cell-plugin-api";
import type { NotebookCell } from "@nodebooks/notebook-schema";
import type { CommandCell } from "../schema.js";
import { Badge } from "@nodebooks/client-ui/components/ui";

type CommandCellType = CommandCell & NotebookCell;

type CommandCellViewProps = CellComponentProps & {
  cell: CommandCellType;
};

export const CommandCellView = ({
  cell,
  onChange,
  onRun,
  readOnly = false,
}: CommandCellViewProps) => {
  const handleCommandChange = useCallback(
    (value: string) => {
      onChange(
        (current) => {
          if (current.id !== cell.id || current.type !== "command") {
            return current;
          }
          return { ...current, command: value };
        },
        { persist: false }
      );
    },
    [cell.id, onChange]
  );

  const handleSubmitShortcut = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter" && event.shiftKey && !readOnly && onRun) {
        event.preventDefault();
        event.stopPropagation();
        if ((cell.command ?? "").trim().length === 0) {
          return;
        }
        onRun();
      }
    },
    [cell.command, onRun, readOnly]
  );

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge className="bg-sky-100 text-xs font-semibold uppercase tracking-[0.2em] text-sky-700 dark:bg-sky-400/10 dark:text-sky-200">
          Command
        </Badge>
        {!readOnly ? (
          <span className="text-[12px] text-muted-foreground">
            Run with Shift+Enter.
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        {readOnly ? (
          <code className="rounded-lg border border-border/60 bg-background/80 px-3 py-2 font-mono text-sm text-foreground">
            {cell.command || "(no command)"}
          </code>
        ) : (
          <input
            className="h-9 rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground shadow-sm transition focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="pnpm install"
            value={cell.command ?? ""}
            onChange={(event) => handleCommandChange(event.target.value)}
            onKeyDown={handleSubmitShortcut}
          />
        )}
      </div>
    </div>
  );
};
