"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import clsx from "clsx";
import { Loader2 } from "lucide-react";
import { AlertCallout, TableGrid } from "@nodebooks/ui";
import type { NotebookCell } from "@nodebooks/notebook-schema";
import type { BeforeMount, OnMount } from "@monaco-editor/react";
import {
  MonacoEditor,
  initMonaco,
} from "@nodebooks/client-ui/components/monaco";
import { Input, CopyButton } from "@nodebooks/client-ui/components/ui";
import {
  language as sqlLanguage,
  conf as sqlLanguageConfiguration,
} from "monaco-editor/esm/vs/basic-languages/sql/sql.js";
import type { CellComponentProps } from "@nodebooks/cell-plugin-api";
import type { SqlCell, SqlConnection, SqlResult } from "../schema.js";

const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

type SqlCellType = SqlCell;

const SQL_LANGUAGE_ID = "sql";
const ADD_CONNECTION_VALUE = "__nodebooks_add_sql_connection__";
let sqlLanguageRegistered = false;

type MonacoType = Parameters<BeforeMount>[0];

const ensureSqlLanguage = (monaco: MonacoType) => {
  if (sqlLanguageRegistered) {
    return;
  }
  const alreadyRegistered = monaco.languages
    .getLanguages()
    .some((lang) => lang.id === SQL_LANGUAGE_ID);
  if (!alreadyRegistered) {
    monaco.languages.register({ id: SQL_LANGUAGE_ID });
  }
  monaco.languages.setLanguageConfiguration(
    SQL_LANGUAGE_ID,
    sqlLanguageConfiguration
  );
  monaco.languages.setMonarchTokensProvider(SQL_LANGUAGE_ID, sqlLanguage);
  sqlLanguageRegistered = true;
};

type SqlCellViewProps = CellComponentProps & {
  cell: SqlCellType;
  connections: SqlConnection[];
  isRunning: boolean;
  readOnly: boolean;
  onRequestAddConnection: () => void;
  theme: "light" | "dark";
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
  onRequestAddConnection,
  theme,
}: SqlCellViewProps) => {
  const monacoTheme = "vs-dark";
  const isDark = theme === "dark";
  const runShortcutRef = useRef(onRun);
  useEffect(() => {
    runShortcutRef.current = onRun;
  }, [onRun]);
  const editorPath = useMemo(() => `nb:///sql/${cell.id}.sql`, [cell.id]);
  const connection = useMemo(() => {
    if (!cell.connectionId) {
      return undefined;
    }
    return connections.find(
      (item: SqlConnection) => item.id === cell.connectionId
    );
  }, [cell.connectionId, connections]);

  const assignName = cell.assignVariable ?? "";
  const trimmedAssign = assignName.trim();
  const assignError =
    trimmedAssign.length > 0 && !IDENTIFIER_PATTERN.test(trimmedAssign)
      ? "Assignment target must be a valid identifier"
      : null;

  const hasConnections = connections.length > 0;

  const result: SqlResult | undefined = cell.result;

  const statusItems = useMemo(() => {
    const items: string[] = [];
    if (connection) {
      items.push(
        `Using ${connection.name || "connection"} · ${describeDriver(connection.driver)}`
      );
    }
    if (result?.timestamp) {
      const formatted = formatTimestamp(result.timestamp);
      if (formatted) {
        items.push(`Last run ${formatted}`);
      }
    }
    if (typeof result?.rowCount === "number") {
      items.push(`${result.rowCount.toLocaleString()} rows`);
    } else if (result?.rows) {
      items.push(`${result.rows.length.toLocaleString()} rows`);
    }
    if (typeof result?.durationMs === "number") {
      items.push(`${result.durationMs.toLocaleString()} ms`);
    }
    if (result?.assignedVariable) {
      items.push(`Assigned to ${result.assignedVariable}`);
    } else if (trimmedAssign && !result?.assignedVariable) {
      items.push(`Will assign to ${trimmedAssign} on next run`);
    }
    return items;
  }, [connection, result, trimmedAssign]);

  const tableColumns = useMemo(() => {
    if (!result?.columns || result.columns.length === 0) {
      return undefined;
    }
    return result.columns
      .map((column: { name: string; dataType?: string }) => {
        const name = column.name.trim();
        if (!name) {
          return null;
        }
        const label =
          column.dataType && column.dataType.trim().length > 0
            ? `${name} (${column.dataType})`
            : name;
        return { key: name, label };
      })
      .filter(
        (
          column: { key: string; label: string } | null
        ): column is { key: string; label: string } => column !== null
      );
  }, [result]);

  const handleQueryChange = useCallback(
    (value: string) => {
      onChange((current: NotebookCell) => {
        if (current.type !== "sql" || current.id !== cell.id) {
          return current;
        }
        const next = {
          ...current,
          query: value,
        } as NotebookCell;
        return next;
      });
    },
    [cell.id, onChange]
  );

  const handleConnectionChange = useCallback(
    (value: string) => {
      onChange(
        (current: NotebookCell) => {
          if (current.type !== "sql" || current.id !== cell.id) {
            return current;
          }
          const nextConnectionId = value.trim();
          const next = {
            ...current,
            connectionId:
              nextConnectionId.length > 0 ? nextConnectionId : undefined,
          } as NotebookCell;
          return next;
        },
        { persist: true }
      );
    },
    [cell.id, onChange]
  );

  const handleConnectionSelect = useCallback(
    (value: string) => {
      if (value === ADD_CONNECTION_VALUE) {
        onRequestAddConnection();
        return;
      }
      handleConnectionChange(value);
    },
    [handleConnectionChange, onRequestAddConnection]
  );

  const handleAssignChange = useCallback(
    (value: string) => {
      onChange(
        (current: NotebookCell) => {
          if (current.type !== "sql" || current.id !== cell.id) {
            return current;
          }
          const nextAssign = value.trim();
          const normalized = nextAssign.length > 0 ? nextAssign : undefined;
          const existingResult = (current as SqlCell).result;
          const next: NotebookCell = {
            ...current,
            assignVariable: normalized,
            result: existingResult
              ? { ...existingResult, assignedVariable: normalized }
              : existingResult,
          };
          return next;
        },
        { persist: true }
      );
    },
    [cell.id, onChange]
  );

  const handleEditorMount = useCallback<OnMount>(
    (editor: Parameters<OnMount>[0], monaco: Parameters<OnMount>[1]) => {
      const run = () => {
        if (onRun) {
          onRun();
        }
      };
      editor.addAction({
        id: "nodebooks.sql.run-cell",
        label: "Run SQL Cell",
        keybindings: [
          monaco.KeyMod.Shift | monaco.KeyCode.Enter,
          monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
        ],
        run,
      });

      editor.onDidFocusEditorWidget?.(() => {
        const node = editor.getDomNode?.();
        if (!node) return;
        const article = node.closest(
          "article[id^='cell-']"
        ) as HTMLElement | null;
        if (article?.id?.startsWith("cell-")) {
          try {
            article.dispatchEvent(new Event("focus", { bubbles: true }));
          } catch {
            /* noop */
          }
        }
      });
    },
    [onRun]
  );

  const handleBeforeMount = useCallback<BeforeMount>(
    (monaco: Parameters<BeforeMount>[0]) => {
      initMonaco(monaco);
      ensureSqlLanguage(monaco);
    },
    []
  );

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4 text-sm text-card-foreground shadow-sm sm:p-5">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-end">
        <label className="flex flex-col text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Connection</span>
          <select
            className={clsx(
              "mt-1 flex h-9 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm transition focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50",
              readOnly && "cursor-not-allowed opacity-60"
            )}
            value={cell.connectionId ?? ""}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
              handleConnectionSelect(event.target.value)
            }
            disabled={readOnly}
          >
            <option value="">Select a connection…</option>
            {connections.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name || "Untitled"} (
                {describeDriver(candidate.driver)})
              </option>
            ))}
            {!readOnly ? (
              <option value={ADD_CONNECTION_VALUE}>
                + Add new connection…
              </option>
            ) : null}
          </select>
        </label>
        <label className="flex flex-col text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Assign to variable</span>
          <Input
            value={cell.assignVariable ?? ""}
            onChange={(event) => handleAssignChange(event.target.value)}
            placeholder="e.g. results"
            className="mt-1 h-9"
            disabled={readOnly}
          />
        </label>
      </div>
      {assignError ? (
        <p className="text-xs font-medium text-rose-500">{assignError}</p>
      ) : null}
      {!hasConnections ? (
        <AlertCallout
          level="warn"
          text="Add a SQL connection from the Setup panel to run queries."
          className="text-left"
          themeMode={theme}
        />
      ) : null}
      <div className="relative rounded-xl border border-border bg-card">
        <CopyButton
          value={() => cell.query ?? ""}
          className="absolute right-3 top-3 z-10"
          aria-label="Copy SQL query"
          variant="dark"
        />
        <MonacoEditor
          className="h-full w-full"
          path={editorPath}
          height={260}
          defaultLanguage={SQL_LANGUAGE_ID}
          language={SQL_LANGUAGE_ID}
          theme={monacoTheme}
          value={cell.query ?? ""}
          onChange={(value) => handleQueryChange(value ?? "")}
          beforeMount={handleBeforeMount}
          onMount={handleEditorMount}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: "on",
            wordWrap: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            glyphMargin: false,
            renderLineHighlight: "line",
            padding: { top: 16, bottom: 16 },
            readOnly,
            fixedOverflowWidgets: true,
          }}
        />
      </div>
      <div className="space-y-2">
        {isRunning ? (
          <div
            className={clsx(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
              isDark
                ? "border-border/60 bg-card/40 text-card-foreground"
                : "border-border bg-muted text-foreground"
            )}
          >
            <Loader2 className="h-4 w-4 animate-spin" /> Running query…
          </div>
        ) : null}
        {result?.error ? (
          <AlertCallout
            level="error"
            text={result.error}
            className="text-left"
            themeMode={theme}
          />
        ) : null}
        {!result && !isRunning ? (
          <p className="text-xs text-muted-foreground">
            Run the cell to execute the query and preview the rows below.
          </p>
        ) : null}
        {result && !result.error ? (
          <div
            className={clsx(
              "rounded-xl border p-3 shadow-sm",
              isDark ? "border-border/60 bg-card/40" : "border-border bg-card"
            )}
          >
            <TableGrid
              rows={result.rows ?? []}
              columns={tableColumns}
              density="compact"
              themeMode={theme}
            />
          </div>
        ) : null}
        {statusItems.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {statusItems.map((item, index) => (
              <span
                key={`${item}-${index}`}
                className={clsx(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                  isDark
                    ? "border-border/60 bg-card/40 text-card-foreground"
                    : "border-border/70 bg-muted/60 text-muted-foreground"
                )}
              >
                {item}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default SqlCellView;
