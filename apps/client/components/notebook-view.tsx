"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import AppShell from "@/components/app-shell";
import ConfirmDialog from "@/components/ui/confirm";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createCodeCell,
  createMarkdownCell,
  createCommandCell,
  createTerminalCell,
  createHttpCell,
  createSqlCell,
  type HttpResponse,
  type KernelExecuteRequest,
  type KernelServerMessage,
  type KernelInterruptRequest,
  type Notebook,
  type NotebookCell,
  type NotebookOutput,
  type SqlConnection,
  type SqlResult,
} from "@nodebooks/notebook-schema";
import type {
  NotebookSessionSummary,
  NotebookTemplateId,
  NotebookWithAccess,
  NotebookRole,
  OutlineItem,
  NotebookViewProps,
} from "@/components/notebook/types";
import {
  parseMultipleDependencies,
  buildOutlineItems,
} from "@/components/notebook/utils";
import OutlinePanel from "@/components/notebook/outline-panel";
import SetupPanel from "@/components/notebook/setup-panel";
import AttachmentsPanel from "@/components/notebook/attachments-panel";
import { syncNotebookContext } from "@/components/notebook/monaco-context-sync";
import { setDiagnosticPolicy } from "@/components/notebook/monaco-setup";
import { useTheme } from "@/components/theme-context";
import NotebookEditorView from "@/components/notebook/notebook-editor-view";
import NotebookHeaderMain from "@/components/notebook/notebook-header-main";
import NotebookHeaderRight from "@/components/notebook/notebook-header-right";
import NotebookSecondaryHeader from "@/components/notebook/notebook-secondary-header";
import NotebookSharingDialog from "@/components/notebook/notebook-sharing-dialog";
import PublishDialog from "@/components/notebook/publish-dialog";
import {
  API_BASE_URL,
  publishNotebook,
  unpublishNotebook,
} from "@/components/notebook/api";
import { Badge } from "@/components/ui/badge";
import { useCurrentUser } from "@/components/notebook/hooks/use-current-user";
import { useNotebookAttachments } from "@/components/notebook/hooks/use-notebook-attachments";
import { useNotebookSharing } from "@/components/notebook/hooks/use-notebook-sharing";
import { gravatarUrlForEmail } from "@/lib/avatar";
import { suggestSlug } from "@nodebooks/notebook-schema";

const normalizeNotebookState = (
  raw: Notebook | NotebookWithAccess | null | undefined
): { notebook: Notebook | null; role?: NotebookRole } => {
  if (!raw) {
    return { notebook: null, role: undefined };
  }
  const { accessRole, ...rest } = raw as NotebookWithAccess;
  return { notebook: rest as Notebook, role: accessRole };
};

const SQL_IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

type CommandCellMetadata = {
  terminalTargetId?: string;
};

const NotebookView = ({ initialNotebookId }: NotebookViewProps) => {
  const { theme } = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  // list state is handled by App Router pages
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<NotebookSessionSummary | null>(null);
  const [runningCellId, setRunningCellId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [socketReady, setSocketReady] = useState(false);
  const [activeCellId, setActiveCellId] = useState<string | null>(null);
  const [runQueue, setRunQueue] = useState<string[]>([]);
  const [sidebarView, setSidebarView] = useState<
    "outline" | "attachments" | "setup"
  >("outline");
  // Navigation handled by App Router; NotebookView focuses on editor only
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [depBusy, setDepBusy] = useState(false);
  const [depError, setDepError] = useState<string | null>(null);
  const [depOutputs, setDepOutputs] = useState<NotebookOutput[]>([]);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [terminalCellsEnabled, setTerminalCellsEnabled] = useState(false);
  const [socketGeneration, bumpSocketGeneration] = useReducer(
    (current: number) => current + 1,
    0
  );
  const [confirmClearOutputsOpen, setConfirmClearOutputsOpen] = useState(false);
  const [confirmRestartOpen, setConfirmRestartOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingTerminalIds, setPendingTerminalIds] = useState<Set<string>>(
    new Set<string>()
  );
  const [notebookAccessRole, setNotebookAccessRole] =
    useState<NotebookRole>("viewer");
  const [projectNav, setProjectNav] = useState<{
    id: string;
    name: string;
    slug: string | null;
    published: boolean;
    notebooks: NotebookWithAccess[];
  } | null>(null);
  const [projectNavLoading, setProjectNavLoading] = useState(false);
  const [projectNavError, setProjectNavError] = useState<string | null>(null);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishSubmitting, setPublishSubmitting] = useState(false);
  const [publishDialogError, setPublishDialogError] = useState<string | null>(
    null
  );
  const [unpublishConfirmOpen, setUnpublishConfirmOpen] = useState(false);
  const [unpublishSubmitting, setUnpublishSubmitting] = useState(false);
  const collabSocketRef = useRef<WebSocket | null>(null);
  const suppressCollabBroadcastRef = useRef(false);
  const activeCellIdRef = useRef<string | null>(null);
  const {
    currentUser,
    setCurrentUser,
    loading: currentUserLoading,
    isAdmin,
  } = useCurrentUser();
  const {
    attachments,
    loading: attachmentsLoading,
    error: attachmentsError,
    handleAttachmentUploaded,
    handleDeleteAttachment,
  } = useNotebookAttachments(notebook?.id);
  const {
    sharingOpen,
    invitationEmail,
    invitationRole,
    invitationError,
    shareFetchError,
    shareSubmitting,
    invitesLoading,
    newInviteLink,
    copySuccess,
    revokingInvitationId,
    updatingCollaboratorId,
    removingCollaboratorId,
    sortedCollaborators,
    sortedInvitations,
    handleOpenSharing,
    handleInviteSubmit,
    handleSharingOpenChange,
    handleCopyInviteLink,
    handleRevokeInvitation,
    handleUpdateCollaboratorRole,
    handleRemoveCollaborator,
    setInvitationEmail,
    setInvitationRole,
  } = useNotebookSharing({ isAdmin, notebookId: notebook?.id });

  const canEditNotebook = isAdmin || notebookAccessRole === "editor";
  const isViewer = !isAdmin && notebookAccessRole === "viewer";
  const readOnlyMessage = isViewer
    ? "You only have read-only access to this notebook."
    : "Only workspace admins can edit notebooks.";

  const ensureEditable = useCallback(() => {
    if (!canEditNotebook) {
      setActionError(readOnlyMessage);
      return false;
    }
    return true;
  }, [canEditNotebook, readOnlyMessage]);

  const publishSlugSuggestion = useMemo(() => {
    if (!notebook) {
      return null;
    }
    const suggestion = suggestSlug(notebook.name, notebook.id);
    return suggestion ?? null;
  }, [notebook]);

  const publishHref = useMemo(() => {
    if (!notebook || !notebook.published) {
      return null;
    }
    if (
      notebook.projectId &&
      projectNav &&
      projectNav.id === notebook.projectId &&
      projectNav.slug
    ) {
      const slugPart = notebook.publicSlug ?? notebook.id;
      return `/v/${encodeURIComponent(projectNav.slug)}/${encodeURIComponent(slugPart)}`;
    }
    const identifier = notebook.publicSlug ?? notebook.id;
    return `/v/${encodeURIComponent(identifier)}`;
  }, [notebook, projectNav]);

  const safeDeleteAttachment = useCallback(
    async (attachmentId: string) => {
      if (!ensureEditable()) {
        return;
      }
      await handleDeleteAttachment(attachmentId);
    },
    [ensureEditable, handleDeleteAttachment]
  );

  useEffect(() => {
    if (isAdmin) {
      setNotebookAccessRole("editor");
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isViewer && sidebarView !== "outline") {
      setSidebarView("outline");
    }
  }, [isViewer, sidebarView]);

  const handleSidebarChange = useCallback(
    (next: "outline" | "attachments" | "setup") => {
      if (isViewer && next !== "outline") {
        return;
      }
      setSidebarView(next);
    },
    [isViewer]
  );

  const handleOpenPublishDialog = useCallback(() => {
    if (!isAdmin) {
      setActionError("Only workspace admins can publish notebooks.");
      return;
    }
    setPublishDialogError(null);
    setPublishDialogOpen(true);
  }, [isAdmin]);

  const handlePublishNotebookSubmit = useCallback(
    async (slug: string | null) => {
      if (!notebook) {
        return;
      }
      setPublishSubmitting(true);
      setPublishDialogError(null);
      try {
        const updated = await publishNotebook(notebook.id, slug ?? undefined);
        setNotebook((prev) => {
          if (!prev || prev.id !== updated.id) {
            notebookRef.current = updated;
            return updated;
          }
          const merged: Notebook = {
            ...prev,
            ...updated,
            cells: prev.cells,
          };
          notebookRef.current = merged;
          return merged;
        });
        setProjectNav((prev) => {
          if (!prev || !notebook.projectId || prev.id !== notebook.projectId) {
            return prev;
          }
          return {
            ...prev,
            notebooks: prev.notebooks.map((item) =>
              item.id === updated.id ? { ...item, ...updated } : item
            ),
          };
        });
        setPublishDialogOpen(false);
        setActionError(null);
      } catch (error) {
        setPublishDialogError(
          error instanceof Error ? error.message : "Failed to publish notebook"
        );
      } finally {
        setPublishSubmitting(false);
      }
    },
    [notebook]
  );

  const handleOpenUnpublishDialog = useCallback(() => {
    if (!isAdmin) {
      setActionError("Only workspace admins can unpublish notebooks.");
      return;
    }
    setUnpublishConfirmOpen(true);
  }, [isAdmin]);

  const handleConfirmUnpublish = useCallback(async () => {
    if (!notebook) {
      return;
    }
    setUnpublishSubmitting(true);
    setActionError(null);
    try {
      const updated = await unpublishNotebook(notebook.id);
      setNotebook((prev) => {
        if (!prev || prev.id !== updated.id) {
          notebookRef.current = updated;
          return updated;
        }
        const merged: Notebook = {
          ...prev,
          ...updated,
          cells: prev.cells,
        };
        notebookRef.current = merged;
        return merged;
      });
      setProjectNav((prev) => {
        if (!prev || !notebook.projectId || prev.id !== notebook.projectId) {
          return prev;
        }
        return {
          ...prev,
          notebooks: prev.notebooks.map((item) =>
            item.id === updated.id ? { ...item, ...updated } : item
          ),
        };
      });
      setUnpublishConfirmOpen(false);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to unpublish notebook"
      );
    } finally {
      setUnpublishSubmitting(false);
    }
  }, [notebook]);

  const notebookId = notebook?.id;
  const sessionId = session?.id;

  const handleProjectNotebookNavigate = useCallback(
    (targetId: string) => {
      if (!notebookId || targetId === notebookId) {
        return;
      }
      router.push(`/notebooks/${targetId}`);
    },
    [router, notebookId]
  );

  const markTerminalPendingPersistence = useCallback((cellId: string) => {
    setPendingTerminalIds((prev) => {
      if (prev.has(cellId)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(cellId);
      return next;
    });
  }, []);

  const removeTerminalPendingPersistence = useCallback((cellId: string) => {
    setPendingTerminalIds((prev) => {
      if (!prev.has(cellId)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(cellId);
      return next;
    });
  }, []);

  const resolveTerminalPendingPersistence = useCallback((cellIds: string[]) => {
    if (cellIds.length === 0) {
      return;
    }
    setPendingTerminalIds((prev) => {
      let needsUpdate = false;
      for (const id of cellIds) {
        if (prev.has(id)) {
          needsUpdate = true;
          break;
        }
      }
      if (!needsUpdate) {
        return prev;
      }
      const next = new Set(prev);
      for (const id of cellIds) {
        next.delete(id);
      }
      return next;
    });
  }, []);

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
  const handleServerMessageRef = useRef<(message: KernelServerMessage) => void>(
    () => undefined
  );
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const sessionRef = useRef<NotebookSessionSummary | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const prevNotebookIdRef = useRef<string | null>(null);
  const notebookRef = useRef<Notebook | null>(null);
  // Counter for "In [n]" execution labels
  const runCounterRef = useRef<number>(0);
  // Track which cell ids are pending an execution completion to avoid
  // double-increment when messages duplicate (e.g., dev StrictMode, reconnects)
  const runPendingRef = useRef<Set<string>>(new Set());
  // Immediate view of currently-running cell to avoid setState race during bursts
  const runningRef = useRef<string | null>(null);

  const runQueueRef = useRef<string[]>([]);
  useEffect(() => {
    runQueueRef.current = runQueue;
  }, [runQueue]);

  // Keep a ref to the latest notebook without triggering renders
  useEffect(() => {
    notebookRef.current = notebook ?? null;
  }, [notebook]);

  // Reset rename UI only when the notebook name changes
  useEffect(() => {
    if (notebook?.name) {
      setRenameDraft(notebook.name);
    } else {
      setRenameDraft("");
    }
    setIsRenaming(false);
    if (notebook?.name) {
      setProjectNav((prev) => {
        if (!prev || notebook.projectId !== prev.id) {
          return prev;
        }
        const updated = prev.notebooks.map((item) =>
          item.id === notebook.id ? { ...item, name: notebook.name } : item
        );
        return { ...prev, notebooks: updated };
      });
    }
  }, [notebook?.name, notebook?.projectId, notebook?.id]);

  useEffect(() => {
    setActionError(null);
  }, [notebook?.id, currentUser?.id]);

  useEffect(() => {
    setPendingTerminalIds(new Set());
  }, [notebook?.id, currentUser?.id]);

  const refreshNotebookFeatures = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/settings`, {
        cache: "no-store",
      });
      if (response.status === 403) {
        setAiEnabled(false);
        setTerminalCellsEnabled(false);
        return;
      }
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      const payload = await response.json();
      const aiAvailable =
        typeof payload?.data?.aiEnabled === "boolean"
          ? payload.data.aiEnabled
          : false;
      const terminalsAvailable =
        typeof payload?.data?.terminalCellsEnabled === "boolean"
          ? payload.data.terminalCellsEnabled
          : false;
      setAiEnabled(aiAvailable);
      setTerminalCellsEnabled(terminalsAvailable);
    } catch (error) {
      console.error("Failed to load notebook feature availability", error);
    }
  }, []);

  useEffect(() => {
    void refreshNotebookFeatures();
  }, [refreshNotebookFeatures]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handleFocus = () => {
      void refreshNotebookFeatures();
    };
    const handleVisibility = () => {
      if (!document.hidden) {
        void refreshNotebookFeatures();
      }
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refreshNotebookFeatures]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    if (!notebook?.name) {
      document.title = "NodeBooks";
      return;
    }
    document.title = `${notebook.name} · NodeBooks`;
  }, [notebook?.name]);

  // Diagnostics policy via URL param: types=off|ignore|full (default: off)
  useEffect(() => {
    const mode = searchParams?.get("types");
    if (mode === "off") setDiagnosticPolicy({ mode: "off" });
    else if (mode === "full") setDiagnosticPolicy({ mode: "full" });
    else if (mode === "ignore") setDiagnosticPolicy({ mode: "ignore-list" });
    else setDiagnosticPolicy({ mode: "off" });
  }, [searchParams]);

  // Keep Monaco context in sync with the notebook (globals, models, module shims)
  useEffect(() => {
    if (!notebook) return;
    // Prefer running cell as current, else active editor
    const current = runningCellId ?? activeCellId ?? null;
    syncNotebookContext({
      notebookId: notebook.id,
      cells: notebook.cells,
      currentCellId: current,
    });
  }, [notebook, activeCellId, runningCellId]);

  // Re-sync once Monaco becomes ready (first editor mount)
  useEffect(() => {
    const handler = () => {
      if (!notebook) return;
      const current = runningCellId ?? activeCellId ?? null;
      syncNotebookContext({
        notebookId: notebook.id,
        cells: notebook.cells,
        currentCellId: current,
      });
    };
    if (typeof window !== "undefined") {
      window.addEventListener("nodebooks:monaco-ready", handler);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("nodebooks:monaco-ready", handler);
      }
    };
  }, [notebook, activeCellId, runningCellId]);

  useEffect(() => {
    if (!notebook?.id) return;
    if (prevNotebookIdRef.current !== notebook.id) {
      setSidebarView("outline");
      prevNotebookIdRef.current = notebook.id;
      // New session, start counter from 1 regardless of persisted counts
      runCounterRef.current = 0;
      runPendingRef.current.clear();
    }
  }, [notebook?.id, currentUser?.id]);

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

  const broadcastNotebookUpdate = useCallback((next: Notebook) => {
    const socket = collabSocketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      socket.send(
        JSON.stringify({
          type: "update",
          notebook: next,
        })
      );
    } catch {
      // ignore broadcast failures
    }
  }, []);

  const updateNotebook = useCallback(
    (
      updater: (current: Notebook) => Notebook,
      options: { persist?: boolean; touch?: boolean } = {}
    ): Notebook | undefined => {
      const prev = notebookRef.current;
      if (!prev) {
        return undefined;
      }
      const base = updater(prev);
      const next =
        options.touch === false
          ? base
          : { ...base, updatedAt: new Date().toISOString() };
      if (options.persist !== false && next !== prev) {
        setDirty(true);
      }
      notebookRef.current = next;
      setNotebook(next);
      if (!suppressCollabBroadcastRef.current && next !== prev) {
        broadcastNotebookUpdate(next);
      }
      // list summaries are handled in route pages
      return next;
    },
    [broadcastNotebookUpdate]
  );

  const saveNotebookNow = useCallback(
    async (
      options: {
        resolveTerminalIds?: string[];
        notebookSnapshot?: Notebook;
      } = {}
    ) => {
      const current = options.notebookSnapshot ?? notebookRef.current;
      if (!current) {
        return;
      }
      const resolveTerminalIds =
        options.resolveTerminalIds ?? Array.from(pendingTerminalIds);
      try {
        const response = await fetch(
          `${API_BASE_URL}/notebooks/${current.id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: current.name,
              env: current.env,
              cells: current.cells,
            }),
          }
        );
        if (!response.ok) {
          throw new Error(
            `Failed to save notebook (status ${response.status})`
          );
        }
        const payload = await response.json();
        const saved: Notebook | undefined = payload?.data;
        if (saved) {
          setNotebook((prev) => {
            if (!prev || prev.id !== saved.id) {
              notebookRef.current = saved;
              return saved;
            }
            const merged: Notebook = {
              ...saved,
              cells: prev.cells,
            };
            notebookRef.current = merged;
            return merged;
          });
          setDirty(false);
          setError(null);
          if (resolveTerminalIds.length > 0) {
            const terminalIdsOnServer = new Set(
              saved.cells
                .filter((cell) => cell.type === "terminal")
                .map((cell) => cell.id)
            );
            const missing = resolveTerminalIds.filter(
              (id) => !terminalIdsOnServer.has(id)
            );
            if (missing.length === 0) {
              resolveTerminalPendingPersistence(resolveTerminalIds);
              setActionError(null);
            } else {
              const resolved = resolveTerminalIds.filter((id) =>
                terminalIdsOnServer.has(id)
              );
              if (resolved.length > 0) {
                resolveTerminalPendingPersistence(resolved);
              }
              setActionError(
                "Terminal cell is still syncing. Please try again."
              );
            }
          }
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to save notebook"
        );
      }
    },
    [pendingTerminalIds, resolveTerminalPendingPersistence]
  );

  const scheduleAutoSave = useCallback(
    ({
      delay = 300,
      markDirty = false,
    }: { delay?: number; markDirty?: boolean } = {}) => {
      if (markDirty) {
        setDirty(true);
      }
      clearPendingSave();
      const timer = setTimeout(() => {
        saveTimerRef.current = null;
        void saveNotebookNow();
      }, delay);
      saveTimerRef.current = timer;
    },
    [clearPendingSave, saveNotebookNow]
  );

  const updateNotebookCell = useCallback(
    (
      id: string,
      updater: (cell: NotebookCell) => NotebookCell,
      options: { persist?: boolean; touch?: boolean } = {}
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

      if (options.persist) {
        scheduleAutoSave({ markDirty: true });
      }
    },
    [updateNotebook, scheduleAutoSave]
  );

  const handleServerMessage = useCallback(
    (message: KernelServerMessage) => {
      if (message.type === "hello") {
        // Fresh kernel session: reset display counter and pending set
        runCounterRef.current = 0;
        runPendingRef.current.clear();
        // Clear any queued runs on fresh session
        setRunQueue([]);
        return;
      }
      if (message.type === "status") {
        if (message.state === "idle") {
          setRunningCellId(null);
          runningRef.current = null;
        }
        return;
      }
      if (message.type === "execute_reply") {
        setRunningCellId((current) =>
          current === message.cellId ? null : current
        );
        if (runningRef.current === message.cellId) {
          runningRef.current = null;
        }
        updateNotebookCell(
          message.cellId,
          (cell) => {
            if (cell.type !== "code") {
              return cell;
            }
            const ended = Date.now();
            const prevDisplay = ((
              cell.metadata as { display?: Record<string, unknown> }
            ).display ?? {}) as Record<string, unknown>;
            const hadPending = runPendingRef.current.delete(message.cellId);
            // Always assign an execution count on reply. Only bump the global
            // counter when we know this reply corresponds to a locally-started run.
            // Preserve existing execCount if present (avoid duplicate messages
            // overriding the initial count). Otherwise assign the next value.
            let execCount = (prevDisplay as { execCount?: number }).execCount;
            if (typeof execCount !== "number") {
              execCount = runCounterRef.current;
              if (hadPending) {
                runCounterRef.current += 1;
              }
            }
            return {
              ...cell,
              metadata: {
                ...cell.metadata,
                display: { ...prevDisplay, execCount },
              },
              execution: {
                started: ended - message.execTimeMs,
                ended,
                status: message.status,
              },
            };
          },
          { persist: false }
        );
        scheduleAutoSave({ markDirty: true });
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
        // Ensure UI does not stay stuck in Running on kernel errors
        // Clear running state even if cellId is missing (server-level errors)
        setRunningCellId(null);
        if (runningRef.current === message.cellId) {
          runningRef.current = null;
        }
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
            const metadata: Record<string, unknown> = {
              ...(message.metadata ?? {}),
            };
            const metaId =
              typeof metadata["display_id"] === "string"
                ? (metadata["display_id"] as string)
                : undefined;
            const outputType: NotebookOutput["type"] =
              message.type === "update_display_data"
                ? "display_data"
                : message.type;
            if (metaId) {
              metadata["display_id"] = metaId;
            }
            const nextOutput: NotebookOutput = {
              type: outputType,
              data: message.data,
              metadata,
            };
            if (metaId) {
              const existingIndex = cell.outputs.findIndex((existing) => {
                if (
                  existing.type === "display_data" ||
                  existing.type === "execute_result" ||
                  existing.type === "update_display_data"
                ) {
                  const existingId =
                    typeof existing.metadata?.["display_id"] === "string"
                      ? (existing.metadata?.["display_id"] as string)
                      : undefined;
                  return existingId === metaId;
                }
                return false;
              });
              if (existingIndex >= 0) {
                const outputs = cell.outputs.slice();
                outputs[existingIndex] = nextOutput;
                return {
                  ...cell,
                  outputs,
                };
              }
            }
            return {
              ...cell,
              outputs: [...cell.outputs, nextOutput],
            };
          },
          { persist: false }
        );
      }
    },
    [updateNotebookCell, scheduleAutoSave]
  );

  useEffect(() => {
    handleServerMessageRef.current = handleServerMessage;
  }, [handleServerMessage]);

  useEffect(() => {
    return () => {
      const socket = collabSocketRef.current;
      if (!socket) {
        return;
      }
      collabSocketRef.current = null;
      try {
        socket.close();
      } catch {
        // ignore
      }
    };
  }, []);

  useEffect(() => {
    const notebookId = notebook?.id;
    if (!notebookId) {
      return;
    }

    let wsUrl: string;
    if (/^https?:/i.test(API_BASE_URL)) {
      const protocol = API_BASE_URL.startsWith("https") ? "wss" : "ws";
      wsUrl = `${API_BASE_URL.replace(/^https?/, protocol)}/ws/notebooks/${encodeURIComponent(
        notebookId
      )}/collab`;
    } else if (typeof window !== "undefined") {
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      wsUrl = `${proto}://${window.location.host}${API_BASE_URL}/ws/notebooks/${encodeURIComponent(
        notebookId
      )}/collab`;
    } else {
      wsUrl = `${API_BASE_URL}/ws/notebooks/${encodeURIComponent(
        notebookId
      )}/collab`;
    }

    const socket = new WebSocket(wsUrl);
    collabSocketRef.current = socket;

    socket.onopen = () => {
      try {
        socket.send(JSON.stringify({ type: "request-state" }));
        socket.send(
          JSON.stringify({
            type: "presence",
            presence: activeCellIdRef.current
              ? { cellId: activeCellIdRef.current }
              : null,
          })
        );
      } catch {
        // ignore failures
      }
    };

    socket.onmessage = (event) => {
      let payload: unknown;
      try {
        payload = JSON.parse(event.data as string);
      } catch {
        return;
      }
      if (!payload || typeof payload !== "object") {
        return;
      }

      const kind = (payload as { type?: string }).type;
      if (kind === "state" || kind === "update") {
        const nextNotebook = (payload as { notebook?: Notebook }).notebook;
        if (!nextNotebook) {
          return;
        }
        if (kind === "update") {
          const actorId =
            typeof (payload as { actorId?: unknown }).actorId === "string"
              ? ((payload as { actorId: string }).actorId as string)
              : undefined;
          if (actorId && currentUser?.id && actorId === currentUser.id) {
            setDirty(false);
            setNotebook((prev) => {
              if (!prev || prev.id !== nextNotebook.id) {
                notebookRef.current = nextNotebook;
                return nextNotebook;
              }
              const merged = { ...prev, ...nextNotebook, cells: prev.cells };
              notebookRef.current = { ...merged, cells: prev.cells };
              return merged;
            });
            return;
          }
        }
        suppressCollabBroadcastRef.current = true;
        notebookRef.current = nextNotebook;
        setNotebook(nextNotebook);
        setDirty(false);
        suppressCollabBroadcastRef.current = false;
      }
    };

    socket.onclose = () => {
      if (collabSocketRef.current === socket) {
        collabSocketRef.current = null;
      }
    };

    socket.onerror = () => {
      // ignore best effort
    };

    return () => {
      if (collabSocketRef.current === socket) {
        collabSocketRef.current = null;
      }
      try {
        socket.close();
      } catch {
        // ignore
      }
    };
  }, [notebook?.id, currentUser?.id]);

  useEffect(() => {
    activeCellIdRef.current = activeCellId ?? null;
    const socket = collabSocketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      socket.send(
        JSON.stringify({
          type: "presence",
          presence: activeCellId ? { cellId: activeCellId } : null,
        })
      );
    } catch {
      // ignore presence failures
    }
  }, [activeCellId]);

  const handleInterruptKernel = useCallback(() => {
    if (!notebook) return;
    if (!ensureEditable()) {
      return;
    }
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError("Kernel is not connected yet");
      return;
    }
    const payload: KernelInterruptRequest = {
      type: "interrupt_request",
      notebookId: notebook.id,
    };
    try {
      socket.send(JSON.stringify(payload));
    } catch {
      // ignore send errors; status handler will reflect kernel state
    }
  }, [ensureEditable, notebook]);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/notebooks`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          throw new Error(
            `Failed to load notebooks (status ${response.status})`
          );
        }
        const payload = await response.json();
        const notebooks: NotebookWithAccess[] = Array.isArray(payload?.data)
          ? (payload.data as NotebookWithAccess[])
          : [];

        let initialEntry: NotebookWithAccess | Notebook | undefined =
          notebooks.find((n) => n.id === initialNotebookId) ?? notebooks[0];

        if (!initialEntry && initialNotebookId) {
          const res = await fetch(
            `${API_BASE_URL}/notebooks/${initialNotebookId}`,
            {
              signal: controller.signal,
              headers: { Accept: "application/json" },
            }
          );
          if (res.ok) {
            const singlePayload = await res.json().catch(() => null);
            initialEntry = singlePayload?.data as
              | NotebookWithAccess
              | undefined;
          }
        }

        if (!initialEntry && isAdmin) {
          const created = await fetch(`${API_BASE_URL}/notebooks`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ template: "blank" }),
            signal: controller.signal,
          });
          if (!created.ok) {
            throw new Error(
              `Failed to create notebook (status ${created.status})`
            );
          }
          const createdPayload = await created.json();
          initialEntry = createdPayload.data as NotebookWithAccess;
        }

        if (!controller.signal.aborted) {
          const { notebook: initialNotebook, role } =
            normalizeNotebookState(initialEntry);
          notebookRef.current = initialNotebook;
          setNotebook(initialNotebook);
          setNotebookAccessRole(
            (current) => role ?? (isAdmin ? "editor" : current)
          );
          if (initialNotebook) {
            setDirty(false);
            setError(null);
          } else if (!isAdmin) {
            setError("No notebooks are currently shared with you.");
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load notebooks from the API"
          );
          notebookRef.current = null;
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
  }, [initialNotebookId, isAdmin]);

  useEffect(() => {
    const projectId = notebook?.projectId ?? null;
    if (!projectId) {
      setProjectNav((prev) => (prev && prev.id === projectId ? prev : null));
      setProjectNavLoading(false);
      setProjectNavError(null);
      return;
    }

    const controller = new AbortController();

    const loadProject = async () => {
      setProjectNavLoading(true);
      setProjectNavError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/projects/${projectId}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        const payload = (await response.json().catch(() => ({}))) as {
          data?: {
            project?: {
              id: string;
              name: string;
              slug?: string | null;
              published?: boolean;
            };
            notebooks?: NotebookWithAccess[];
          };
          error?: string;
        };
        if (!response.ok || !payload?.data?.project) {
          const message =
            payload?.error ??
            `Failed to load project details (status ${response.status})`;
          throw new Error(message);
        }
        const list = Array.isArray(payload.data.notebooks)
          ? [...payload.data.notebooks]
          : [];
        list.sort((a, b) => {
          const orderA = a.projectOrder ?? Number.MAX_SAFE_INTEGER;
          const orderB = b.projectOrder ?? Number.MAX_SAFE_INTEGER;
          if (orderA !== orderB) {
            return orderA - orderB;
          }
          return a.name.localeCompare(b.name);
        });
        if (!controller.signal.aborted) {
          setProjectNav({
            id: payload.data.project.id,
            name: payload.data.project.name,
            slug:
              typeof payload.data.project.slug === "string"
                ? payload.data.project.slug
                : payload.data.project.slug === null
                  ? null
                  : null,
            published: Boolean(payload.data.project.published),
            notebooks: list,
          });
        }
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }
        setProjectNavError(
          err instanceof Error ? err.message : "Unable to load project"
        );
        setProjectNav(null);
      } finally {
        if (!controller.signal.aborted) {
          setProjectNavLoading(false);
        }
      }
    };

    void loadProject();

    return () => {
      controller.abort();
    };
  }, [notebook?.projectId]);

  useEffect(() => {
    if (!notebookId || !canEditNotebook) {
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
  }, [notebookId, canEditNotebook]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    let wsUrl: string;
    if (/^https?:/i.test(API_BASE_URL)) {
      const protocol = API_BASE_URL.startsWith("https") ? "wss" : "ws";
      wsUrl = `${API_BASE_URL.replace(/^https?/, protocol)}/ws/sessions/${sessionId}`;
    } else if (typeof window !== "undefined") {
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      wsUrl = `${proto}://${window.location.host}${API_BASE_URL}/ws/sessions/${sessionId}`;
    } else {
      wsUrl = `${API_BASE_URL}/ws/sessions/${sessionId}`;
    }
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
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      setSocketReady(false);
      // Ensure UI is not stuck in running state on disconnect
      setRunningCellId(null);
      runningRef.current = null;
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as KernelServerMessage;
        try {
          handleServerMessageRef.current(message);
        } catch (err) {
          console.error("Failed to handle kernel message", err);
        }
      } catch (err) {
        console.error("Failed to parse kernel message", err);
      }
    };

    return () => {
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      try {
        socket.close(1000, "session change");
      } catch {
        // ignore
      }
    };
  }, [sessionId, socketGeneration]);

  useEffect(() => {
    return () => {
      closeActiveSession("component unmounted");
    };
    // closeActiveSession is stable; run only on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!canEditNotebook) {
      closeActiveSession("read-only access");
      setSession(null);
    }
  }, [canEditNotebook, closeActiveSession]);

  // Notebook selection/navigation handled by router pages

  const handleCreateNotebook = useCallback(
    async (template: NotebookTemplateId = "blank") => {
      if (!isAdmin) {
        setActionError("Only workspace admins can create notebooks.");
        return;
      }
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
    [isAdmin, router]
  );

  const handleCellChange = useCallback(
    (
      id: string,
      updater: (cell: NotebookCell) => NotebookCell,
      options?: { persist?: boolean; touch?: boolean }
    ) => {
      if (!ensureEditable()) {
        return;
      }
      updateNotebookCell(id, updater, options);
    },
    [ensureEditable, updateNotebookCell]
  );

  const handleAddCell = useCallback(
    (type: NotebookCell["type"], index?: number) => {
      if (!ensureEditable()) {
        return;
      }
      if (
        (type === "terminal" || type === "command") &&
        !terminalCellsEnabled
      ) {
        setActionError("Terminal cells are disabled for this workspace.");
        return;
      }
      const nextCell =
        type === "code"
          ? createCodeCell({ language: "ts" })
          : type === "terminal"
            ? createTerminalCell()
            : type === "command"
              ? createCommandCell()
              : type === "http"
                ? createHttpCell()
                : type === "sql"
                  ? createSqlCell()
                  : createMarkdownCell({ source: "" });
      const updatedNotebook = updateNotebook((current) => {
        const cells = [...current.cells];
        if (typeof index === "number") {
          cells.splice(index, 0, nextCell);
        } else {
          cells.push(nextCell);
        }
        return { ...current, cells };
      });
      setActiveCellId(nextCell.id);
      if (type === "terminal") {
        markTerminalPendingPersistence(nextCell.id);
        clearPendingSave();
        void saveNotebookNow({
          resolveTerminalIds: [nextCell.id],
          notebookSnapshot: updatedNotebook,
        });
      } else {
        scheduleAutoSave();
      }
    },
    [
      ensureEditable,
      updateNotebook,
      scheduleAutoSave,
      saveNotebookNow,
      clearPendingSave,
      markTerminalPendingPersistence,
      terminalCellsEnabled,
    ]
  );

  const handleCloneHttpToCode = useCallback(
    (id: string, source: string) => {
      if (!ensureEditable()) {
        return;
      }
      let createdId: string | null = null;
      const nextNotebook = updateNotebook((current) => {
        const position = current.cells.findIndex((cell) => cell.id === id);
        if (position < 0) {
          return current;
        }
        const nextCell = createCodeCell({ language: "ts", source });
        createdId = nextCell.id;
        const cells = [...current.cells];
        cells.splice(position + 1, 0, nextCell);
        return { ...current, cells };
      });
      if (!nextNotebook || !createdId) {
        return;
      }
      setActiveCellId(createdId);
      scheduleAutoSave({ markDirty: true });
    },
    [ensureEditable, scheduleAutoSave, updateNotebook]
  );

  const handleCloneSqlToCode = useCallback(
    (id: string, source: string) => {
      if (!ensureEditable()) {
        return;
      }
      let createdId: string | null = null;
      const nextNotebook = updateNotebook((current) => {
        const position = current.cells.findIndex((cell) => cell.id === id);
        if (position < 0) {
          return current;
        }
        const nextCell = createCodeCell({ language: "ts", source });
        createdId = nextCell.id;
        const cells = [...current.cells];
        cells.splice(position + 1, 0, nextCell);
        return { ...current, cells };
      });
      if (!nextNotebook || !createdId) {
        return;
      }
      setActiveCellId(createdId);
      scheduleAutoSave({ markDirty: true });
    },
    [ensureEditable, scheduleAutoSave, updateNotebook]
  );

  const handleDeleteCell = useCallback(
    (id: string) => {
      if (!ensureEditable()) {
        return;
      }
      updateNotebook((current) => ({
        ...current,
        cells: current.cells.filter((cell) => cell.id !== id),
      }));
      removeTerminalPendingPersistence(id);
      scheduleAutoSave({ markDirty: true });
    },
    [
      ensureEditable,
      updateNotebook,
      scheduleAutoSave,
      removeTerminalPendingPersistence,
    ]
  );

  const handleMoveCell = useCallback(
    (id: string, direction: "up" | "down") => {
      if (!ensureEditable()) {
        return;
      }
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
    [ensureEditable, updateNotebook]
  );

  const handleRunCell = useCallback(
    (id: string) => {
      if (!notebook) return;
      if (!ensureEditable()) {
        return;
      }
      const cell = notebook.cells.find((item) => item.id === id);
      if (!cell) {
        return;
      }

      if (cell.type === "command") {
        if (!terminalCellsEnabled) {
          setActionError("Terminal cells are disabled for this workspace.");
          return;
        }
        const metadata = (cell.metadata ?? {}) as CommandCellMetadata;
        const commandText = (cell.command ?? "").trim();
        if (!commandText) {
          setActionError("Add a command before running this cell.");
          return;
        }

        let targetId =
          typeof metadata.terminalTargetId === "string"
            ? metadata.terminalTargetId
            : undefined;

        const existingTerminal =
          targetId &&
          notebook.cells.find(
            (item) => item.id === targetId && item.type === "terminal"
          );

        if (!existingTerminal) {
          targetId = undefined;
        }

        if (!targetId) {
          const newTerminal = createTerminalCell();
          const updatedNotebook = updateNotebook((current) => {
            const cells = [...current.cells];
            const idx = cells.findIndex((item) => item.id === cell.id);
            const position = idx >= 0 ? idx + 1 : cells.length;
            cells.splice(position, 0, newTerminal);
            return { ...current, cells };
          });
          targetId = newTerminal.id;
          setActiveCellId(newTerminal.id);
          markTerminalPendingPersistence(newTerminal.id);
          clearPendingSave();
          void saveNotebookNow({
            resolveTerminalIds: [newTerminal.id],
            notebookSnapshot: updatedNotebook,
          });
        } else {
          setActiveCellId(targetId);
        }

        if (targetId) {
          if (metadata.terminalTargetId !== targetId) {
            updateNotebookCell(
              cell.id,
              (current) => {
                if (current.type !== "command") {
                  return current;
                }
                const nextMeta = {
                  ...(current.metadata ?? {}),
                  terminalTargetId: targetId,
                };
                return { ...current, metadata: nextMeta };
              },
              { persist: true }
            );
          }

          const requestId =
            typeof crypto !== "undefined" &&
            typeof crypto.randomUUID === "function"
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.round(Math.random() * 1e6)}`;

          updateNotebookCell(
            targetId,
            (current) => {
              if (current.type !== "terminal") {
                return current;
              }
              const nextMeta = {
                ...(current.metadata ?? {}),
                pendingCommand: {
                  id: requestId,
                  command: commandText,
                  sourceId: cell.id,
                },
              };
              return { ...current, metadata: nextMeta };
            },
            { persist: false, touch: false }
          );
        }
        setActionError(null);
        return;
      }

      if (cell.type === "sql") {
        const connectionId = cell.connectionId?.trim();
        if (!connectionId) {
          setActionError("Select a database connection before running this cell.");
          return;
        }
        const connection = (notebook.sql?.connections ?? []).find(
          (candidate) => candidate.id === connectionId
        );
        if (!connection) {
          setActionError("Database connection not found. Check the Setup panel.");
          return;
        }
        const queryText = (cell.query ?? "").trim();
        if (!queryText) {
          setActionError("Enter a SQL query before running this cell.");
          return;
        }
        const assignTrimmed = (cell.assignVariable ?? "").trim();
        const assignVariable = assignTrimmed.length > 0 ? assignTrimmed : undefined;
        if (assignVariable && !SQL_IDENTIFIER_PATTERN.test(assignVariable)) {
          setActionError("Assignment target must be a valid identifier.");
          return;
        }

        setActionError(null);
        setRunningCellId(id);
        void (async () => {
          try {
            const response = await fetch(
              `${API_BASE_URL}/notebooks/${notebook.id}/sql`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  cellId: id,
                  connectionId,
                  query: queryText,
                  assignVariable,
                }),
              }
            );
            const payload = (await response.json().catch(() => ({}))) as {
              error?: string;
              data?: { result?: SqlResult };
            };
            const sqlResult = payload?.data?.result;
            if (sqlResult) {
              updateNotebookCell(
                id,
                (current) => {
                  if (current.type !== "sql") {
                    return current;
                  }
                  return { ...current, result: sqlResult };
                },
                { persist: true }
              );
            }
            if (!response.ok) {
              const message =
                typeof payload?.error === "string"
                  ? payload.error
                  : `Failed to execute SQL query (status ${response.status})`;
              setActionError(message);
              return;
            }
            if (payload?.error) {
              setActionError(payload.error);
            } else {
              setActionError(null);
            }
          } catch (error) {
            const message =
              error instanceof Error
                ? error.message
                : "Failed to execute SQL query";
            setActionError(message);
            updateNotebookCell(
              id,
              (current) => {
                if (current.type !== "sql") {
                  return current;
                }
                return {
                  ...current,
                  result: {
                    error: message,
                    assignedVariable: assignVariable,
                    rows: [],
                    columns: [],
                    timestamp: new Date().toISOString(),
                  },
                };
              },
              { persist: true }
            );
          } finally {
            setRunningCellId((current) => {
              if (current !== id) {
                return current;
              }
              const kernelRunningId = runningRef.current;
              return kernelRunningId ?? null;
            });
          }
        })();
        return;
      }

      if (cell.type === "http") {
        setActionError(null);
        setRunningCellId(id);
        void (async () => {
          try {
            const response = await fetch(
              `${API_BASE_URL}/notebooks/${notebook.id}/http`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  cellId: id,
                  request: cell.request ?? {},
                }),
              }
            );
            const payload = (await response.json().catch(() => ({}))) as {
              error?: string;
              data?: { response?: HttpResponse };
            };
            if (!response.ok) {
              const message =
                typeof payload?.error === "string"
                  ? payload.error
                  : `Failed to execute HTTP request (status ${response.status})`;
              setActionError(message);
              return;
            }

            const httpResponse = payload?.data?.response;
            if (httpResponse) {
              updateNotebookCell(
                id,
                (current) => {
                  if (current.type !== "http") {
                    return current;
                  }
                  return { ...current, response: httpResponse };
                },
                { persist: true }
              );
            } else if (payload?.error) {
              setActionError(payload.error);
            }
          } catch (error) {
            setActionError(
              error instanceof Error
                ? error.message
                : "Failed to execute HTTP request"
            );
          } finally {
            setRunningCellId((current) => {
              if (current !== id) {
                return current;
              }
              const kernelRunningId = runningRef.current;
              return kernelRunningId ?? null;
            });
          }
        })();
        return;
      }

      if (cell.type !== "code") {
        return;
      }

      const busy =
        runningRef.current !== null ||
        runPendingRef.current.size > 0 ||
        !!runningCellId;
      if (busy && runningRef.current !== id && runningCellId !== id) {
        // Enqueue when another cell is running
        setRunQueue((prev) => (prev.includes(id) ? prev : [...prev, id]));
        return;
      }
      if (runningCellId === id || runningRef.current === id) return;
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        setError("Kernel is not connected yet");
        return;
      }
      setRunningCellId(id);
      runningRef.current = id;
      runPendingRef.current.add(id);
      updateNotebookCell(
        id,
        (current) => {
          if (current.type !== "code") return current;
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
      const globalsMap =
        sqlGlobals && Object.keys(sqlGlobals).length > 0 ? sqlGlobals : undefined;
      const payload: KernelExecuteRequest = {
        type: "execute_request",
        cellId: id,
        code: cell.source,
        language: cell.language,
        timeoutMs: cell.metadata.timeoutMs,
        globals: globalsMap,
      };
      socket.send(JSON.stringify(payload));
    },
    [
      clearPendingSave,
      ensureEditable,
      markTerminalPendingPersistence,
      notebook,
      sqlGlobals,
      runningCellId,
      saveNotebookNow,
      terminalCellsEnabled,
      updateNotebook,
      updateNotebookCell,
    ]
  );

  // When a cell completes and queue has items, run the next one.
  useEffect(() => {
    if (!runningCellId && socketReady && runQueue.length > 0) {
      const [next, ...rest] = runQueue;
      setRunQueue(rest);
      // Start next run
      handleRunCell(next);
    }
  }, [runningCellId, runQueue, socketReady, handleRunCell]);

  const handleInstallDependencyInline = useCallback(
    async (raw: string) => {
      if (!notebook) return;
      if (!ensureEditable()) {
        return;
      }

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
    [ensureEditable, notebook, updateNotebook]
  );

  const handleRenameStart = useCallback(() => {
    if (!notebook) {
      return;
    }
    if (!ensureEditable()) {
      return;
    }
    setRenameDraft(notebook.name);
    setIsRenaming(true);
  }, [notebook, ensureEditable]);

  const handleRenameCommit = useCallback(() => {
    if (!notebook) {
      setIsRenaming(false);
      return;
    }
    if (!canEditNotebook) {
      setIsRenaming(false);
      return;
    }
    const trimmed = renameDraft.trim();
    if (trimmed && trimmed !== notebook.name) {
      updateNotebook((current) => ({ ...current, name: trimmed }));
    }
    setIsRenaming(false);
  }, [renameDraft, notebook, canEditNotebook, updateNotebook]);

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
    if (!ensureEditable()) {
      return;
    }
    // Render markdown cells (exit edit mode)
    updateNotebook(
      (current) => ({
        ...current,
        cells: current.cells.map((cell) => {
          if (cell.type !== "markdown") return cell;
          const ui = ((cell.metadata as { ui?: { edit?: boolean } }).ui ??
            {}) as {
            edit?: boolean;
          };
          return {
            ...cell,
            metadata: { ...cell.metadata, ui: { ...ui, edit: false } },
          };
        }),
      }),
      { persist: false }
    );

    notebook.cells.forEach((cell) => {
      if (cell.type === "code" || cell.type === "http") {
        handleRunCell(cell.id);
      }
    });
  }, [ensureEditable, notebook, handleRunCell, updateNotebook]);

  const slugify = useCallback((value: string) => {
    return (
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64) || "notebook"
    );
  }, []);

  const handleExportNotebook = useCallback(async () => {
    if (!notebook) {
      return;
    }
    setExporting(true);
    setActionError(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/notebooks/${notebook.id}/export`
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const message =
          typeof payload?.error === "string"
            ? payload.error
            : "Failed to export notebook";
        throw new Error(message);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${slugify(notebook.name)}.nbdm`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to export notebook";
      setActionError(message);
    } finally {
      setExporting(false);
    }
  }, [notebook, slugify]);

  const handleRestartKernel = useCallback(async () => {
    if (!ensureEditable()) {
      return;
    }
    setRunningCellId(null);
    runCounterRef.current = 0;
    runPendingRef.current.clear();
    // Clear all cell outputs/exec metadata so the UI reflects a fresh kernel
    updateNotebook((current) => ({
      ...current,
      cells: current.cells.map((cell) => {
        if (cell.type !== "code") return cell;
        const display = ((
          cell.metadata as { display?: Record<string, unknown> }
        ).display ?? {}) as Record<string, unknown>;
        // Remove execCount from the visual metadata on restart
        const restDisplay = { ...(display as Record<string, unknown>) };
        delete (restDisplay as Record<string, unknown>).execCount;
        return {
          ...cell,
          outputs: [],
          execution: undefined,
          metadata: { ...cell.metadata, display: { ...restDisplay } },
        };
      }),
    }));
    try {
      closeActiveSession("user restart");
      if (!notebook) return;
      const response = await fetch(
        `${API_BASE_URL}/notebooks/${notebook.id}/sessions`,
        { method: "POST" }
      );
      if (!response.ok) {
        throw new Error(
          `Failed to start new session (status ${response.status})`
        );
      }
      const payload = await response.json();
      setSession(payload.data);
      sessionRef.current = payload.data;
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restart kernel");
    }
  }, [closeActiveSession, ensureEditable, notebook, updateNotebook]);

  const handleReconnectKernel = useCallback(() => {
    if (!sessionId) {
      return;
    }
    setError(null);
    setSocketReady(false);
    // Reset execution counter on kernel reconnect/refresh as well
    runCounterRef.current = 0;
    runPendingRef.current.clear();
    bumpSocketGeneration();
  }, [sessionId, bumpSocketGeneration]);

  const handleClearAllOutputs = useCallback(() => {
    if (!ensureEditable()) {
      return;
    }
    updateNotebook((current) => ({
      ...current,
      cells: current.cells.map((cell) =>
        cell.type === "code"
          ? { ...cell, outputs: [], execution: undefined }
          : cell
      ),
    }));
    handleClearDepOutputs();
  }, [ensureEditable, handleClearDepOutputs, updateNotebook]);

  const handleDeleteNotebook = useCallback(
    async (id?: string) => {
      const targetId = id ?? notebook?.id;
      if (!targetId) return;
      if (!isAdmin) {
        setActionError("Only workspace admins can delete notebooks.");
        return;
      }
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
    [isAdmin, notebook?.id, router]
  );
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const handleSaveNow = useCallback(() => {
    if (!ensureEditable()) {
      return;
    }
    clearPendingSave();
    void saveNotebookNow();
  }, [clearPendingSave, ensureEditable, saveNotebookNow]);

  const handleRemoveDependency = useCallback(
    async (name: string) => {
      if (!notebook) return;
      if (!ensureEditable()) {
        return;
      }
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
    [ensureEditable, notebook, updateNotebook]
  );

  const handleAddVariable = useCallback(
    (name: string, value: string) => {
      const key = name.trim();
      if (!notebook || !key) return;
      if (!ensureEditable()) {
        return;
      }
      updateNotebook((current) => ({
        ...current,
        env: {
          ...current.env,
          variables: { ...current.env.variables, [key]: String(value) },
        },
      }));
      scheduleAutoSave({ markDirty: true });
    },
    [ensureEditable, notebook, updateNotebook, scheduleAutoSave]
  );

  const handleRemoveVariable = useCallback(
    (name: string) => {
      if (!notebook) return;
      const key = name.trim();
      if (!key) return;
      if (!ensureEditable()) {
        return;
      }
      updateNotebook((current) => {
        const nextVars = { ...current.env.variables } as Record<string, string>;
        delete nextVars[key];
        return { ...current, env: { ...current.env, variables: nextVars } };
      });
      scheduleAutoSave({ markDirty: true });
    },
    [ensureEditable, notebook, updateNotebook, scheduleAutoSave]
  );

  const handleAddSqlConnection = useCallback(
    ({
      driver,
      name,
      connectionString,
    }: {
      driver: SqlConnection["driver"];
      name: string;
      connectionString: string;
    }) => {
      if (!notebook) return;
      if (!ensureEditable()) {
        return;
      }
      const connectionId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `sql_${Math.random().toString(36).slice(2, 10)}`;
      updateNotebook((current) => {
        const existing = current.sql?.connections ?? [];
        const nextConnections = [
          ...existing,
          {
            id: connectionId,
            driver,
            name: name.trim(),
            config: { connectionString },
          },
        ];
        return {
          ...current,
          sql: { ...(current.sql ?? { connections: [] }), connections: nextConnections },
        };
      });
      scheduleAutoSave({ markDirty: true });
    },
    [ensureEditable, notebook, updateNotebook, scheduleAutoSave]
  );

  const handleUpdateSqlConnection = useCallback(
    (
      id: string,
      updates: { name?: string; connectionString?: string }
    ) => {
      if (!notebook) return;
      if (!ensureEditable()) {
        return;
      }
      updateNotebook((current) => {
        const existing = current.sql?.connections ?? [];
        const index = existing.findIndex((conn) => conn.id === id);
        if (index === -1) {
          return current;
        }
        const nextConnections = [...existing];
        const target = nextConnections[index]!;
        nextConnections[index] = {
          ...target,
          name: updates.name !== undefined ? updates.name : target.name,
          config: {
            ...target.config,
            connectionString:
              updates.connectionString !== undefined
                ? updates.connectionString
                : target.config?.connectionString ?? "",
          },
        };
        return {
          ...current,
          sql: { ...(current.sql ?? { connections: [] }), connections: nextConnections },
        };
      });
      scheduleAutoSave({ markDirty: true });
    },
    [ensureEditable, notebook, updateNotebook, scheduleAutoSave]
  );

  const handleRemoveSqlConnection = useCallback(
    (id: string) => {
      if (!notebook) return;
      if (!ensureEditable()) {
        return;
      }
      updateNotebook((current) => {
        const existing = current.sql?.connections ?? [];
        if (!existing.some((conn) => conn.id === id)) {
          return current;
        }
        const nextConnections = existing.filter((conn) => conn.id !== id);
        const nextCells = current.cells.map((cell) => {
          if (cell.type === "sql" && cell.connectionId === id) {
            return { ...cell, connectionId: undefined };
          }
          return cell;
        });
        return {
          ...current,
          sql: { ...(current.sql ?? { connections: [] }), connections: nextConnections },
          cells: nextCells,
        };
      });
      scheduleAutoSave({ markDirty: true });
    },
    [ensureEditable, notebook, updateNotebook, scheduleAutoSave]
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

  const sqlGlobals = useMemo(() => {
    if (!notebook) {
      return {} as Record<string, unknown>;
    }
    const map: Record<string, unknown> = {};
    for (const cell of notebook.cells) {
      if (cell.type !== "sql") {
        continue;
      }
      const name = (cell.assignVariable ?? "").trim();
      if (!name || !SQL_IDENTIFIER_PATTERN.test(name)) {
        continue;
      }
      const result = cell.result;
      if (!result || result.error) {
        continue;
      }
      map[name] = {
        rows: result.rows ?? [],
        columns: result.columns ?? [],
        rowCount: result.rowCount,
        durationMs: result.durationMs,
        timestamp: result.timestamp,
      };
    }
    return map;
  }, [notebook]);

  const topbarMain = useMemo(() => {
    if (!notebook) return null;
    return (
      <NotebookHeaderMain
        notebookName={notebook.name}
        isRenaming={isRenaming}
        renameDraft={renameDraft}
        renameInputRef={renameInputRef}
        onRenameDraftChange={setRenameDraft}
        onRenameCommit={handleRenameCommit}
        onRenameKeyDown={handleRenameKeyDown}
        onRenameStart={handleRenameStart}
        canRename={canEditNotebook}
      />
    );
  }, [
    notebook,
    isRenaming,
    renameDraft,
    handleRenameCommit,
    handleRenameKeyDown,
    handleRenameStart,
    canEditNotebook,
  ]);

  const topbarRight = useMemo(() => {
    if (!notebook) return null;
    return (
      <NotebookHeaderRight
        env={notebook.env}
        socketReady={socketReady}
        hasSession={Boolean(sessionId)}
        dirty={dirty}
        canEdit={canEditNotebook}
        canShare={isAdmin}
        canDelete={isAdmin}
        canPublish={isAdmin}
        currentUserLoading={currentUserLoading}
        exporting={exporting}
        published={Boolean(notebook.published)}
        publishHref={publishHref}
        publishPending={publishSubmitting}
        unpublishPending={unpublishSubmitting}
        onSave={handleSaveNow}
        onRunAll={handleRunAll}
        onClearOutputs={() => setConfirmClearOutputsOpen(true)}
        onReconnect={handleReconnectKernel}
        onRestart={() => setConfirmRestartOpen(true)}
        onOpenSharing={handleOpenSharing}
        onExport={handleExportNotebook}
        onDelete={() => setConfirmDeleteOpen(true)}
        onPublish={handleOpenPublishDialog}
        onUnpublish={handleOpenUnpublishDialog}
      />
    );
  }, [
    notebook,
    socketReady,
    sessionId,
    dirty,
    canEditNotebook,
    isAdmin,
    currentUserLoading,
    exporting,
    handleSaveNow,
    handleRunAll,
    handleReconnectKernel,
    handleOpenSharing,
    handleExportNotebook,
    publishHref,
    publishSubmitting,
    unpublishSubmitting,
    handleOpenPublishDialog,
    handleOpenUnpublishDialog,
  ]);

  const secondaryHeader = useMemo(() => {
    if (!notebook) return null;
    return (
      <NotebookSecondaryHeader
        value={sidebarView}
        onChange={handleSidebarChange}
        showAttachments={!isViewer}
        showSetup={!isViewer}
      />
    );
  }, [notebook, sidebarView, handleSidebarChange, isViewer]);

  const secondarySidebar = useMemo(() => {
    if (!notebook) return null;
    return (
      <div className="h-full overflow-hidden">
        {sidebarView === "attachments" ? (
          <AttachmentsPanel
            notebookId={notebook.id}
            attachments={attachments}
            loading={attachmentsLoading}
            error={attachmentsError}
            onDelete={safeDeleteAttachment}
            onAttachmentUploaded={handleAttachmentUploaded}
            canEdit={canEditNotebook}
          />
        ) : sidebarView === "setup" ? (
          <SetupPanel
            env={notebook.env}
            sql={notebook.sql}
            onRemoveDependency={handleRemoveDependency}
            onAddDependencies={(raw) => handleInstallDependencyInline(raw)}
            depBusy={depBusy}
            onAddVariable={handleAddVariable}
            onRemoveVariable={handleRemoveVariable}
            onAddSqlConnection={handleAddSqlConnection}
            onUpdateSqlConnection={handleUpdateSqlConnection}
            onRemoveSqlConnection={handleRemoveSqlConnection}
            canEdit={canEditNotebook}
          />
        ) : (
          <div className="flex h-full flex-col overflow-hidden">
            {notebook.projectId ? (
              <div className="shrink-0 space-y-2 rounded-md border border-border bg-muted/40 p-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Project
                  </p>
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <span>
                      {projectNav?.name ??
                        (projectNavLoading ? "Loading…" : "")}
                    </span>
                    {projectNav?.published ? (
                      <Badge variant="secondary" className="text-[10px]">
                        Published
                      </Badge>
                    ) : null}
                  </div>
                </div>
                {projectNavLoading ? (
                  <p className="text-xs text-muted-foreground">
                    Loading project notebooks…
                  </p>
                ) : projectNavError ? (
                  <p className="text-xs text-destructive">{projectNavError}</p>
                ) : projectNav ? (
                  <ul className="space-y-1">
                    {projectNav.notebooks.map((item) => {
                      const isActive = item.id === notebook.id;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() =>
                              handleProjectNotebookNavigate(item.id)
                            }
                            disabled={isActive}
                            className={`w-full rounded-md px-2 py-1 text-left text-sm transition-colors ${
                              isActive
                                ? "bg-muted text-foreground"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            }`}
                          >
                            <span className="block truncate">{item.name}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No notebooks found in this project.
                  </p>
                )}
              </div>
            ) : null}
            <div className="flex-1 overflow-y-auto pr-1">
              <OutlinePanel
                items={outlineItems}
                onSelect={handleOutlineJump}
                activeCellId={runningCellId ?? undefined}
              />
            </div>
          </div>
        )}
      </div>
    );
  }, [
    notebook,
    sidebarView,
    outlineItems,
    handleOutlineJump,
    runningCellId,
    projectNav,
    projectNavLoading,
    projectNavError,
    handleProjectNotebookNavigate,
    attachments,
    attachmentsLoading,
    attachmentsError,
    safeDeleteAttachment,
    handleAttachmentUploaded,
    handleRemoveDependency,
    depBusy,
    handleInstallDependencyInline,
    handleAddVariable,
    handleRemoveVariable,
    canEditNotebook,
  ]);

  const shellUser = useMemo(() => {
    if (!currentUser) {
      return null;
    }
    const name = currentUser.name?.trim()
      ? currentUser.name
      : (currentUser.email ?? "Account");
    const avatar = currentUser.email
      ? gravatarUrlForEmail(currentUser.email, 96)
      : null;
    return {
      name,
      email: currentUser.email,
      avatarUrl: avatar,
      role: currentUser.role,
    };
  }, [currentUser]);

  const handleLogout = useCallback(async () => {
    try {
      await fetch("/auth/logout", { method: "POST" });
    } catch {
      // best-effort logout
    }
    setCurrentUser(null);
    router.replace("/login");
    router.refresh();
  }, [router, setCurrentUser]);

  return (
    <AppShell
      title={notebook?.name ?? "Notebook"}
      onNewNotebook={
        isAdmin
          ? () => {
              void handleCreateNotebook();
            }
          : undefined
      }
      secondarySidebar={secondarySidebar}
      defaultCollapsed={false}
      secondaryHeader={secondaryHeader}
      headerMain={topbarMain}
      headerRight={topbarRight}
      user={shellUser}
      userLoading={currentUserLoading}
      onLogout={() => void handleLogout()}
    >
      <NotebookEditorView
        loading={loading}
        notebook={notebook}
        error={error}
        actionError={actionError}
        socketReady={socketReady}
        runningCellId={runningCellId}
        runQueue={runQueue}
        activeCellId={activeCellId}
        themeMode={theme}
        aiEnabled={aiEnabled}
        terminalCellsEnabled={terminalCellsEnabled}
        readOnly={!canEditNotebook}
        readOnlyMessage={readOnlyMessage}
        pendingTerminalIds={pendingTerminalIds}
        depBusy={depBusy}
        depError={depError}
        depOutputs={depOutputs}
        onCellChange={handleCellChange}
        onDeleteCell={handleDeleteCell}
        onRunCell={handleRunCell}
        onMoveCell={handleMoveCell}
        onAddCell={handleAddCell}
        onCloneHttpToCode={handleCloneHttpToCode}
        onCloneSqlToCode={handleCloneSqlToCode}
        onActivateCell={setActiveCellId}
        onInterruptKernel={handleInterruptKernel}
        onAttachmentUploaded={handleAttachmentUploaded}
        onClearDepOutputs={handleClearDepOutputs}
        onAbortInstall={handleAbortInstall}
        sqlConnections={notebook?.sql?.connections ?? []}
      />
      <PublishDialog
        open={publishDialogOpen}
        kind="notebook"
        defaultSlug={notebook?.publicSlug ?? null}
        suggestedSlug={publishSlugSuggestion ?? undefined}
        submitting={publishSubmitting}
        error={publishDialogError}
        onOpenChange={(open) => {
          setPublishDialogOpen(open);
          if (!open) {
            setPublishDialogError(null);
          }
        }}
        onSubmit={async (slug) => {
          await handlePublishNotebookSubmit(slug);
        }}
      />
      <ConfirmDialog
        open={unpublishConfirmOpen}
        title="Unpublish notebook?"
        description="The notebook will no longer be publicly accessible."
        confirmLabel="Unpublish"
        onCancel={() => setUnpublishConfirmOpen(false)}
        onConfirm={async () => {
          if (unpublishSubmitting) {
            return;
          }
          await handleConfirmUnpublish();
        }}
      />
      <NotebookSharingDialog
        open={sharingOpen}
        isAdmin={isAdmin}
        themeMode={theme}
        invitationEmail={invitationEmail}
        invitationRole={invitationRole}
        invitationError={invitationError}
        shareFetchError={shareFetchError}
        shareSubmitting={shareSubmitting}
        invitesLoading={invitesLoading}
        sortedInvitations={sortedInvitations}
        sortedCollaborators={sortedCollaborators}
        currentUserId={currentUser?.id}
        newInviteLink={newInviteLink}
        copySuccess={copySuccess}
        revokingInvitationId={revokingInvitationId}
        updatingCollaboratorId={updatingCollaboratorId}
        removingCollaboratorId={removingCollaboratorId}
        onOpenChange={handleSharingOpenChange}
        onInvitationEmailChange={setInvitationEmail}
        onInvitationRoleChange={setInvitationRole}
        onInviteSubmit={handleInviteSubmit}
        onCopyInviteLink={() => {
          void handleCopyInviteLink();
        }}
        onRevokeInvitation={(id) => {
          void handleRevokeInvitation(id);
        }}
        onUpdateCollaboratorRole={(userId, role) => {
          void handleUpdateCollaboratorRole(userId, role);
        }}
        onRemoveCollaborator={(userId) => {
          void handleRemoveCollaborator(userId);
        }}
      />
      <ConfirmDialog
        open={confirmClearOutputsOpen}
        title="Clear all outputs?"
        description="This removes every cell's outputs without touching the source."
        confirmLabel="Clear outputs"
        onCancel={() => setConfirmClearOutputsOpen(false)}
        onConfirm={() => {
          handleClearAllOutputs();
          setConfirmClearOutputsOpen(false);
        }}
      />
      <ConfirmDialog
        open={confirmRestartOpen}
        title="Restart kernel?"
        description="The runtime will restart without deleting your notebook cells, but in-memory context resets."
        confirmLabel="Restart kernel"
        danger
        onCancel={() => setConfirmRestartOpen(false)}
        onConfirm={async () => {
          await handleRestartKernel();
          setConfirmRestartOpen(false);
        }}
      />
      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete notebook?"
        description="This action cannot be undone. The notebook will be permanently removed."
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={async () => {
          await handleDeleteNotebook();
          setConfirmDeleteOpen(false);
        }}
      />
    </AppShell>
  );
};

export default NotebookView;
