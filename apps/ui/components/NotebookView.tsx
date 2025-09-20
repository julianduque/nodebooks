"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import clsx from "clsx";
import DOMPurify from "dompurify";
import { marked } from "marked";
import {
  createCodeCell,
  createEmptyNotebook,
  createMarkdownCell,
  type KernelExecuteRequest,
  type KernelServerMessage,
  type Notebook,
  type NotebookCell,
  type NotebookOutput,
} from "@nodebooks/notebook-schema";

const MonacoEditor = dynamic(async () => {
  const mod = await import("@monaco-editor/react");
  return mod.default;
}, {
  ssr: false,
});

interface NotebookSessionSummary {
  id: string;
  notebookId: string;
  createdAt: string;
  status: "open" | "closed";
}

const DEFAULT_NOTEBOOK = createEmptyNotebook({
  name: "Getting Started",
  cells: [
    createMarkdownCell({
      source:
        "# Welcome to NodeBooks\nRun the code cell below to connect with the kernel. You can add Markdown or code cells using the menu next to each block.",
    }),
    createCodeCell({
      source: "const answer = 21 * 2;\nconsole.log('The answer is', answer);\nanswer;",
      language: "ts",
    }),
  ],
});

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

const NotebookView = () => {
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<NotebookSessionSummary | null>(null);
  const [runningCellId, setRunningCellId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [socketReady, setSocketReady] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const sessionRef = useRef<NotebookSessionSummary | null>(null);

  const updateNotebook = useCallback(
    (
      updater: (current: Notebook) => Notebook,
      options: { persist?: boolean; touch?: boolean } = {},
    ) => {
      setNotebook((prev) => {
        if (!prev) {
          return prev;
        }
        const base = updater(prev);
        const next = options.touch === false ? base : { ...base, updatedAt: new Date().toISOString() };
        if (options.persist !== false && next !== prev) {
          setDirty(true);
        }
        return next;
      });
    },
    [],
  );

  const updateNotebookCell = useCallback(
    (
      id: string,
      updater: (cell: NotebookCell) => NotebookCell,
      options?: { persist?: boolean; touch?: boolean },
    ) => {
      updateNotebook(
        (current) => ({
          ...current,
          cells: current.cells.map((cell) => (cell.id === id ? updater(cell) : cell)),
        }),
        options,
      );
    },
    [updateNotebook],
  );

  const handleServerMessage = useCallback(
    (message: KernelServerMessage) => {
      if (message.type === "hello") {
        return;
      }
      if (message.type === "status") {
        if (message.state === "idle") {
          setRunningCellId(null);
        }
        return;
      }
      if (message.type === "execute_reply") {
        setRunningCellId((current) => (current === message.cellId ? null : current));
        updateNotebookCell(
          message.cellId,
          (cell) => {
            if (cell.type !== "code") {
              return cell;
            }
            const ended = Date.now();
            return {
              ...cell,
              execution: {
                started: ended - message.execTimeMs,
                ended,
                status: message.status,
              },
            };
          },
          { persist: false },
        );
        return;
      }
      if (message.type === "stream") {
        updateNotebookCell(
          message.cellId,
          (cell) => {
            if (cell.type !== "code") {
              return cell;
            }
            return {
              ...cell,
              outputs: [...cell.outputs, { type: "stream", name: message.name, text: message.text }],
            };
          },
          { persist: false, touch: false },
        );
        return;
      }
      if (message.type === "error") {
        updateNotebookCell(
          message.cellId,
          (cell) => {
            if (cell.type !== "code") {
              return cell;
            }
            return {
              ...cell,
              outputs: [
                ...cell.outputs,
                {
                  type: "error",
                  ename: message.ename,
                  evalue: message.evalue,
                  traceback: message.traceback,
                },
              ],
            };
          },
          { persist: false },
        );
        return;
      }
      if (
        message.type === "display_data" ||
        message.type === "execute_result" ||
        message.type === "update_display_data"
      ) {
        updateNotebookCell(
          message.cellId,
          (cell) => {
            if (cell.type !== "code") {
              return cell;
            }
            const output: NotebookOutput = {
              type: message.type,
              data: message.data,
              metadata: message.metadata ?? {},
            };
            return {
              ...cell,
              outputs: [...cell.outputs, output],
            };
          },
          { persist: false },
        );
      }
    },
    [updateNotebookCell],
  );


  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/notebooks`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Failed to load notebooks (status ${response.status})`);
        }
        const payload = await response.json();
        let initial: Notebook | undefined = payload?.data?.[0];
        if (!initial) {
          const created = await fetch(`${API_BASE_URL}/notebooks`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ template: "starter" }),
            signal: controller.signal,
          });
          if (!created.ok) {
            throw new Error(`Failed to create notebook (status ${created.status})`);
          }
          const createdPayload = await created.json();
          initial = createdPayload.data;
        }
        if (!controller.signal.aborted && initial) {
          setNotebook(initial);
          setDirty(false);
          setError(null);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Unable to load notebooks from the API");
          setNotebook(DEFAULT_NOTEBOOK);
          setDirty(false);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!notebook) {
      return;
    }

    let cancelled = false;
    const openSession = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/notebooks/${notebook.id}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        if (!response.ok) {
          throw new Error(`Failed to open session (status ${response.status})`);
        }
        const payload = await response.json();
        if (!cancelled) {
          setSession(payload.data);
          sessionRef.current = payload.data;
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to open a session");
        }
      }
    };

    void openSession();

    return () => {
      cancelled = true;
    };
  }, [notebook?.id]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const protocol = API_BASE_URL.startsWith("https") ? "wss" : "ws";
    const wsUrl = `${API_BASE_URL.replace(/^https?/, protocol)}/ws/sessions/${session.id}`;
    const socket = new WebSocket(wsUrl);

    socketRef.current = socket;
    setSocketReady(false);

    socket.onopen = () => {
      setSocketReady(true);
    };

    socket.onerror = () => {
      setError("Kernel connection error");
    };

    socket.onclose = () => {
      socketRef.current = null;
      setSocketReady(false);
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as KernelServerMessage;
        handleServerMessage(message);
      } catch (err) {
        console.error("Failed to parse kernel message", err);
      }
    };

    return () => {
      socket.close(1000, "session change");
    };
  }, [session?.id, handleServerMessage]);

  useEffect(() => {
    return () => {
      const activeSession = sessionRef.current;
      if (activeSession) {
        void fetch(`${API_BASE_URL}/sessions/${activeSession.id}`, { method: "DELETE" }).catch(() => undefined);
      }
      if (socketRef.current) {
        socketRef.current.close(1000, "component unmounted");
      }
    };
  }, []);

  useEffect(() => {
    if (!notebook || !dirty) {
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/notebooks/${notebook.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: notebook.name,
            env: notebook.env,
            cells: notebook.cells,
          }),
        });
        if (!response.ok) {
          throw new Error(`Failed to save notebook (status ${response.status})`);
        }
        setDirty(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save notebook");
      }
    }, 600);

    saveTimerRef.current = timer;
    return () => {
      clearTimeout(timer);
    };
  }, [notebook, dirty]);

  const handleCellChange = useCallback(
    (id: string, updater: (cell: NotebookCell) => NotebookCell) => {
      updateNotebookCell(id, updater);
    },
    [updateNotebookCell],
  );

  const handleAddCell = useCallback(
    (type: NotebookCell["type"], index?: number) => {
      const nextCell = type === "code" ? createCodeCell({ language: "ts" }) : createMarkdownCell({ source: "" });
      updateNotebook((current) => {
        const cells = [...current.cells];
        if (typeof index === "number") {
          cells.splice(index, 0, nextCell);
        } else {
          cells.push(nextCell);
        }
        return { ...current, cells };
      });
    },
    [updateNotebook],
  );

  const handleDeleteCell = useCallback(
    (id: string) => {
      updateNotebook((current) => {
        if (current.cells.length <= 1) {
          return current;
        }
        return { ...current, cells: current.cells.filter((cell) => cell.id !== id) };
      });
    },
    [updateNotebook],
  );

  const handleMoveCell = useCallback(
    (id: string, direction: "up" | "down") => {
      updateNotebook((current) => {
        const index = current.cells.findIndex((cell) => cell.id === id);
        if (index < 0) {
          return current;
        }
        const target = direction === "up" ? index - 1 : index + 1;
        if (target < 0 || target >= current.cells.length) {
          return current;
        }
        const cells = [...current.cells];
        const [removed] = cells.splice(index, 1);
        cells.splice(target, 0, removed);
        return { ...current, cells };
      });
    },
    [updateNotebook],
  );

  const handleRunCell = useCallback(
    (id: string) => {
      if (!notebook) {
        return;
      }
      const cell = notebook.cells.find((item) => item.id === id);
      if (!cell || cell.type !== "code") {
        return;
      }
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        setError("Kernel is not connected yet");
        return;
      }

      setRunningCellId(id);
      updateNotebookCell(
        id,
        (current) => {
          if (current.type !== "code") {
            return current;
          }
          return {
            ...current,
            outputs: [],
            execution: {
              started: Date.now(),
              ended: Date.now(),
              status: "ok",
            },
          };
        },
        { persist: false },
      );

      const payload: KernelExecuteRequest = {
        type: "execute_request",
        cellId: id,
        code: cell.source,
        language: cell.language,
        timeoutMs: cell.metadata.timeoutMs,
      };

      socket.send(JSON.stringify(payload));
    },
    [notebook, updateNotebookCell],
  );

  const handleRename = useCallback(() => {
    if (!notebook) {
      return;
    }
    const nextName = window.prompt("Notebook name", notebook.name);
    if (nextName && nextName.trim() && nextName.trim() !== notebook.name) {
      updateNotebook((current) => ({ ...current, name: nextName.trim() }));
    }
  }, [notebook, updateNotebook]);


  const notebookHeader = useMemo(() => {
    if (!notebook) {
      return "";
    }
    try {
      return new Date(notebook.updatedAt).toLocaleString();
    } catch {
      return notebook.updatedAt;
    }
  }, [notebook]);

  if (loading || !notebook) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="rounded-xl border border-slate-200 bg-white px-8 py-6 shadow-sm">
          <p className="text-slate-600">Loading notebook…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-4 py-10">
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-sm">
          {error}
        </div>
      )}
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{notebook.name}</h1>
            <p className="text-sm text-slate-500">Last updated {notebookHeader}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-brand-100 px-3 py-1 font-medium text-brand-700">
              Runtime: {notebook.env.runtime.toUpperCase()} {notebook.env.version}
            </span>
            <span
              className={clsx(
                "rounded-full px-3 py-1 font-medium",
                socketReady ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
              )}
            >
              Kernel {socketReady ? "connected" : "connecting"}
            </span>
            <button
              type="button"
              className="rounded-full border border-slate-200 px-3 py-1 text-slate-600 transition hover:border-brand-400 hover:text-brand-700"
              onClick={handleRename}
            >
              Rename
            </button>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-4">
        {notebook.cells.map((cell, index) => (
          <CellCard
            key={cell.id}
            cell={cell}
            isRunning={runningCellId === cell.id}
            canRun={socketReady}
            onChange={(updater) => handleCellChange(cell.id, updater)}
            onDelete={() => handleDeleteCell(cell.id)}
            onRun={() => handleRunCell(cell.id)}
            onMove={(direction) => handleMoveCell(cell.id, direction)}
            onAddBelow={(type) => handleAddCell(type, index + 1)}
          />
        ))}
        <div className="flex justify-center py-6">
          <AddCellMenu onAdd={(type) => handleAddCell(type)} />
        </div>
      </main>
    </div>
  );
};

interface CellCardProps {
  cell: NotebookCell;
  onChange: (updater: (cell: NotebookCell) => NotebookCell) => void;
  onRun: () => void;
  onDelete: () => void;
  onAddBelow: (type: NotebookCell["type"]) => void;
  onMove: (direction: "up" | "down") => void;
  isRunning: boolean;
  canRun: boolean;
}

const CellCard = ({
  cell,
  onChange,
  onRun,
  onDelete,
  onAddBelow,
  onMove,
  isRunning,
  canRun,
}: CellCardProps) => {
  return (
    <section className="group relative rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-brand-300">
      <div className="absolute -left-4 top-4 hidden flex-col gap-2 rounded-full bg-white p-2 text-xs shadow-md group-hover:flex">
        <button
          type="button"
          className="rounded-full border border-slate-200 px-2 py-1 text-slate-600 transition hover:border-brand-400 hover:text-brand-700"
          onClick={() => onAddBelow("markdown")}
        >
          + Markdown
        </button>
        <button
          type="button"
          className="rounded-full border border-slate-200 px-2 py-1 text-slate-600 transition hover:border-brand-400 hover:text-brand-700"
          onClick={() => onAddBelow("code")}
        >
          + Code
        </button>
      </div>
      <header className="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-xs uppercase tracking-wide text-slate-400">
        <span>{cell.type === "code" ? "Code" : "Markdown"} cell</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-full border border-transparent px-2 py-1 text-slate-500 transition hover:border-slate-200 hover:text-brand-700"
            onClick={() => onMove("up")}
          >
            ↑
          </button>
          <button
            type="button"
            className="rounded-full border border-transparent px-2 py-1 text-slate-500 transition hover:border-slate-200 hover:text-brand-700"
            onClick={() => onMove("down")}
          >
            ↓
          </button>
          <button
            type="button"
            className="rounded-full border border-transparent px-2 py-1 text-slate-500 transition hover:border-rose-200 hover:text-rose-600"
            onClick={onDelete}
          >
            Delete
          </button>
        </div>
      </header>
      <div className="p-4">
        {cell.type === "markdown" ? (
          <MarkdownCellView cell={cell} onChange={onChange} />
        ) : (
          <CodeCellView cell={cell} onChange={onChange} onRun={onRun} isRunning={isRunning} canRun={canRun} />
        )}
      </div>
    </section>
  );
};

interface MarkdownCellViewProps {
  cell: Extract<NotebookCell, { type: "markdown" }>;
  onChange: (updater: (cell: NotebookCell) => NotebookCell) => void;
}

const MarkdownCellView = ({ cell, onChange }: MarkdownCellViewProps) => {
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const html = useMemo(() => {
    const parsed = marked.parse(cell.source ?? "", { async: false });
    const rendered = typeof parsed === "string" ? parsed : "";
    return DOMPurify.sanitize(rendered);
  }, [cell.source]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm">
        <button
          type="button"
          className={clsx(
            "rounded-full px-3 py-1",
            mode === "edit" ? "bg-brand-500 text-white shadow" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
          )}
          onClick={() => setMode("edit")}
        >
          Edit
        </button>
        <button
          type="button"
          className={clsx(
            "rounded-full px-3 py-1",
            mode === "preview" ? "bg-brand-500 text-white shadow" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
          )}
          onClick={() => setMode("preview")}
        >
          Preview
        </button>
      </div>
      {mode === "edit" ? (
        <textarea
          className="min-h-[160px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-800 shadow-inner focus:border-brand-400 focus:outline-none"
          value={cell.source}
          onChange={(event) => onChange(() => ({ ...cell, source: event.target.value }))}
          placeholder="Write Markdown..."
        />
      ) : (
        <div
          className="prose prose-slate max-w-none rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-inner"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
};

interface CodeCellViewProps {
  cell: Extract<NotebookCell, { type: "code" }>;
  onChange: (updater: (cell: NotebookCell) => NotebookCell) => void;
  onRun: () => void;
  isRunning: boolean;
  canRun: boolean;
}

const CodeCellView = ({ cell, onChange, onRun, isRunning, canRun }: CodeCellViewProps) => {
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-xl border border-slate-800">
        <MonacoEditor
          height="220px"
          defaultLanguage={cell.language === "ts" ? "typescript" : "javascript"}
          language={cell.language === "ts" ? "typescript" : "javascript"}
          theme="vs-dark"
          value={cell.source}
          onChange={(value) => onChange(() => ({ ...cell, source: value ?? "" }))}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            readOnly: isRunning,
            padding: { top: 12, bottom: 12 },
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="rounded-full bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"
          onClick={onRun}
          disabled={isRunning || !canRun}
        >
          {isRunning ? "Running…" : "Run cell"}
        </button>
        <span className="rounded-full border border-slate-200 px-3 py-1 text-xs uppercase tracking-wide text-slate-500">
          Language: {cell.language.toUpperCase()}
        </span>
      </div>
      {cell.outputs.length > 0 && (
        <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-900/90 p-4 text-sm text-emerald-100 shadow-inner">
          {cell.outputs.map((output, index) => (
            <OutputView key={index} output={output} />
          ))}
        </div>
      )}
    </div>
  );
};

const OutputView = ({ output }: { output: NotebookOutput }) => {
  if (output.type === "stream") {
    return (
      <pre className="whitespace-pre-wrap font-mono text-emerald-100">
        <span className="text-emerald-300">[{output.name}]</span> {output.text}
      </pre>
    );
  }

  if (output.type === "error") {
    return (
      <div className="rounded-lg border border-rose-400 bg-rose-100/80 p-3 font-mono text-sm text-rose-700">
        <strong>{output.ename}:</strong> {output.evalue}
        {output.traceback.length > 0 && (
          <pre className="mt-2 whitespace-pre-wrap text-xs">{output.traceback.join("\n")}</pre>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/90 p-3">
      <pre className="whitespace-pre-wrap text-xs text-slate-100">
        {JSON.stringify(output.data, null, 2)}
      </pre>
    </div>
  );
};

const AddCellMenu = ({
  onAdd,
}: {
  onAdd: (type: NotebookCell["type"]) => void;
}) => {
  return (
    <div className="flex items-center gap-3 rounded-full border border-dashed border-slate-300 bg-white px-4 py-2 text-sm text-slate-500 shadow-sm">
      <span>Add a new cell</span>
      <button
        type="button"
        className="rounded-full border border-slate-200 px-3 py-1 text-slate-600 transition hover:border-brand-400 hover:text-brand-700"
        onClick={() => onAdd("markdown")}
      >
        Markdown
      </button>
      <button
        type="button"
        className="rounded-full border border-slate-200 px-3 py-1 text-slate-600 transition hover:border-brand-400 hover:text-brand-700"
        onClick={() => onAdd("code")}
      >
        Code
      </button>
    </div>
  );
};

export default NotebookView;
