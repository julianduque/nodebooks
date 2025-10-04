"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type FormEvent,
} from "react";
import clsx from "clsx";
import AppShell from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useTheme } from "@/components/theme-context";
import {
  Check,
  Copy,
  Loader2,
  Pencil,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Save,
  Share2,
  ShieldCheck,
  Trash2,
  Eraser,
  XCircle,
  Settings as SettingsIcon,
  ListTree,
  Paperclip,
  Download,
  UserPlus,
  Clock,
  Ban,
} from "lucide-react";
import ConfirmDialog from "@/components/ui/confirm";
import { useRouter } from "next/navigation";
import {
  createCodeCell,
  createMarkdownCell,
  createShellCell,
  type KernelExecuteRequest,
  type KernelServerMessage,
  type KernelInterruptRequest,
  type Notebook,
  type NotebookCell,
  type NotebookOutput,
} from "@nodebooks/notebook-schema";
import type {
  NotebookSessionSummary,
  NotebookTemplateId,
  OutlineItem,
  NotebookViewProps,
} from "@/components/notebook/types";
import {
  parseMultipleDependencies,
  buildOutlineItems,
} from "@/components/notebook/utils";
import CellCard from "@/components/notebook/cell-card";
import AddCellMenu from "@/components/notebook/add-cell-menu";
import OutlinePanel from "@/components/notebook/outline-panel";
import SetupPanel from "@/components/notebook/setup-panel";
import AttachmentsPanel from "@/components/notebook/attachments-panel";
import type { AttachmentMetadata } from "@/components/notebook/attachment-utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import OutputView from "@/components/notebook/output-view";
import { syncNotebookContext } from "@/components/notebook/monaco-context-sync";
import { cellUri } from "@/components/notebook/monaco-models";
import { setDiagnosticPolicy } from "@/components/notebook/monaco-setup";
import { useSearchParams } from "next/navigation";

import { clientConfig } from "@nodebooks/config/client";
import { AlertCallout } from "@nodebooks/notebook-ui";
const rawApiBaseUrl = clientConfig().apiBaseUrl ?? "/api";
const API_BASE_URL =
  rawApiBaseUrl.length > 1 && rawApiBaseUrl.endsWith("/")
    ? rawApiBaseUrl.replace(/\/+$/, "")
    : rawApiBaseUrl;

type WorkspaceRole = "admin" | "editor" | "viewer";

interface SafeWorkspaceUser {
  id: string;
  email: string;
  name: string | null;
  role: WorkspaceRole;
  createdAt: string;
  updatedAt: string;
}

interface InvitationSummary {
  id: string;
  email: string;
  role: WorkspaceRole;
  invitedBy: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  invitedByUser?: SafeWorkspaceUser | null;
}

interface StatusDotProps {
  colorClass: string;
  label: string;
  text?: string;
  showText?: boolean;
}

const buildAttachmentsListUrl = (notebookId: string) =>
  `${API_BASE_URL}/notebooks/${encodeURIComponent(notebookId)}/attachments`;

const StatusDot = ({
  colorClass,
  label,
  text,
  showText = false,
}: StatusDotProps) => (
  <span className="flex items-center gap-1" title={label}>
    <span
      className={clsx("h-2.5 w-2.5 rounded-full transition-colors", colorClass)}
      aria-hidden="true"
    />
    {showText ? (
      <span>{text ?? label}</span>
    ) : (
      <span className="sr-only">{label}</span>
    )}
  </span>
);

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
  const [aiEnabled, setAiEnabled] = useState(true);
  const [socketGeneration, bumpSocketGeneration] = useReducer(
    (current: number) => current + 1,
    0
  );
  const [confirmClearOutputsOpen, setConfirmClearOutputsOpen] = useState(false);
  const [confirmRestartOpen, setConfirmRestartOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AttachmentMetadata[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentsError, setAttachmentsError] = useState<string | null>(null);
  const [pendingShellIds, setPendingShellIds] = useState<Set<string>>(
    new Set<string>()
  );
  const [currentUser, setCurrentUser] = useState<SafeWorkspaceUser | null>(
    null
  );
  const [currentUserLoading, setCurrentUserLoading] = useState(true);
  const [sharingOpen, setSharingOpen] = useState(false);
  const [invitationEmail, setInvitationEmail] = useState("");
  const [invitationRole, setInvitationRole] = useState<WorkspaceRole>("editor");
  const [invitationError, setInvitationError] = useState<string | null>(null);
  const [shareFetchError, setShareFetchError] = useState<string | null>(null);
  const [shareSubmitting, setShareSubmitting] = useState(false);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [members, setMembers] = useState<SafeWorkspaceUser[]>([]);
  const [invitations, setInvitations] = useState<InvitationSummary[]>([]);
  const [newInviteLink, setNewInviteLink] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [revokingInvitationId, setRevokingInvitationId] = useState<
    string | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    const fetchCurrentUser = async () => {
      try {
        const response = await fetch("/auth/me", {
          headers: { Accept: "application/json" },
        });
        if (cancelled) {
          return;
        }
        if (response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            data?: SafeWorkspaceUser;
          };
          setCurrentUser(payload?.data ?? null);
        } else {
          setCurrentUser(null);
        }
      } catch {
        if (!cancelled) {
          setCurrentUser(null);
        }
      } finally {
        if (!cancelled) {
          setCurrentUserLoading(false);
        }
      }
    };

    void fetchCurrentUser();
    return () => {
      cancelled = true;
    };
  }, []);

  const isAdmin = currentUser?.role === "admin";

  const refreshSharingData = useCallback(async () => {
    if (!isAdmin) {
      return;
    }
    setInvitesLoading(true);
    setShareFetchError(null);
    try {
      const [usersResponse, invitationsResponse] = await Promise.all([
        fetch("/auth/users", { headers: { Accept: "application/json" } }),
        fetch("/auth/invitations", { headers: { Accept: "application/json" } }),
      ]);

      if (!usersResponse.ok) {
        const payload = (await usersResponse.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload?.error ?? "Failed to load members");
      }
      if (!invitationsResponse.ok) {
        const payload = (await invitationsResponse
          .json()
          .catch(() => ({}))) as { error?: string };
        throw new Error(payload?.error ?? "Failed to load invitations");
      }

      const usersPayload = (await usersResponse.json()) as {
        data?: SafeWorkspaceUser[];
      };
      const invitationsPayload = (await invitationsResponse.json()) as {
        data?: InvitationSummary[];
      };

      setMembers(Array.isArray(usersPayload?.data) ? usersPayload.data : []);
      setInvitations(
        Array.isArray(invitationsPayload?.data) ? invitationsPayload.data : []
      );
    } catch (error) {
      setShareFetchError(
        error instanceof Error ? error.message : "Unable to load sharing data"
      );
    } finally {
      setInvitesLoading(false);
    }
  }, [isAdmin]);

  const handleAttachmentUploaded = useCallback(
    (attachment: AttachmentMetadata) => {
      setAttachments((prev) => {
        const filtered = prev.filter((item) => item.id !== attachment.id);
        return [attachment, ...filtered];
      });
      setAttachmentsError(null);
    },
    []
  );

  const markShellPendingPersistence = useCallback((cellId: string) => {
    setPendingShellIds((prev) => {
      if (prev.has(cellId)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(cellId);
      return next;
    });
  }, []);

  const removeShellPendingPersistence = useCallback((cellId: string) => {
    setPendingShellIds((prev) => {
      if (!prev.has(cellId)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(cellId);
      return next;
    });
  }, []);

  const resolveShellPendingPersistence = useCallback((cellIds: string[]) => {
    if (cellIds.length === 0) {
      return;
    }
    setPendingShellIds((prev) => {
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

  const handleDeleteAttachment = useCallback(async (attachmentId: string) => {
    const current = notebookRef.current;
    if (!current) {
      return;
    }
    try {
      const url = `${API_BASE_URL}/notebooks/${encodeURIComponent(
        current.id
      )}/attachments/${encodeURIComponent(attachmentId)}`;
      const response = await fetch(url, { method: "DELETE" });
      if (!response.ok && response.status !== 204) {
        let message = `Failed to delete attachment (status ${response.status})`;
        try {
          const payload = await response.clone().json();
          if (payload?.error) {
            message = payload.error;
          }
        } catch {
          const text = await response.clone().text();
          if (text) message = text;
        }
        throw new Error(message);
      }
      setAttachments((prev) =>
        prev.filter((attachment) => attachment.id !== attachmentId)
      );
      setAttachmentsError(null);
    } catch (error) {
      setAttachmentsError(
        error instanceof Error ? error.message : "Failed to delete attachment"
      );
    }
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

  const notebookId = notebook?.id;
  const sessionId = session?.id;
  const runQueueRef = useRef<string[]>([]);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  }, [notebook?.name]);

  useEffect(() => {
    setActionError(null);
  }, [notebook?.id]);

  useEffect(() => {
    setPendingShellIds(new Set());
  }, [notebook?.id]);

  useEffect(() => {
    if (sharingOpen && isAdmin) {
      void refreshSharingData();
    }
  }, [sharingOpen, isAdmin, refreshSharingData]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const refreshAiAvailability = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/settings`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      const payload = await response.json();
      const enabled =
        typeof payload?.data?.aiEnabled === "boolean"
          ? payload.data.aiEnabled
          : true;
      setAiEnabled(enabled);
    } catch (error) {
      console.error("Failed to load AI availability", error);
    }
  }, []);

  useEffect(() => {
    void refreshAiAvailability();
  }, [refreshAiAvailability]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handleFocus = () => {
      void refreshAiAvailability();
    };
    const handleVisibility = () => {
      if (!document.hidden) {
        void refreshAiAvailability();
      }
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refreshAiAvailability]);

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

  // Diagnostics policy via URL param: types=off|ignore|full
  useEffect(() => {
    const mode = searchParams?.get("types");
    if (mode === "off") setDiagnosticPolicy({ mode: "off" });
    else if (mode === "full") setDiagnosticPolicy({ mode: "full" });
    else setDiagnosticPolicy({ mode: "ignore-list" });
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
  }, [notebook?.id]);

  useEffect(() => {
    if (!notebook?.id) {
      setAttachments([]);
      setAttachmentsError(null);
      return;
    }

    let ignore = false;
    setAttachmentsLoading(true);
    setAttachmentsError(null);

    const url = buildAttachmentsListUrl(notebook.id);
    fetch(url)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `Failed to load attachments (status ${response.status})`
          );
        }
        const payload = await response.json();
        const list = Array.isArray(payload?.data)
          ? (payload.data as AttachmentMetadata[])
          : [];
        if (!ignore) {
          setAttachments(list);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setAttachmentsError(
            err instanceof Error ? err.message : "Failed to load attachments"
          );
        }
      })
      .finally(() => {
        if (!ignore) {
          setAttachmentsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [notebook?.id]);

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
      // list summaries are handled in route pages
      return next;
    },
    []
  );

  const saveNotebookNow = useCallback(
    async (
      options: { resolveShellIds?: string[]; notebookSnapshot?: Notebook } = {}
    ) => {
      const current = options.notebookSnapshot ?? notebookRef.current;
      if (!current) {
        return;
      }
      const resolveShellIds =
        options.resolveShellIds ?? Array.from(pendingShellIds);
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
          if (resolveShellIds.length > 0) {
            const shellIdsOnServer = new Set(
              saved.cells
                .filter((cell) => cell.type === "shell")
                .map((cell) => cell.id)
            );
            const missing = resolveShellIds.filter(
              (id) => !shellIdsOnServer.has(id)
            );
            if (missing.length === 0) {
              resolveShellPendingPersistence(resolveShellIds);
              setActionError(null);
            } else {
              const resolved = resolveShellIds.filter((id) =>
                shellIdsOnServer.has(id)
              );
              if (resolved.length > 0) {
                resolveShellPendingPersistence(resolved);
              }
              setActionError("Shell cell is still syncing. Please try again.");
            }
          }
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to save notebook"
        );
      }
    },
    [pendingShellIds, resolveShellPendingPersistence]
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

  const handleInterruptKernel = useCallback(() => {
    if (!notebook) return;
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
            body: JSON.stringify({ template: "blank" }),
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
          notebookRef.current = initial ?? null;
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

  // Notebook selection/navigation handled by router pages

  const handleCreateNotebook = useCallback(
    async (template: NotebookTemplateId = "blank") => {
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
    (
      id: string,
      updater: (cell: NotebookCell) => NotebookCell,
      options?: { persist?: boolean; touch?: boolean }
    ) => {
      updateNotebookCell(id, updater, options);
    },
    [updateNotebookCell]
  );

  const handleAddCell = useCallback(
    (type: NotebookCell["type"], index?: number) => {
      const nextCell =
        type === "code"
          ? createCodeCell({ language: "ts" })
          : type === "shell"
            ? createShellCell()
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
      if (type === "shell") {
        markShellPendingPersistence(nextCell.id);
        clearPendingSave();
        void saveNotebookNow({
          resolveShellIds: [nextCell.id],
          notebookSnapshot: updatedNotebook,
        });
      } else {
        scheduleAutoSave();
      }
    },
    [
      updateNotebook,
      scheduleAutoSave,
      saveNotebookNow,
      clearPendingSave,
      markShellPendingPersistence,
    ]
  );

  const handleDeleteCell = useCallback(
    (id: string) => {
      updateNotebook((current) => ({
        ...current,
        cells: current.cells.filter((cell) => cell.id !== id),
      }));
      removeShellPendingPersistence(id);
      scheduleAutoSave({ markDirty: true });
    },
    [updateNotebook, scheduleAutoSave, removeShellPendingPersistence]
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
      if (!notebook) return;
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
      const cell = notebook.cells.find((item) => item.id === id);
      if (!cell || cell.type !== "code") return;
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
      if (cell.type === "code") {
        handleRunCell(cell.id);
      }
    });
  }, [notebook, handleRunCell, updateNotebook]);

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
  }, [closeActiveSession, notebook, updateNotebook]);

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
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const handleSaveNow = useCallback(() => {
    clearPendingSave();
    void saveNotebookNow();
  }, [clearPendingSave, saveNotebookNow]);

  const handleOpenSharing = useCallback(() => {
    if (!isAdmin) {
      return;
    }
    setSharingOpen(true);
    setInvitationError(null);
    setShareFetchError(null);
    setNewInviteLink(null);
    setCopySuccess(false);
    void refreshSharingData();
  }, [isAdmin, refreshSharingData]);

  const handleInviteSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!isAdmin || shareSubmitting) {
        return;
      }
      const email = invitationEmail.trim();
      if (!email) {
        setInvitationError("Provide an email address");
        return;
      }
      setInvitationError(null);
      setShareFetchError(null);
      setShareSubmitting(true);
      try {
        const response = await fetch("/auth/invitations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, role: invitationRole }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          token?: string;
        };
        if (!response.ok) {
          setInvitationError(payload?.error ?? "Failed to send invitation");
          return;
        }
        setInvitationEmail("");
        if (
          typeof payload?.token === "string" &&
          typeof window !== "undefined"
        ) {
          const link = `${window.location.origin}/signup?token=${encodeURIComponent(
            payload.token
          )}`;
          setNewInviteLink(link);
          setCopySuccess(false);
        }
        await refreshSharingData();
      } catch {
        setInvitationError("Failed to send invitation");
      } finally {
        setShareSubmitting(false);
      }
    },
    [
      invitationEmail,
      invitationRole,
      isAdmin,
      refreshSharingData,
      shareSubmitting,
    ]
  );

  const handleRevokeInvitation = useCallback(
    async (invitationId: string) => {
      if (!isAdmin) {
        return;
      }
      setShareFetchError(null);
      setRevokingInvitationId(invitationId);
      try {
        const response = await fetch(
          `/auth/invitations/${encodeURIComponent(invitationId)}/revoke`,
          {
            method: "POST",
            headers: { Accept: "application/json" },
          }
        );
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          setShareFetchError(payload?.error ?? "Failed to revoke invitation");
          return;
        }
        await refreshSharingData();
      } catch {
        setShareFetchError("Failed to revoke invitation");
      } finally {
        setRevokingInvitationId(null);
      }
    },
    [isAdmin, refreshSharingData]
  );

  const handleSharingOpenChange = useCallback((open: boolean) => {
    setSharingOpen(open);
    if (!open) {
      setInvitationEmail("");
      setInvitationRole("editor");
      setInvitationError(null);
      setShareFetchError(null);
      setNewInviteLink(null);
      setCopySuccess(false);
    }
  }, []);

  const handleCopyInviteLink = useCallback(async () => {
    if (!newInviteLink) {
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(newInviteLink);
        if (copyTimeoutRef.current) {
          clearTimeout(copyTimeoutRef.current);
        }
        setCopySuccess(true);
        copyTimeoutRef.current = setTimeout(() => {
          setCopySuccess(false);
          copyTimeoutRef.current = null;
        }, 2000);
      }
    } catch {
      setCopySuccess(false);
    }
  }, [newInviteLink]);

  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      if (a.role !== b.role) {
        const roleOrder: Record<WorkspaceRole, number> = {
          admin: 0,
          editor: 1,
          viewer: 2,
        };
        return roleOrder[a.role] - roleOrder[b.role];
      }
      return a.email.localeCompare(b.email);
    });
  }, [members]);

  const sortedInvitations = useMemo(() => {
    return [...invitations].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  }, [invitations]);

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

  const editorView = useMemo(() => {
    if (loading) {
      return (
        <div className="flex flex-1 items-center justify-center p-10">
          <Card className="w-full max-w-md text-center">
            <CardContent className="py-10 text-muted-foreground">
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
              <p className="text-lg font-semibold text-foreground">
                Select a notebook to begin.
              </p>
              {error ? (
                <AlertCallout
                  level="error"
                  text={error}
                  className="text-left"
                  themeMode={theme}
                />
              ) : null}
            </CardContent>
          </Card>
        </div>
      );
    }

    if (notebook.cells.length === 0) {
      return (
        <div className="flex flex-1 items-center justify-center p-10">
          <Card className="w-full max-w-lg text-center">
            <CardContent className="space-y-6 py-10">
              <div className="space-y-2">
                <p className="text-lg font-semibold text-foreground">
                  Start building your notebook
                </p>
                <p className="text-sm text-muted-foreground">
                  Add a Markdown note, run JavaScript or TypeScript, or open a
                  shell session to begin.
                </p>
              </div>
              <AddCellMenu
                onAdd={(type) => handleAddCell(type)}
                className="mt-0 flex justify-center gap-2 text-[13px]"
              />
            </CardContent>
          </Card>
        </div>
      );
    }

    return (
      <div className="flex min-h-full flex-1 flex-col">
        <div className="flex flex-1 overflow-visible">
          <div className="flex-1 px-2 py-2">
            {error ? (
              <AlertCallout
                level="error"
                text={error}
                className="mb-6"
                themeMode={theme}
              />
            ) : null}
            {actionError ? (
              <AlertCallout
                level="error"
                text={actionError}
                className="mb-6"
                themeMode={theme}
              />
            ) : null}
            {/* Installation output shown at the top of the notebook */}
            {(depBusy || depOutputs.length > 0 || depError) && (
              <div className="mb-4 rounded-lg border border-border bg-card p-2 text-card-foreground shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Install output
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-foreground"
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
                <div className="mt-2 space-y-2 rounded-md border border-border bg-muted/20 p-2 text-[13px] text-foreground">
                  {depBusy && depOutputs.length === 0 ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
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

            {/* Tighter vertical rhythm between cells */}
            <div className="space-y-2">
              {notebook.cells.map((cell, index) => (
                <CellCard
                  key={cell.id}
                  cell={cell}
                  notebookId={notebook.id}
                  onAttachmentUploaded={handleAttachmentUploaded}
                  isRunning={runningCellId === cell.id}
                  queued={runQueue.includes(cell.id)}
                  canRun={socketReady}
                  canMoveUp={index > 0}
                  canMoveDown={index < notebook.cells.length - 1}
                  editorKey={`${cell.id}:${index}`}
                  editorPath={
                    cell.type === "code"
                      ? cellUri(notebook.id, index, {
                          id: cell.id,
                          language: cell.language === "ts" ? "ts" : "js",
                        })
                      : undefined
                  }
                  active={activeCellId === cell.id}
                  onActivate={() => setActiveCellId(cell.id)}
                  onChange={(updater, options) =>
                    handleCellChange(cell.id, updater, options)
                  }
                  onDelete={() => handleDeleteCell(cell.id)}
                  onRun={() => handleRunCell(cell.id)}
                  onInterrupt={handleInterruptKernel}
                  onMove={(direction) => handleMoveCell(cell.id, direction)}
                  onAddBelow={(type) => handleAddCell(type, index + 1)}
                  aiEnabled={aiEnabled}
                  dependencies={notebook.env.packages}
                  pendingShellPersist={pendingShellIds.has(cell.id)}
                />
              ))}
            </div>
            {/* bottom add menu omitted when cells exist; inline add controls live on each cell */}
          </div>
        </div>
      </div>
    );
  }, [
    loading,
    notebook,
    socketReady,
    error,
    actionError,
    runningCellId,
    runQueue,
    handleCellChange,
    handleDeleteCell,
    handleRunCell,
    handleMoveCell,
    handleAddCell,
    activeCellId,
    depBusy,
    depError,
    depOutputs,
    handleClearDepOutputs,
    handleAbortInstall,
    handleInterruptKernel,
    handleAttachmentUploaded,
    theme,
    aiEnabled,
    pendingShellIds,
    isAdmin,
    currentUserLoading,
    handleOpenSharing,
  ]);

  const topbarMain = useMemo(() => {
    if (!notebook) return null;
    return (
      <div className="flex w-full flex-wrap items-center gap-2 sm:flex-nowrap">
        {isRenaming ? (
          <input
            ref={renameInputRef}
            value={renameDraft}
            onChange={(event) => setRenameDraft(event.target.value)}
            onBlur={handleRenameCommit}
            onKeyDown={handleRenameKeyDown}
            className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm font-semibold text-foreground focus:outline-none sm:w-auto sm:min-w-[220px] sm:max-w-sm"
            aria-label="Notebook name"
          />
        ) : (
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left text-base font-semibold text-foreground"
            onClick={handleRenameStart}
            title={notebook.name}
          >
            {notebook.name}
          </button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={isRenaming ? handleRenameCommit : handleRenameStart}
          aria-label="Rename notebook"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </div>
    );
  }, [
    notebook,
    isRenaming,
    renameDraft,
    handleRenameCommit,
    handleRenameKeyDown,
    handleRenameStart,
  ]);

  const topbarRight = useMemo(() => {
    if (!notebook) return null;
    const runtimeName =
      notebook.env.runtime === "node" ? "Node.js" : notebook.env.runtime;
    const versionLabel = notebook.env.version
      ? notebook.env.version.startsWith("v")
        ? notebook.env.version
        : `v${notebook.env.version}`
      : "unknown";
    const kernelStatusLabel = socketReady
      ? "Kernel connected"
      : sessionId
        ? "Kernel disconnected"
        : "Kernel connecting";
    const kernelStatusText = socketReady
      ? "Kernel connected"
      : sessionId
        ? "Kernel disconnected"
        : "Kernel connecting";
    const kernelStatusColor = socketReady ? "bg-emerald-500" : "bg-amber-500";
    const saveStatusLabel = dirty
      ? "You have unsaved changes"
      : "All changes saved";
    const saveStatusText = dirty ? "Unsaved" : "Saved";
    const saveStatusColor = dirty ? "bg-amber-500" : "bg-emerald-500";
    return (
      <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className="shrink-0 text-xs font-semibold sm:text-[11px]"
          >
            {runtimeName} {versionLabel}
          </Badge>
          <div className="items-center gap-2 text-[11px] text-muted-foreground sm:flex">
            <StatusDot
              colorClass={kernelStatusColor}
              label={kernelStatusLabel}
              text={kernelStatusText}
              showText
            />
            <StatusDot
              colorClass={saveStatusColor}
              label={saveStatusLabel}
              text={saveStatusText}
              showText
            />
          </div>
        </div>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-1.5 sm:flex-none sm:gap-2">
          <Button
            variant={dirty ? "secondary" : "ghost"}
            size="icon"
            onClick={handleSaveNow}
            disabled={!dirty}
            aria-label="Save notebook"
            title={dirty ? "Save notebook" : "Saved"}
          >
            {dirty ? (
              <Save className="h-4 w-4" />
            ) : (
              <Check className="h-4 w-4 text-emerald-500" />
            )}
          </Button>
          <Button
            variant="default"
            size="icon"
            onClick={handleRunAll}
            disabled={!socketReady}
            aria-label="Run all cells"
            title="Run all cells"
          >
            <PlayCircle className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setConfirmClearOutputsOpen(true)}
            aria-label="Clear all outputs"
            title="Clear all outputs"
          >
            <Eraser className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleReconnectKernel}
            aria-label="Reconnect kernel"
            title="Reconnect kernel"
            disabled={!sessionId}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setConfirmRestartOpen(true)}
            aria-label="Restart kernel"
            title="Restart kernel"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleOpenSharing}
            aria-label={
              isAdmin
                ? "Invite collaborators"
                : "Only admins can invite collaborators"
            }
            title={
              isAdmin
                ? "Invite collaborators"
                : "Only admins can invite collaborators"
            }
            disabled={!isAdmin || currentUserLoading}
          >
            {isAdmin ? (
              <Share2 className="h-4 w-4" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleExportNotebook}
            aria-label="Export notebook"
            title="Export notebook"
            disabled={exporting}
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-rose-600 hover:text-rose-700"
            onClick={() => setConfirmDeleteOpen(true)}
            aria-label="Delete notebook"
            title="Delete notebook"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }, [
    notebook,
    socketReady,
    dirty,
    handleReconnectKernel,
    handleRunAll,
    handleExportNotebook,
    handleSaveNow,
    handleOpenSharing,
    sessionId,
    exporting,
    isAdmin,
    currentUserLoading,
  ]);

  const secondaryHeader = useMemo(() => {
    if (!notebook) return null;
    return (
      <Tabs
        value={sidebarView}
        onValueChange={(v) =>
          setSidebarView(v as "outline" | "attachments" | "setup")
        }
      >
        <TabsList className="h-8">
          <TabsTrigger value="outline" className="gap-1 px-2 py-1 text-xs">
            <ListTree className="h-4 w-4" /> Outline
          </TabsTrigger>
          <TabsTrigger value="attachments" className="gap-1 px-2 py-1 text-xs">
            <Paperclip className="h-4 w-4" /> Attachments
          </TabsTrigger>
          <TabsTrigger value="setup" className="gap-1 px-2 py-1 text-xs">
            <SettingsIcon className="h-4 w-4" /> Setup
          </TabsTrigger>
        </TabsList>
      </Tabs>
    );
  }, [notebook, sidebarView]);

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
            onDelete={handleDeleteAttachment}
            onAttachmentUploaded={handleAttachmentUploaded}
          />
        ) : sidebarView === "setup" ? (
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
    attachments,
    attachmentsLoading,
    attachmentsError,
    handleDeleteAttachment,
    handleAttachmentUploaded,
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
      defaultCollapsed={false}
      secondaryHeader={secondaryHeader}
      headerMain={topbarMain}
      headerRight={topbarRight}
    >
      {editorView}
      <Dialog
        open={sharingOpen && isAdmin}
        onOpenChange={handleSharingOpenChange}
      >
        <DialogContent className="max-w-2xl space-y-6">
          <DialogHeader>
            <DialogTitle>Invite collaborators</DialogTitle>
            <DialogDescription>
              Send role-based invitations. Invitees must create their own
              password before accessing the workspace.
            </DialogDescription>
          </DialogHeader>
          {shareFetchError ? (
            <AlertCallout
              variant="error"
              title="Unable to load sharing data"
              className="text-sm"
            >
              {shareFetchError}
            </AlertCallout>
          ) : null}
          <form onSubmit={handleInviteSubmit} className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-2">
                <label
                  htmlFor="invitation-email"
                  className="text-sm font-medium text-foreground"
                >
                  Email address
                </label>
                <input
                  id="invitation-email"
                  type="email"
                  required
                  value={invitationEmail}
                  onChange={(event) => setInvitationEmail(event.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="person@example.com"
                  disabled={shareSubmitting}
                />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="invitation-role"
                  className="text-sm font-medium"
                >
                  Role
                </label>
                <select
                  id="invitation-role"
                  value={invitationRole}
                  onChange={(event) =>
                    setInvitationRole(event.target.value as WorkspaceRole)
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
                  disabled={shareSubmitting}
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  Admins can manage settings and invite others. Editors can
                  modify notebooks, while viewers have read-only access.
                </p>
              </div>
            </div>
            {invitationError ? (
              <p className="text-sm text-destructive" role="alert">
                {invitationError}
              </p>
            ) : null}
            <DialogFooter className="gap-2">
              <Button type="submit" disabled={shareSubmitting}>
                {shareSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
                  </>
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" /> Send invite
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
          {newInviteLink ? (
            <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
              <p className="text-sm font-medium text-foreground">
                Share this signup link:
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  value={newInviteLink}
                  readOnly
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <Button
                  type="button"
                  variant={copySuccess ? "secondary" : "outline"}
                  onClick={handleCopyInviteLink}
                  className="shrink-0"
                >
                  {copySuccess ? (
                    <>
                      <Check className="mr-2 h-4 w-4" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-2 h-4 w-4" /> Copy link
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : null}
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-foreground">
                  Invitations
                </h4>
                <Badge variant="outline">{sortedInvitations.length}</Badge>
              </div>
              {invitesLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading
                  invitations…
                </div>
              ) : sortedInvitations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No invitations have been sent yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {sortedInvitations.map((invitation) => {
                    const expiresAt = Date.parse(invitation.expiresAt);
                    const expired =
                      !invitation.acceptedAt &&
                      !invitation.revokedAt &&
                      Number.isFinite(expiresAt) &&
                      expiresAt <= Date.now();
                    const status = invitation.acceptedAt
                      ? "Accepted"
                      : invitation.revokedAt
                        ? "Revoked"
                        : expired
                          ? "Expired"
                          : "Pending";
                    const statusColor = invitation.acceptedAt
                      ? "text-emerald-600"
                      : invitation.revokedAt || expired
                        ? "text-muted-foreground"
                        : "text-sky-600";
                    return (
                      <li
                        key={invitation.id}
                        className="flex flex-col gap-3 rounded-md border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="space-y-1 text-sm">
                          <div className="flex flex-wrap items-center gap-2 font-medium">
                            <span>{invitation.email}</span>
                            <Badge variant="outline" className="capitalize">
                              {invitation.role}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Invited{" "}
                            {new Date(invitation.createdAt).toLocaleString()}
                            {invitation.invitedByUser
                              ? ` · by ${
                                  invitation.invitedByUser.name ??
                                  invitation.invitedByUser.email
                                }`
                              : ""}
                          </p>
                          <p className={`text-xs ${statusColor}`}>
                            Status: {status}
                          </p>
                          {!invitation.acceptedAt && !invitation.revokedAt ? (
                            <p className="text-xs text-muted-foreground">
                              Expires{" "}
                              {new Date(invitation.expiresAt).toLocaleString()}
                            </p>
                          ) : null}
                        </div>
                        {!invitation.acceptedAt && !invitation.revokedAt ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              void handleRevokeInvitation(invitation.id)
                            }
                            disabled={revokingInvitationId === invitation.id}
                          >
                            {revokingInvitationId === invitation.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Ban className="mr-2 h-4 w-4" />
                            )}
                            Revoke
                          </Button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-foreground">
                  Workspace members
                </h4>
                <Badge variant="outline">{sortedMembers.length}</Badge>
              </div>
              {sortedMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No members found.
                </p>
              ) : (
                <ul className="space-y-2">
                  {sortedMembers.map((member) => (
                    <li
                      key={member.id}
                      className="flex flex-col gap-1 rounded-md border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {member.name ?? member.email}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {member.email} · {member.role}
                        </p>
                      </div>
                      {member.id === currentUser?.id ? (
                        <Badge variant="secondary">You</Badge>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
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
