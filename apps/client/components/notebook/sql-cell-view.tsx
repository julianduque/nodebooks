"use client";

import { useCallback, useMemo } from "react";
import type { KeyboardEvent } from "react";
import clsx from "clsx";
import { Loader2 } from "lucide-react";
import {
  AlertCallout,
  TableGrid,
} from "@nodebooks/ui";
import type {
  NotebookCell,
  SqlConnection,
  SqlResult,
} from "@nodebooks/notebook-schema";
import { Input } from "@/components/ui/input";

const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

type SqlCellType = Extract<NotebookCell, { type: "sql" }>;

type SqlCellViewProps = {
  cell: SqlCellType;
  connections: SqlConnection[];
  onChange: (
    updater: (cell: NotebookCell) => NotebookCell,
    options?: { persist?: boolean; touch?: boolean }
  ) => void;
  onRun: () => void;
  isRunning: boolean;
  readOnly: boolean;
};

const describeDriver = (driver: SqlConnection["driver"]) => {
  switch (driver) {
    case "postgres":
      return "PostgreSQL";
    default:
      return driver;
  }
};

const formatTimestamp = (value: string | undefined) => {
  if (!value) return null;
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toLocaleString();
  } catch {
    return null;
  }
};

const SqlCellView = ({
  cell,
  connections,
  onChange,
  onRun,
  isRunning,
  readOnly,
}: SqlCellViewProps) => {
  const connection = useMemo(() => {
    if (!cell.connectionId) {
      return undefined;
    }
    return connections.find((item) => item.id === cell.connectionId);
  }, [cell.connectionId, connections]);

  const assignName = cell.assignVariable ?? "";
  const trimmedAssign = assignName.trim();
  const assignError =
    trimmedAssign.length > 0 && !IDENTIFIER_PATTERN.test(trimmedAssign)
      ? "Assignment target must be a valid identifier"
      : null;

  const hasConnections = connections.length > 0;

  const result: SqlResult | undefined = cell.result;

  const handleQueryChange = useCallback(
    (value: string) => {
      onChange((current) => {
        if (current.type !== "sql" || current.id !== cell.id) {
          return current;
        }
        return { ...current, query: value };
      });
    },
    [cell.id, onChange]
  );

  const handleConnectionChange = useCallback(
    (value: string) => {
      onChange(
        (current) => {
          if (current.type !== "sql" || current.id !== cell.id) {
            return current;
          }
          const nextConnectionId = value.trim();
          return {
            ...current,
            connectionId: nextConnectionId.length > 0 ? nextConnectionId : undefined,
          };
        },
        { persist: true }
      );
    },
    [cell.id, onChange]
  );

  const handleAssignChange = useCallback(
    (value: string) => {
      onChange(
        (current) => {
          if (current.type !== "sql" || current.id !== cell.id) {
            return current;
          }
          const nextAssign = value.trim();
          const normalized = nextAssign.length > 0 ? nextAssign : undefined;
          const next: SqlCellType = {
            ...current,
            assignVariable: normalized,
          };
          if (current.result) {
            next.result = {
              ...current.result,
              assignedVariable: normalized,
            };
          }
          return next;
        },
        { persist: true }
      );
    },
    [cell.id, onChange]
  );

  const handleQueryKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (readOnly) {
        return;
      }
      if (event.key === "Enter" && (event.shiftKey || event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onRun();
      }
    },
    [onRun, readOnly]
  );

  return (
    <div className="space-y-4 rounded-xl border border-slate-800/60 bg-slate-950/70 p-4 text-sm text-slate-100">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1 text-xs font-semibold text-muted-foreground">
          Connection
          <select
            className={clsx(
              "mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-[13px] text-foreground focus:outline-none",
              !hasConnections && "opacity-50"
            )}
            value={cell.connectionId ?? ""}
            onChange={(event) => handleConnectionChange(event.target.value)}
            disabled={readOnly || !hasConnections}
          >
            <option value="">Select a connection…</option>
            {connections.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name || "Untitled"} ({describeDriver(candidate.driver)})
              </option>
            ))}
          </select>
        </label>
        <label className="sm:w-64 text-xs font-semibold text-muted-foreground">
          Assign to variable
          <Input
            value={cell.assignVariable ?? ""}
            onChange={(event) => handleAssignChange(event.target.value)}
            placeholder="e.g. results"
            className="mt-1"
            disabled={readOnly}
          />
        </label>
      </div>
      {assignError ? (
        <p className="text-xs font-medium text-rose-500">{assignError}</p>
      ) : null}
      {!hasConnections ? (
        <AlertCallout
          level="warning"
          text="Add a SQL connection from the Setup panel to run queries."
          className="text-left"
          themeMode="dark"
        />
      ) : null}
      <div className="rounded-lg border border-slate-800/60 bg-slate-950">
        <textarea
          className="h-48 w-full rounded-lg border-0 bg-transparent p-4 font-mono text-[13px] text-slate-100 focus:outline-none focus:ring-0"
          placeholder="Write a SQL query (Shift+Enter to run)"
          value={cell.query ?? ""}
          onChange={(event) => handleQueryChange(event.target.value)}
          onKeyDown={handleQueryKeyDown}
          spellCheck={false}
          readOnly={readOnly}
        />
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
          {connection ? (
            <span>
              Using {connection.name || "connection"} · {describeDriver(connection.driver)}
            </span>
          ) : null}
          {result?.timestamp ? (
            <span>Last run {formatTimestamp(result.timestamp)}</span>
          ) : null}
          {typeof result?.rowCount === "number" ? (
            <span>{result.rowCount.toLocaleString()} rows</span>
          ) : result?.rows
            ? (
                <span>{result.rows.length.toLocaleString()} rows</span>
              )
            : null}
          {typeof result?.durationMs === "number" ? (
            <span>{result.durationMs.toLocaleString()} ms</span>
          ) : null}
          {result?.assignedVariable ? (
            <span>Assigned to {result.assignedVariable}</span>
          ) : trimmedAssign && !result?.assignedVariable
            ? (
                <span>Will assign to {trimmedAssign} on next run</span>
              )
            : null}
        </div>
        {isRunning ? (
          <div className="flex items-center gap-2 rounded-lg border border-slate-800/60 bg-slate-950/80 px-3 py-2 text-xs text-slate-200">
            <Loader2 className="h-4 w-4 animate-spin" /> Running query…
          </div>
        ) : null}
        {result?.error ? (
          <AlertCallout
            level="error"
            text={result.error}
            className="text-left"
            themeMode="dark"
          />
        ) : null}
        {!result && !isRunning ? (
          <p className="text-xs text-slate-400">
            Run the cell to execute the query and preview the rows below.
          </p>
        ) : null}
        {result && !result.error ? (
          <div className="overflow-hidden rounded-lg border border-slate-800/70 bg-slate-950/80">
            <TableGrid
              rows={result.rows ?? []}
              columns={result.columns ?? []}
              density="compact"
              themeMode="dark"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default SqlCellView;
