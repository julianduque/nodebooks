"use client";

import { useCallback } from "react";
import type { KeyboardEvent } from "react";
import type { NotebookCell } from "@nodebooks/notebook-schema";
import { Badge } from "@/components/ui/badge";

interface CommandCellViewProps {
  cell: Extract<NotebookCell, { type: "command" }>;
  onChange: (
    updater: (cell: NotebookCell) => NotebookCell,
    options?: { persist?: boolean; touch?: boolean }
  ) => void;
  onRun: () => void;
  readOnly?: boolean;
}

const CommandCellView = ({
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
      if (event.key === "Enter" && event.shiftKey && !readOnly) {
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
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/60">
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
          <code className="rounded-md bg-slate-900/80 px-3 py-2 text-sm text-slate-100">
            {cell.command || "(no command)"}
          </code>
        ) : (
          <input
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-mono text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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

export default CommandCellView;
