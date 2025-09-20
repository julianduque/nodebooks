"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import clsx from "clsx";
import DOMPurify from "dompurify";
import { marked } from "marked";
import AppShell from "./AppShell";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card, CardContent } from "./ui/card";
import { ArrowDown, ArrowUp, Check, Loader2, Pencil, Play, PlayCircle, Plus, Save, Share2, ChevronRight, Trash2, Edit3, NotebookPen } from "lucide-react";
import type { OnMount } from "@monaco-editor/react";
import {
  createCodeCell,
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

type NotebookSummary = Pick<Notebook, "id" | "name" | "createdAt" | "updatedAt">;

type NotebookTemplateId = "starter" | "typescript" | "blank";

interface TemplateCard {
  id: string;
  title: string;
  description: string;
  templateId: NotebookTemplateId;
  accent: string;
}

interface OutlineItem {
  id: string;
  cellId: string;
  title: string;
  level: number;
}

const TEMPLATE_CARDS: TemplateCard[] = [
  {
    id: "api-testing",
    title: "API Testing",
    description: "Preconfigured requests and helpers for REST endpoints.",
    templateId: "starter",
    accent: "bg-emerald-100 text-emerald-700",
  },
  {
    id: "data-viz",
    title: "Data Visualization",
    description: "Plot data with TypeScript and popular charting libs.",
    templateId: "typescript",
    accent: "bg-sky-100 text-sky-700",
  },
  {
    id: "llm-agents",
    title: "LLM Agents",
    description: "Start orchestrating AI prompts and tool invocations.",
    templateId: "typescript",
    accent: "bg-purple-100 text-purple-700",
  },
  {
    id: "web-scraping",
    title: "Web Scraping",
    description: "Kick off scraping flows with Puppeteer snippets.",
    templateId: "blank",
    accent: "bg-amber-100 text-amber-700",
  },
];

const summarizeNotebook = (notebook: Notebook): NotebookSummary => ({
  id: notebook.id,
  name: notebook.name,
  createdAt: notebook.createdAt,
  updatedAt: notebook.updatedAt,
});

const sortSummaries = (items: NotebookSummary[]) =>
  [...items].sort((a, b) => {
    if (a.updatedAt === b.updatedAt) {
      if (a.createdAt === b.createdAt) {
        return a.name.localeCompare(b.name);
      }
      return a.createdAt > b.createdAt ? -1 : 1;
    }
    return a.updatedAt > b.updatedAt ? -1 : 1;
  });

const upsertNotebookSummary = (
  notebook: Notebook,
  items: NotebookSummary[],
): NotebookSummary[] => {
  const summary = summarizeNotebook(notebook);
  const remaining = items.filter((item) => item.id !== summary.id);
  return sortSummaries([summary, ...remaining]);
};

const formatTimestamp = (value: string) => {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

const NotebookView = () => {
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [notebookList, setNotebookList] = useState<NotebookSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<NotebookSessionSummary | null>(null);
  const [runningCellId, setRunningCellId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [socketReady, setSocketReady] = useState(false);
  const [activeSection, setActiveSection] = useState<"home" | "notebooks" | "templates" | "settings" | "editor">("home");
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "error">("idle");
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");

  const socketRef = useRef<WebSocket | null>(null);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const sessionRef = useRef<NotebookSessionSummary | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  const notebookId = notebook?.id;
  const sessionId = session?.id;

  useEffect(() => {
    if (shareStatus === "idle") {
      return;
    }
    const timeout = setTimeout(() => {
      setShareStatus("idle");
    }, 2000);
    return () => {
      clearTimeout(timeout);
    };
  }, [shareStatus]);

  useEffect(() => {
    if (notebook) {
      setRenameDraft(notebook.name);
    } else {
      setRenameDraft("");
    }
    setIsRenaming(false);
  }, [notebook]);

  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus();
    }
  }, [isRenaming]);

  const clearPendingSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const closeActiveSession = useCallback((reason: string) => {
    clearPendingSave();
    const activeSession = sessionRef.current;
    if (activeSession) {
      void fetch(`${API_BASE_URL}/sessions/${activeSession.id}`, {
        method: "DELETE",
      }).catch(() => undefined);
    }
    sessionRef.current = null;
    setSession(null);

    const socket = socketRef.current;
    if (socket) {
      try {
        socket.close(1000, reason);
      } catch {
        // noop
      }
      socketRef.current = null;
    }
    setSocketReady(false);
  }, [clearPendingSave]);

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
        if (next !== prev && options.touch !== false) {
          setNotebookList((items) => upsertNotebookSummary(next, items));
        }
        return next;
      });
    },
    [setNotebookList],
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

  const saveNotebookNow = useCallback(async () => {
    if (!notebook) {
      return;
    }
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
      const payload = await response.json();
      const saved: Notebook | undefined = payload?.data;
      if (saved) {
        setNotebook(saved);
        setNotebookList((items) => upsertNotebookSummary(saved, items));
        setDirty(false);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save notebook");
    }
  }, [notebook, setNotebookList]);


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
        const notebooks: Notebook[] = Array.isArray(payload?.data) ? payload.data : [];

        if (!controller.signal.aborted) {
          setNotebookList(sortSummaries(notebooks.map(summarizeNotebook)));
        }

        let initial: Notebook | undefined = notebooks[0];

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
          if (!controller.signal.aborted && initial) {
            setNotebookList([summarizeNotebook(initial)]);
          }
        }

        if (!controller.signal.aborted && initial) {
          setNotebook(initial);
          setDirty(false);
          setError(null);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Unable to load notebooks from the API");
          setNotebook(null);
          setNotebookList([]);
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
    if (!notebookId) {
      return;
    }

    let cancelled = false;
    const openSession = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/notebooks/${notebookId}/sessions`, {
          method: "POST",
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
  }, [notebookId]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    const protocol = API_BASE_URL.startsWith("https") ? "wss" : "ws";
    const wsUrl = `${API_BASE_URL.replace(/^https?/, protocol)}/ws/sessions/${sessionId}`;
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
  }, [sessionId, handleServerMessage]);

  useEffect(() => {
    return () => {
      closeActiveSession("component unmounted");
    };
  }, [closeActiveSession]);

  useEffect(() => {
    if (!notebook || !dirty) {
      return;
    }

    clearPendingSave();

    const timer = setTimeout(() => {
      void saveNotebookNow();
    }, 600);

    saveTimerRef.current = timer;
    return () => {
      clearTimeout(timer);
      if (saveTimerRef.current === timer) {
        saveTimerRef.current = null;
      }
    };
  }, [notebook, dirty, clearPendingSave, saveNotebookNow]);

  const handleSelectNotebook = useCallback(
    async (id: string) => {
      if (notebook?.id === id) {
        return;
      }

      closeActiveSession("switch notebook");
      setLoading(true);
      setNotebook(null);
      setActiveSection("editor");
      setShareStatus("idle");

      try {
        const response = await fetch(`${API_BASE_URL}/notebooks/${id}`);
        if (!response.ok) {
          throw new Error(`Failed to load notebook (status ${response.status})`);
        }
        const payload = await response.json();
        const next: Notebook | undefined = payload?.data;
        if (next) {
          setNotebook(next);
          setNotebookList((items) => upsertNotebookSummary(next, items));
          setDirty(false);
          setError(null);
          setActiveSection("editor");
          setShareStatus("idle");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load the selected notebook");
      } finally {
        setLoading(false);
      }
    },
    [notebook?.id, closeActiveSession],
  );

  const handleCreateNotebook = useCallback(async (template: NotebookTemplateId = "starter") => {
    closeActiveSession("create notebook");
    setLoading(true);
    setNotebook(null);
    try {
      const response = await fetch(`${API_BASE_URL}/notebooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template }),
      });
      if (!response.ok) {
        throw new Error(`Failed to create notebook (status ${response.status})`);
      }
      const payload = await response.json();
      const created: Notebook | undefined = payload?.data;
      if (created) {
        setNotebook(created);
        setNotebookList((items) => upsertNotebookSummary(created, items));
        setDirty(false);
        setError(null);
        setActiveSection("editor");
        setShareStatus("idle");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create a new notebook");
    } finally {
      setLoading(false);
    }
  }, [closeActiveSession]);

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
      if (runningCellId === id) {
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
    [notebook, updateNotebookCell, runningCellId],
  );

  const handleRenameStart = useCallback(() => {
    if (!notebook) {
      return;
    }
    setRenameDraft(notebook.name);
    setIsRenaming(true);
  }, [notebook]);

  const handleRenameCommit = useCallback(() => {
    if (!notebook) {
      setIsRenaming(false);
      return;
    }
    const trimmed = renameDraft.trim();
    if (trimmed && trimmed !== notebook.name) {
      updateNotebook((current) => ({ ...current, name: trimmed }));
    }
    setIsRenaming(false);
  }, [renameDraft, notebook, updateNotebook]);

  const handleRenameCancel = useCallback(() => {
    setIsRenaming(false);
    setRenameDraft(notebook?.name ?? "");
  }, [notebook?.name]);

  const handleRenameKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleRenameCommit();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        handleRenameCancel();
      }
    },
    [handleRenameCommit, handleRenameCancel],
  );

  const handleRunAll = useCallback(() => {
    if (!notebook) {
      return;
    }
    notebook.cells.forEach((cell) => {
      if (cell.type === "code") {
        handleRunCell(cell.id);
      }
    });
  }, [notebook, handleRunCell]);

  const handleSaveNow = useCallback(() => {
    void saveNotebookNow();
  }, [saveNotebookNow]);

  const handleShare = useCallback(() => {
    if (!notebook || typeof window === "undefined") {
      return;
    }
    try {
      const shareUrl = `${window.location.origin}/notebooks/${notebook.id}`;
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(shareUrl);
      }
      setShareStatus("copied");
    } catch {
      setShareStatus("error");
    }
  }, [notebook]);

  const handleNavigate = useCallback((target: "home" | "notebooks" | "templates" | "settings") => {
    setActiveSection(target);
  }, []);

  const handleOutlineJump = useCallback((cellId: string) => {
    setActiveSection("editor");
    if (typeof document === "undefined") {
      return;
    }
    const element = document.getElementById(`cell-${cellId}`);
    element?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const outlineItems = useMemo<OutlineItem[]>(() => {
    if (!notebook) {
      return [];
    }
    const items: OutlineItem[] = [];
    notebook.cells.forEach((cell) => {
      if (cell.type !== "markdown" || !cell.source) {
        return;
      }
      const lines = cell.source.split("\n");
      lines.forEach((line, index) => {
        const match = /^(#{1,4})\s+(.*)/.exec(line.trim());
        if (match) {
          items.push({
            id: `${cell.id}-${index}`,
            cellId: cell.id,
            title: match[2].trim(),
            level: match[1].length,
          });
        }
      });
    });
    return items;
  }, [notebook]);


  const notebookHeader = useMemo(() => {
    if (!notebook) {
      return "";
    }
    return formatTimestamp(notebook.updatedAt);
  }, [notebook]);
  const handleTemplateLaunch = useCallback(
    (templateId: NotebookTemplateId) => {
      void handleCreateNotebook(templateId);
    },
    [handleCreateNotebook],
  );

  const handleQuickCreate = useCallback(() => {
    if (loading) {
      return;
    }
    void handleCreateNotebook();
  }, [loading, handleCreateNotebook]);

  const editorView = useMemo(() => {
    if (loading) {
      return (
        <div className="flex flex-1 items-center justify-center p-10">
          <Card className="w-full max-w-md text-center">
            <CardContent className="py-10 text-slate-600">Loading notebook…</CardContent>
          </Card>
        </div>
      );
    }

    if (!notebook) {
      return (
        <div className="flex flex-1 items-center justify-center p-10">
          <Card className="w-full max-w-md text-center">
            <CardContent className="space-y-3 py-10">
              <p className="text-lg font-semibold text-slate-700">Select a notebook to begin.</p>
              {error && <p className="text-sm text-rose-600">{error}</p>}
            </CardContent>
          </Card>
        </div>
      );
    }

    return (
      <div className="flex min-h-full flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-8 py-4 shadow-sm">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Notebook</div>
            <div className="mt-2 flex items-center gap-3">
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  value={renameDraft}
                  onChange={(event) => setRenameDraft(event.target.value)}
                  onBlur={handleRenameCommit}
                  onKeyDown={handleRenameKeyDown}
                  className="min-w-[240px] rounded-lg border border-slate-300 bg-white px-3 py-1 text-3xl font-semibold text-slate-900 focus:border-brand-500 focus:outline-none"
                  aria-label="Notebook name"
                />
              ) : (
                <button
                  type="button"
                  className="text-left text-3xl font-semibold text-slate-900 hover:text-brand-600"
                  onClick={handleRenameStart}
                >
                  {notebook.name}
                </button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={isRenaming ? handleRenameCommit : handleRenameStart}
                aria-label="Rename notebook"
              >
              <Pencil className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-slate-500">
              <span>Last updated {notebookHeader}</span>
              <span className="flex items-center gap-2">
                <span className={clsx("h-2 w-2 rounded-full", socketReady ? "bg-emerald-500" : "bg-amber-500")} />
                {socketReady ? "Kernel connected" : "Kernel connecting"}
              </span>
              <span className="flex items-center gap-2">
                <span className={clsx("h-2 w-2 rounded-full", dirty ? "bg-amber-500" : "bg-emerald-500")} />
                {dirty ? "Unsaved changes" : "Saved"}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="uppercase tracking-[0.2em]">
              {notebook.env.runtime.toUpperCase()} {notebook.env.version}
            </Badge>
            <Button
              variant="secondary"
              size="icon"
              onClick={handleRunAll}
              disabled={!socketReady}
              aria-label="Run all cells"
            >
              <PlayCircle className="h-4 w-4" />
            </Button>
            <Button
              variant={dirty ? "secondary" : "ghost"}
              size="icon"
              onClick={handleSaveNow}
              disabled={!dirty}
              aria-label="Save notebook"
            >
              {dirty ? <Save className="h-4 w-4" /> : <Check className="h-4 w-4 text-emerald-500" />}
            </Button>
            <Button
              variant={shareStatus === "error" ? "destructive" : "ghost"}
              size="icon"
              onClick={handleShare}
              aria-label={shareStatus === "copied" ? "Notebook link copied" : "Share notebook"}
            >
              {shareStatus === "copied" ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : (
                <Share2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto bg-muted/20 px-0 py-0">
            {error && (
              <Card className="mb-6 border-rose-200 bg-rose-50">
                <CardContent className="text-sm text-rose-700">{error}</CardContent>
              </Card>
            )}
            <div className="space-y-6">
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
            </div>
            <div className="mt-10 flex justify-center py-4 opacity-0 transition hover:opacity-100 focus-within:opacity-100">
              <AddCellMenu
                onAdd={(type) => handleAddCell(type)}
                className="pointer-events-auto rounded-full border-slate-300/80 bg-white/95 px-4 py-1 text-xs"
              />
            </div>
          </div>
          <aside className="hidden w-72 shrink-0 border-l border-slate-200 bg-white px-5 py-6 lg:block">
            <OutlinePanel items={outlineItems} onSelect={handleOutlineJump} activeCellId={runningCellId ?? undefined} />
          </aside>
        </div>
      </div>
    );
  }, [
    loading,
    notebook,
    socketReady,
    dirty,
    notebookHeader,
    handleRenameStart,
    handleRenameCommit,
    handleRenameKeyDown,
    isRenaming,
    renameDraft,
    handleRunAll,
    handleSaveNow,
    handleShare,
    shareStatus,
    error,
    outlineItems,
    runningCellId,
    handleCellChange,
    handleDeleteCell,
    handleRunCell,
    handleMoveCell,
    handleAddCell,
    handleOutlineJump,
  ]);

  const homeView = useMemo(() => {
    if (loading) {
      return (
        <div className="flex flex-1 flex-col">
          <Card className="w-full max-w-md">
            <CardContent className="py-10 text-center text-slate-600">Loading notebooks…</CardContent>
          </Card>
        </div>
      );
    }

    if (notebookList.length === 0) {
      return (
        <div className="flex flex-1 flex-col">
          <h1 className="text-3xl font-semibold text-slate-900">Welcome to NodeBooks</h1>
          <p className="mt-2 text-slate-500">Create your first notebook to get started.</p>
          <Card className="mt-8 max-w-xl">
            <CardContent className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-slate-500">Spin up a new notebook with example cells.</p>
              </div>
              <Button className="gap-2" onClick={handleQuickCreate}>
                <Plus className="h-4 w-4" />
                Create notebook
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    const recent = notebookList.slice(0, 6);
    return (
      <div className="flex flex-1 flex-col">
        <h1 className="text-3xl font-semibold text-slate-900">Home</h1>
        <p className="mt-2 text-slate-500">Pick up your recent notebooks or start something new.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {recent.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelectNotebook(item.id)}
              className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-1 hover:border-brand-200 hover:shadow-lg"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <NotebookPen className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-semibold text-slate-900">{item.name}</h3>
                  <p className="text-sm text-slate-500">Last opened {formatTimestamp(item.updatedAt)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-brand-600">
                <span>Open notebook</span>
                <ChevronRight className="h-4 w-4" />
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }, [loading, notebookList, handleQuickCreate, handleSelectNotebook]);

  const notebooksView = useMemo(() => {
    return (
      <div className="flex flex-1 flex-col">
        <h1 className="text-3xl font-semibold text-slate-900">Notebooks</h1>
        <p className="mt-2 text-slate-500">Manage all notebooks in your workspace.</p>
        <div className="mt-8 space-y-3">
          {notebookList.length === 0 ? (
            <Card className="max-w-xl">
              <CardContent className="flex items-center justify-between gap-4">
                <p className="text-sm text-slate-500">No notebooks yet.</p>
                <Button size="sm" className="gap-2" onClick={handleQuickCreate}>
                  <Plus className="h-4 w-4" />
                  New notebook
                </Button>
              </CardContent>
            </Card>
          ) : (
            notebookList.map((item) => (
              <Card key={item.id} className="flex flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-semibold text-slate-900">{item.name}</h3>
                  <p className="text-sm text-slate-500">Updated {formatTimestamp(item.updatedAt)}</p>
                </div>
                <Button variant="default" size="sm" className="gap-2" onClick={() => handleSelectNotebook(item.id)} aria-label={`Open ${item.name}`}>
                  <Play className="h-4 w-4" />
                  Open
                </Button>
              </Card>
            ))
          )}
        </div>
      </div>
    );
  }, [notebookList, handleQuickCreate, handleSelectNotebook]);

  const templatesView = useMemo(() => {
    return (
      <div className="flex flex-1 flex-col">
        <h1 className="text-3xl font-semibold text-slate-900">Template Gallery</h1>
        <p className="mt-2 text-slate-500">Jump into curated setups for common workflows.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {TEMPLATE_CARDS.map((template) => (
            <Card key={template.id} className="border-slate-200 bg-white/90 shadow-sm">
              <CardContent className="space-y-4 px-6 py-5">
                <Badge className={clsx("w-fit", template.accent)}>Template</Badge>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-slate-900">{template.title}</h3>
                  <p className="text-sm text-slate-500">{template.description}</p>
                </div>
                <Button size="sm" className="gap-2" onClick={() => handleTemplateLaunch(template.templateId)}>
                  <Plus className="h-4 w-4" />
                  Use template
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }, [handleTemplateLaunch]);

  const settingsView = useMemo(() => {
    return (
      <div className="flex flex-1 flex-col">
        <h1 className="text-3xl font-semibold text-slate-900">Settings</h1>
        <p className="mt-2 text-slate-500">Workspace preferences and appearance.</p>
        <Card className="mt-8 max-w-xl">
          <CardContent className="space-y-4 px-6 py-5">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Theme</h3>
              <p className="text-sm text-slate-500">Dark mode is enabled by default. Light mode toggle coming soon.</p>
            </div>
            <Button variant="outline" size="sm" disabled>
              Toggle theme (soon)
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }, []);

  let content: React.ReactNode;
  switch (activeSection) {
    case "home":
      content = homeView;
      break;
    case "notebooks":
      content = notebooksView;
      break;
    case "templates":
      content = templatesView;
      break;
    case "settings":
      content = settingsView;
      break;
    default:
      content = editorView;
  }

  const activeNav = activeSection === "editor" ? "notebooks" : activeSection;

  return (
    <AppShell active={activeNav} onNavigate={handleNavigate} onNewNotebook={handleQuickCreate}>
      {content}
    </AppShell>
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
  const isCode = cell.type === "code";

  return (
    <article id={`cell-${cell.id}`} className="group/cell relative">
      <div className="absolute right-0 top-0 flex flex-col gap-2 rounded-2xl bg-white/95 p-2 text-slate-600 shadow-lg opacity-0 pointer-events-none transition group-hover/cell:opacity-100 group-hover/cell:pointer-events-auto group-focus-within/cell:opacity-100 group-focus-within/cell:pointer-events-auto">
        {isCode && (
          <Button
            variant="ghost"
            size="icon"
            className="text-brand-600 hover:text-brand-700"
            onClick={onRun}
            disabled={isRunning || !canRun}
            aria-label="Run cell"
          >
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={() => onMove("up")} aria-label="Move cell up">
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onMove("down")} aria-label="Move cell down">
          <ArrowDown className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-rose-600 hover:text-rose-600"
          onClick={onDelete}
          aria-label="Delete cell"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {isCode ? (
        <CodeCellView cell={cell} onChange={onChange} onRun={onRun} isRunning={isRunning} />
      ) : (
        <MarkdownCellView cell={cell} onChange={onChange} />
      )}

      <div className="flex justify-center pt-4 opacity-0 transition pointer-events-none group-hover/cell:opacity-100 group-hover/cell:pointer-events-auto group-focus-within/cell:opacity-100 group-focus-within/cell:pointer-events-auto">
        <AddCellMenu
          onAdd={onAddBelow}
          className="rounded-full border-slate-300/80 bg-white/95 px-4 py-1 text-xs"
        />
      </div>
    </article>
  );
};

interface MarkdownCellViewProps {
  cell: Extract<NotebookCell, { type: "markdown" }>;
  onChange: (updater: (cell: NotebookCell) => NotebookCell) => void;
}

const MarkdownCellView = ({ cell, onChange }: MarkdownCellViewProps) => {
  const html = useMemo(() => {
    const parsed = marked.parse(cell.source ?? "", { async: false });
    const rendered = typeof parsed === "string" ? parsed : "";
    return DOMPurify.sanitize(rendered);
  }, [cell.source]);

  type MarkdownUIMeta = { ui?: { edit?: boolean } };
  const isEditing = Boolean((cell.metadata as MarkdownUIMeta).ui?.edit);

  const setEdit = useCallback((edit: boolean) => {
    onChange((current) => {
      if (current.type !== "markdown") return current;
      const next: NotebookCell = {
        ...current,
        metadata: {
          ...current.metadata,
          ui: { ...(((current.metadata as MarkdownUIMeta).ui ?? {})), edit },
        },
      };
      return next;
    });
  }, [onChange]);

  const handleMount = useCallback<OnMount>((editor, monaco) => {
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => {
      editor.trigger("keyboard", "editor.action.formatDocument", undefined);
      setEdit(false);
    });
  }, [setEdit]);

  return (
    <div className="flex flex-col gap-3">
      {isEditing ? (
        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-inner">
          <div className="absolute right-2 top-2 z-10">
            <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => setEdit(false)}>
              <Check className="h-3.5 w-3.5" /> Done
            </Button>
          </div>
          <MonacoEditor
            height="220px"
            language="markdown"
            defaultLanguage="markdown"
            theme="vs"
            value={cell.source}
            onMount={handleMount}
            onChange={(value) => onChange(() => ({ ...cell, source: value ?? "" }))}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: "off",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 12, bottom: 12 },
            }}
          />
        </div>
      ) : (
        <div className="relative">
          <div className="absolute right-2 top-2 z-10">
            <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => setEdit(true)}>
              <Edit3 className="h-3.5 w-3.5" /> Edit
            </Button>
          </div>
          <div
            className="markdown-preview space-y-3 rounded-xl border border-slate-200 bg-white p-5 text-sm leading-7 text-slate-700 shadow-inner"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      )}
    </div>
  );
};

interface CodeCellViewProps {
  cell: Extract<NotebookCell, { type: "code" }>;
  onChange: (updater: (cell: NotebookCell) => NotebookCell) => void;
  onRun: () => void;
  isRunning: boolean;
}

const CodeCellView = ({ cell, onChange, onRun, isRunning }: CodeCellViewProps) => {
  const runShortcutRef = useRef(onRun);

  useEffect(() => {
    runShortcutRef.current = onRun;
  }, [onRun]);

  const handleEditorMount = useCallback<OnMount>((editor, monaco) => {
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => {
      runShortcutRef.current();
    });
  }, []);

  return (
    <div className="relative rounded-2xl bg-slate-950 text-slate-100 shadow-lg ring-1 ring-slate-900/60">
      <div className="absolute right-3 top-3 z-10">
        <Badge variant="secondary" className="px-2 py-0.5 text-[10px] tracking-wide">{cell.language.toUpperCase()}</Badge>
      </div>
      <div className="overflow-hidden rounded-2xl">
        <MonacoEditor
          height="260px"
          defaultLanguage={cell.language === "ts" ? "typescript" : "javascript"}
          language={cell.language === "ts" ? "typescript" : "javascript"}
          theme="vs-dark"
          value={cell.source}
          onChange={(value) => onChange(() => ({ ...cell, source: value ?? "" }))}
          onMount={handleEditorMount}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            readOnly: isRunning,
            padding: { top: 18, bottom: 18 },
          }}
        />
      </div>
      {cell.outputs.length > 0 && (
        <div className="space-y-2 border-t border-slate-800 bg-slate-900/60 p-4 text-sm text-emerald-100">
          {cell.outputs.map((output, index) => (
            <OutputView key={index} output={output} />
          ))}
        </div>
      )}
      <div className="flex items-center justify-end border-t border-slate-800 px-4 py-2 text-xs uppercase tracking-[0.2em] text-slate-400">
        {isRunning ? (
          <span className="flex items-center gap-2 text-amber-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Running…</span>
        ) : null}
      </div>
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

interface OutlinePanelProps {
  items: OutlineItem[];
  onSelect: (cellId: string) => void;
  activeCellId?: string;
}

const OutlinePanel = ({ items, onSelect, activeCellId }: OutlinePanelProps) => {
  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Outline</p>
        <p className="text-xs text-slate-500">Headings from Markdown cells</p>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-slate-500">Add headings to your Markdown cells to build an outline.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.id}>
              <Button
                variant="ghost"
                size="sm"
                className={clsx(
                  "w-full justify-start text-sm",
                  activeCellId === item.cellId ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-900",
                )}
                style={{ paddingLeft: 12 + (item.level - 1) * 12 }}
                onClick={() => onSelect(item.cellId)}
              >
                {item.title}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

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
        "flex items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white px-5 py-2 text-sm text-slate-600 shadow-sm",
        className,
      )}
    >
      <span className="font-medium">Add cell</span>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => onAdd("markdown")}>
        <Plus className="h-4 w-4" />
        Markdown
      </Button>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => onAdd("code")}>
        <Plus className="h-4 w-4" />
        Code
      </Button>
    </div>
  );
};

export default NotebookView;
