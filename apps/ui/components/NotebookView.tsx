"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import AppShell from "./AppShell";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card, CardContent } from "./ui/card";
import {
  Check,
  Loader2,
  Pencil,
  PlayCircle,
  Save,
  Share2,
  Trash2,
  Eraser,
  XCircle,
  Settings as SettingsIcon,
  ListTree,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createCodeCell,
  createMarkdownCell,
  type KernelExecuteRequest,
  type KernelServerMessage,
  type Notebook,
  type NotebookCell,
  type NotebookOutput,
} from "@nodebooks/notebook-schema";
import type {
  NotebookSessionSummary,
  NotebookTemplateId,
  OutlineItem,
  NotebookViewProps,
} from "./notebook/types";
import {
  formatTimestamp,
  parseMultipleDependencies,
  buildOutlineItems,
} from "./notebook/utils";
import CellCard from "./notebook/CellCard";
import AddCellMenu from "./notebook/AddCellMenu";
import OutlinePanel from "./notebook/OutlinePanel";
import SetupPanel from "./notebook/SetupPanel";
import OutputView from "./notebook/OutputView";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

const NotebookView = ({ initialNotebookId }: NotebookViewProps) => {
  const router = useRouter();
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  // list state is handled by App Router pages
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<NotebookSessionSummary | null>(null);
  const [runningCellId, setRunningCellId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [socketReady, setSocketReady] = useState(false);
  const [activeCellId, setActiveCellId] = useState<string | null>(null);
  const [sidebarView, setSidebarView] = useState<"setup" | "outline">(
    "outline"
  );
  // Navigation handled by App Router; NotebookView focuses on editor only
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "error">(
    "idle"
  );
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [depBusy, setDepBusy] = useState(false);
  const [depError, setDepError] = useState<string | null>(null);
  const [depOutputs, setDepOutputs] = useState<NotebookOutput[]>([]);
  // Request id to guard against stale async updates (ref-only)
  const depReqRef = useRef(0);
  const depAbortRef = useRef<AbortController | null>(null);
  const handleClearDepOutputs = useCallback(() => {
    setDepOutputs([]);
    setDepError(null);
    setDepBusy(false);
    depReqRef.current += 1; // invalidate in-flight responses
  }, []);

  const handleAbortInstall = useCallback(() => {
    try {
      depAbortRef.current?.abort();
    } catch {}
    setDepBusy(false);
  }, []);
  // dependency install panel is in Setup sidebar now

  const socketRef = useRef<WebSocket | null>(null);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const sessionRef = useRef<NotebookSessionSummary | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const prevNotebookIdRef = useRef<string | null>(null);

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
    if (!notebook) return;
    if (prevNotebookIdRef.current !== notebook.id) {
      setSidebarView("outline");
      prevNotebookIdRef.current = notebook.id;
    }
  }, [notebook?.id, notebook]);

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

  const closeActiveSession = useCallback(
    (reason: string) => {
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
    },
    [clearPendingSave]
  );

  const updateNotebook = useCallback(
    (
      updater: (current: Notebook) => Notebook,
      options: { persist?: boolean; touch?: boolean } = {}
    ) => {
      setNotebook((prev) => {
        if (!prev) {
          return prev;
        }
        const base = updater(prev);
        const next =
          options.touch === false
            ? base
            : { ...base, updatedAt: new Date().toISOString() };
        if (options.persist !== false && next !== prev) {
          setDirty(true);
        }
        // list summaries are handled in route pages
        return next;
      });
    },
    []
  );

  const updateNotebookCell = useCallback(
    (
      id: string,
      updater: (cell: NotebookCell) => NotebookCell,
      options?: { persist?: boolean; touch?: boolean }
    ) => {
      updateNotebook(
        (current) => ({
          ...current,
          cells: current.cells.map((cell) =>
            cell.id === id ? updater(cell) : cell
          ),
        }),
        options
      );
    },
    [updateNotebook]
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
        setRunningCellId((current) =>
          current === message.cellId ? null : current
        );
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
          { persist: false }
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
              outputs: [
                ...cell.outputs,
                { type: "stream", name: message.name, text: message.text },
              ],
            };
          },
          { persist: false, touch: false }
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
          { persist: false }
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
          { persist: false }
        );
      }
    },
    [updateNotebookCell]
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
        setDirty(false);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save notebook");
    }
  }, [notebook]);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/notebooks`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(
            `Failed to load notebooks (status ${response.status})`
          );
        }
        const payload = await response.json();
        const notebooks: Notebook[] = Array.isArray(payload?.data)
          ? payload.data
          : [];

        let initial: Notebook | undefined =
          notebooks.find((n) => n.id === initialNotebookId) ?? notebooks[0];

        if (!initial) {
          const created = await fetch(`${API_BASE_URL}/notebooks`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ template: "starter" }),
            signal: controller.signal,
          });
          if (!created.ok) {
            throw new Error(
              `Failed to create notebook (status ${created.status})`
            );
          }
          const createdPayload = await created.json();
          initial = createdPayload.data;
        }

        if (!controller.signal.aborted) {
          if (!initial && initialNotebookId) {
            // Try to fetch the requested id directly
            const res = await fetch(
              `${API_BASE_URL}/notebooks/${initialNotebookId}`,
              { signal: controller.signal }
            );
            if (res.ok) {
              const p = await res.json();
              initial = p?.data;
            }
          }
          if (initial) {
            setNotebook(initial);
            setDirty(false);
            setError(null);
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load notebooks from the API"
          );
          setNotebook(null);
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
  }, [initialNotebookId]);

  useEffect(() => {
    if (!notebookId) {
      return;
    }

    let cancelled = false;
    const openSession = async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/notebooks/${notebookId}/sessions`,
          {
            method: "POST",
          }
        );
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
          setError(
            err instanceof Error ? err.message : "Unable to open a session"
          );
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

  // Notebook selection/navigation handled by router pages

  const handleCreateNotebook = useCallback(
    async (template: NotebookTemplateId = "starter") => {
      try {
        const response = await fetch(`${API_BASE_URL}/notebooks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template }),
        });
        if (!response.ok) {
          throw new Error(
            `Failed to create notebook (status ${response.status})`
          );
        }
        const payload = await response.json();
        const created: Notebook | undefined = payload?.data;
        if (created) {
          router.push(`/notebooks/${created.id}`);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Unable to create a new notebook"
        );
      }
    },
    [router]
  );

  const handleCellChange = useCallback(
    (id: string, updater: (cell: NotebookCell) => NotebookCell) => {
      updateNotebookCell(id, updater);
    },
    [updateNotebookCell]
  );

  const handleAddCell = useCallback(
    (type: NotebookCell["type"], index?: number) => {
      const nextCell =
        type === "code"
          ? createCodeCell({ language: "ts" })
          : createMarkdownCell({ source: "" });
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
    [updateNotebook]
  );

  const handleDeleteCell = useCallback(
    (id: string) => {
      updateNotebook((current) => ({
        ...current,
        cells: current.cells.filter((cell) => cell.id !== id),
      }));
    },
    [updateNotebook]
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
    [updateNotebook]
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
        { persist: false }
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
    [notebook, updateNotebookCell, runningCellId]
  );

  const handleInstallDependencyInline = useCallback(
    async (raw: string) => {
      if (!notebook) return;

      const items = parseMultipleDependencies(raw);
      if (items.length === 0) {
        setDepError(
          "Enter dependencies like react or react@18.2.0, comma separated"
        );
        return;
      }

      setDepBusy(true);
      setDepError(null);
      setDepOutputs([]);
      depReqRef.current += 1;
      const req = depReqRef.current;

      try {
        // Install sequentially
        for (const item of items) {
          const controller = new AbortController();
          depAbortRef.current = controller;
          const res = await fetch(
            `${API_BASE_URL}/notebooks/${notebook.id}/dependencies`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: item.name, version: item.version }),
              signal: controller.signal,
            }
          );
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) {
            const message = payload?.error || `Failed to add ${item.name}`;
            throw new Error(message);
          }
          const nextEnv = payload?.data?.env as Notebook["env"] | undefined;
          const outputs = (payload?.data?.outputs ?? []) as NotebookOutput[];
          if (req === depReqRef.current && nextEnv) {
            updateNotebook((current) => ({ ...current, env: nextEnv }), {
              persist: false,
            });
          }
          if (req === depReqRef.current) {
            setDepOutputs((prev) => [...prev, ...outputs]);
          }
        }
        // success: inputs live in Setup sidebar; nothing to reset here
      } catch (err) {
        const isAbort =
          typeof err === "object" &&
          err !== null &&
          "name" in err &&
          (err as Record<string, unknown>).name === "AbortError";
        if (isAbort) {
          setDepError(null);
          setDepOutputs([]);
        } else {
          setDepError(
            err instanceof Error ? err.message : "Failed to add dependency"
          );
        }
      } finally {
        setDepBusy((prev) => (req === depReqRef.current ? false : prev));
        depAbortRef.current = null;
      }
    },
    [notebook, updateNotebook]
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
    [handleRenameCommit, handleRenameCancel]
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

  const handleClearAllOutputs = useCallback(() => {
    updateNotebook((current) => ({
      ...current,
      cells: current.cells.map((cell) =>
        cell.type === "code"
          ? { ...cell, outputs: [], execution: undefined }
          : cell
      ),
    }));
  }, [updateNotebook]);

  const handleDeleteNotebook = useCallback(
    async (id?: string) => {
      const targetId = id ?? notebook?.id;
      if (!targetId) return;
      try {
        const res = await fetch(`${API_BASE_URL}/notebooks/${targetId}`, {
          method: "DELETE",
        });
        if (!res.ok)
          throw new Error(`Failed to delete notebook (status ${res.status})`);
        if (notebook?.id === targetId) {
          router.push(`/notebooks`);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to delete notebook"
        );
      }
    },
    [notebook?.id, router]
  );

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

  const handleRemoveDependency = useCallback(
    async (name: string) => {
      if (!notebook) return;
      const trimmedName = name.trim();
      if (!trimmedName) return;
      try {
        const res = await fetch(
          `${API_BASE_URL}/notebooks/${notebook.id}/dependencies/${encodeURIComponent(
            trimmedName
          )}`,
          { method: "DELETE" }
        );
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          const message = payload?.error || `Failed to remove ${trimmedName}`;
          throw new Error(message);
        }
        const payload = await res.json();
        const nextEnv = payload?.data?.env;
        if (nextEnv) {
          updateNotebook((current) => ({ ...current, env: nextEnv }), {
            persist: false,
          });
          setDirty(false);
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : `Failed to remove dependency ${trimmedName}`
        );
      }
    },
    [notebook, updateNotebook]
  );

  const handleAddVariable = useCallback(
    (name: string, value: string) => {
      const key = name.trim();
      if (!notebook || !key) return;
      updateNotebook((current) => ({
        ...current,
        env: {
          ...current.env,
          variables: { ...current.env.variables, [key]: String(value) },
        },
      }));
    },
    [notebook, updateNotebook]
  );

  const handleRemoveVariable = useCallback(
    (name: string) => {
      if (!notebook) return;
      const key = name.trim();
      if (!key) return;
      updateNotebook((current) => {
        const nextVars = { ...current.env.variables } as Record<string, string>;
        delete nextVars[key];
        return { ...current, env: { ...current.env, variables: nextVars } };
      });
    },
    [notebook, updateNotebook]
  );

  const handleOutlineJump = useCallback((cellId: string) => {
    if (typeof document === "undefined") {
      return;
    }
    const element = document.getElementById(`cell-${cellId}`);
    element?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const outlineItems = useMemo<OutlineItem[]>(
    () => buildOutlineItems(notebook),
    [notebook]
  );

  const notebookHeader = useMemo(() => {
    if (!notebook) {
      return "";
    }
    return formatTimestamp(notebook.updatedAt);
  }, [notebook]);

  const editorView = useMemo(() => {
    if (loading) {
      return (
        <div className="flex flex-1 items-center justify-center p-10">
          <Card className="w-full max-w-md text-center">
            <CardContent className="py-10 text-slate-600">
              Loading notebook…
            </CardContent>
          </Card>
        </div>
      );
    }

    if (!notebook) {
      return (
        <div className="flex flex-1 items-center justify-center p-10">
          <Card className="w-full max-w-md text-center">
            <CardContent className="space-y-3 py-10">
              <p className="text-lg font-semibold text-slate-700">
                Select a notebook to begin.
              </p>
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
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              Notebook
            </div>
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
                <span
                  className={clsx(
                    "h-2 w-2 rounded-full",
                    socketReady ? "bg-emerald-500" : "bg-amber-500"
                  )}
                />
                {socketReady ? "Kernel connected" : "Kernel connecting"}
              </span>
              <span className="flex items-center gap-2">
                <span
                  className={clsx(
                    "h-2 w-2 rounded-full",
                    dirty ? "bg-amber-500" : "bg-emerald-500"
                  )}
                />
                {dirty ? "Unsaved changes" : "Saved"}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="uppercase tracking-[0.2em]">
              {notebook.env.runtime.toUpperCase()} {notebook.env.version}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClearAllOutputs}
              aria-label="Clear all outputs"
            >
              <Eraser className="h-4 w-4" />
            </Button>
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
              {dirty ? (
                <Save className="h-4 w-4" />
              ) : (
                <Check className="h-4 w-4 text-emerald-500" />
              )}
            </Button>
            <Button
              variant={shareStatus === "error" ? "destructive" : "ghost"}
              size="icon"
              onClick={handleShare}
              aria-label={
                shareStatus === "copied"
                  ? "Notebook link copied"
                  : "Share notebook"
              }
            >
              {shareStatus === "copied" ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : (
                <Share2 className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-rose-600 hover:text-rose-700"
              onClick={() => handleDeleteNotebook()}
              aria-label="Delete notebook"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 bg-muted/20 px-2 py-2">
            {error && (
              <Card className="mb-6 border-rose-200 bg-rose-50">
                <CardContent className="text-sm text-rose-700">
                  {error}
                </CardContent>
              </Card>
            )}
            {/* Installation output shown at the top of the notebook */}
            {(depBusy || depOutputs.length > 0 || depError) && (
              <div className="mb-4 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Install output
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-slate-600 hover:text-slate-900"
                      onClick={handleClearDepOutputs}
                      disabled={
                        !depBusy && depOutputs.length === 0 && !depError
                      }
                      aria-label="Clear outputs"
                    >
                      <Eraser className="h-4 w-4" />
                    </Button>
                    {depBusy && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-rose-600 hover:text-rose-700"
                        onClick={handleAbortInstall}
                        aria-label="Abort install"
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="mt-2 space-y-2 rounded-md border border-slate-200 bg-slate-950 p-2 text-[13px] text-slate-100">
                  {depBusy && depOutputs.length === 0 ? (
                    <div className="flex items-center gap-2 text-slate-300/80">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparing
                      environment…
                    </div>
                  ) : null}
                  {depOutputs.map((output, index) => (
                    <OutputView key={index} output={output} />
                  ))}
                </div>
                {depError ? (
                  <p className="mt-2 text-[11px] text-rose-500">{depError}</p>
                ) : null}
              </div>
            )}
            {/* dependency form moved to Setup sidebar */}

            <div className="space-y-4">
              {notebook.cells.map((cell, index) => (
                <CellCard
                  key={cell.id}
                  cell={cell}
                  isRunning={runningCellId === cell.id}
                  canRun={socketReady}
                  canMoveUp={index > 0}
                  canMoveDown={index < notebook.cells.length - 1}
                  editorKey={`${cell.id}:${index}`}
                  active={activeCellId === cell.id}
                  onActivate={() => setActiveCellId(cell.id)}
                  onChange={(updater) => handleCellChange(cell.id, updater)}
                  onDelete={() => handleDeleteCell(cell.id)}
                  onRun={() => handleRunCell(cell.id)}
                  onMove={(direction) => handleMoveCell(cell.id, direction)}
                  onAddBelow={(type) => handleAddCell(type, index + 1)}
                />
              ))}
            </div>
            <div className="mt-2 mb-2 flex justify-center py-3 opacity-0 transition hover:opacity-100 focus-within:opacity-100">
              <AddCellMenu
                onAdd={(type) => handleAddCell(type)}
                className="pointer-events-auto text-[11px]"
              />
            </div>
          </div>
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
    handleClearAllOutputs,
    handleRunAll,
    handleSaveNow,
    handleShare,
    handleDeleteNotebook,
    shareStatus,
    error,
    runningCellId,
    handleCellChange,
    handleDeleteCell,
    handleRunCell,
    handleMoveCell,
    handleAddCell,
    activeCellId,
    // Install output block
    depBusy,
    depError,
    depOutputs,
    handleClearDepOutputs,
    handleAbortInstall,
  ]);

  const secondaryHeader = useMemo(() => {
    if (!notebook) return null;
    return (
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={clsx(
            "rounded-full px-3 text-xs font-semibold",
            sidebarView === "outline"
              ? "bg-slate-900 text-white hover:bg-slate-800"
              : "text-slate-500 hover:text-slate-900"
          )}
          onClick={() => setSidebarView("outline")}
        >
          <span className="inline-flex items-center gap-1">
            <ListTree className="h-4 w-4" /> Outline
          </span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={clsx(
            "rounded-full px-3 text-xs font-semibold",
            sidebarView === "setup"
              ? "bg-slate-900 text-white hover:bg-slate-800"
              : "text-slate-500 hover:text-slate-900"
          )}
          onClick={() => setSidebarView("setup")}
        >
          <span className="inline-flex items-center gap-1">
            <SettingsIcon className="h-4 w-4" /> Setup
          </span>
        </Button>
      </div>
    );
  }, [notebook, sidebarView]);

  const secondarySidebar = useMemo(() => {
    if (!notebook) return null;
    return (
      <div className="h-full overflow-hidden">
        {sidebarView === "setup" ? (
          <SetupPanel
            env={notebook.env}
            onRemoveDependency={handleRemoveDependency}
            onAddDependencies={(raw) => handleInstallDependencyInline(raw)}
            depBusy={depBusy}
            onAddVariable={handleAddVariable}
            onRemoveVariable={handleRemoveVariable}
          />
        ) : (
          <OutlinePanel
            items={outlineItems}
            onSelect={handleOutlineJump}
            activeCellId={runningCellId ?? undefined}
          />
        )}
      </div>
    );
  }, [
    notebook,
    sidebarView,
    outlineItems,
    handleOutlineJump,
    runningCellId,
    handleRemoveDependency,
    depBusy,
    handleInstallDependencyInline,
    handleAddVariable,
    handleRemoveVariable,
  ]);

  return (
    <AppShell
      title={notebook?.name ?? "Notebook"}
      onNewNotebook={() => void handleCreateNotebook()}
      secondarySidebar={secondarySidebar}
      defaultCollapsed
      secondaryHeader={secondaryHeader}
    >
      {editorView}
    </AppShell>
  );
};

export default NotebookView;
