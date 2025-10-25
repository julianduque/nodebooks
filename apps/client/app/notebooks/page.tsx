"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  DndProvider,
  useDrag,
  useDrop,
  type DropTargetMonitor,
} from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import ConfirmDialog from "@/components/ui/confirm";
import LoadingOverlay from "@/components/ui/loading-overlay";
import NewNotebookCallout from "@/components/notebook/new-notebook-callout";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Play,
  Trash2,
  Download,
  Upload,
  Loader2,
  Users,
  Plus,
  Edit2,
  GripVertical,
  Megaphone,
  EyeOff,
  ExternalLink,
  Globe2,
} from "lucide-react";
import { useCurrentUser } from "@/components/notebook/hooks/use-current-user";
import type {
  NotebookWithAccess,
  ProjectWithNotebooks,
} from "@/components/notebook/types";
import { useProjectSharing } from "@/components/notebook/hooks/use-project-sharing";
import ProjectSharingDialog from "@/components/notebook/project-sharing-dialog";
import { useTheme } from "@/components/theme-context";
import PublishDialog from "@/components/notebook/publish-dialog";
import {
  publishNotebook,
  unpublishNotebook,
  publishProject,
  unpublishProject,
} from "@/components/notebook/api";
import { suggestSlug } from "@nodebooks/notebook-schema";

import { clientConfig } from "@nodebooks/config/client";

const API_BASE_URL = clientConfig().apiBaseUrl;
const NOTEBOOK_ITEM_TYPE = "NOTEBOOK_ITEM";

interface DragNotebookItem {
  type: typeof NOTEBOOK_ITEM_TYPE;
  notebookId: string;
  fromProjectId: string | null;
  index: number;
}

interface ProjectBoard {
  projects: ProjectWithNotebooks[];
  unassigned: NotebookWithAccess[];
}

const projectSlug = (projectId: string | null) =>
  projectId ? encodeURIComponent(projectId) : "unassigned";

const formatTimestamp = (value: string) => new Date(value).toLocaleString();

const resequence = (
  notebooks: NotebookWithAccess[],
  projectId: string | null
): NotebookWithAccess[] =>
  notebooks.map((notebook, index) => ({
    ...notebook,
    projectId,
    projectOrder: index,
  }));

interface NotebookCardProps {
  notebook: NotebookWithAccess;
  projectId: string | null;
  index: number;
  isAdmin: boolean;
  onOpen: (id: string) => void;
  onExport: (notebook: NotebookWithAccess) => void;
  onDelete: (id: string) => void;
  exporting: boolean;
  onMove: (
    item: DragNotebookItem,
    targetProjectId: string | null,
    targetIndex: number
  ) => void;
  onRename: (notebook: NotebookWithAccess) => void;
  onPublish: (notebook: NotebookWithAccess) => void;
  onUnpublish: (notebook: NotebookWithAccess) => void;
  onViewPublished?: (notebook: NotebookWithAccess) => void;
  publishingId: string | null;
  unpublishingId: string | null;
}

const NotebookCard = ({
  notebook,
  projectId,
  index,
  isAdmin,
  onOpen,
  onExport,
  onDelete,
  exporting,
  onMove,
  onRename,
  onPublish,
  onUnpublish,
  onViewPublished,
  publishingId,
  unpublishingId,
}: NotebookCardProps) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [{ isDragging }, drag, preview] = useDrag(
    () => ({
      type: NOTEBOOK_ITEM_TYPE,
      canDrag: isAdmin,
      item: {
        type: NOTEBOOK_ITEM_TYPE,
        notebookId: notebook.id,
        fromProjectId: projectId,
        index,
      } satisfies DragNotebookItem,
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
    }),
    [isAdmin, notebook.id, projectId, index]
  );

  const [, drop] = useDrop(
    () => ({
      accept: NOTEBOOK_ITEM_TYPE,
      canDrop: () => isAdmin,
      drop: (item: DragNotebookItem, monitor: DropTargetMonitor) => {
        if (item.notebookId === notebook.id || monitor.didDrop()) {
          return;
        }
        onMove(item, projectId, index);
      },
    }),
    [isAdmin, projectId, index, notebook.id, onMove]
  );

  preview(drop(ref));
  if (isAdmin) {
    drag(ref);
  }

  const isPublishing = publishingId === notebook.id;
  const isUnpublishing = unpublishingId === notebook.id;
  const publishBusy = isPublishing || isUnpublishing;

  return (
    <Card
      ref={ref}
      className={`flex flex-col gap-4 px-6 py-4 transition-opacity sm:flex-row sm:items-center sm:justify-between ${isDragging ? "opacity-60" : ""} ${isAdmin ? "cursor-move" : ""}`}
    >
      <div className="flex w-full flex-1 gap-3">
        {isAdmin ? (
          <span className="mt-1 text-muted-foreground">
            <GripVertical className="h-4 w-4" />
          </span>
        ) : null}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-lg font-semibold text-card-foreground">
              {notebook.name}
            </h3>
            {notebook.published ? (
              <Badge className="flex items-center gap-1 bg-emerald-600 text-xs font-semibold text-white">
                <Globe2 className="h-3 w-3" />
                Published
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            Updated {formatTimestamp(notebook.updatedAt)}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="default"
          size="sm"
          className="gap-2"
          onClick={() => onOpen(notebook.id)}
        >
          <Play className="h-4 w-4" />
          Open
        </Button>
        {isAdmin ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onRename(notebook)}
            aria-label={`Rename ${notebook.name}`}
            title="Rename notebook"
          >
            <Edit2 className="h-4 w-4" />
          </Button>
        ) : null}
        {isAdmin ? (
          <Button
            variant={notebook.published ? "secondary" : "ghost"}
            size="icon"
            onClick={() =>
              notebook.published ? onUnpublish(notebook) : onPublish(notebook)
            }
            aria-label={
              notebook.published
                ? `Unpublish ${notebook.name}`
                : `Publish ${notebook.name}`
            }
            title={
              notebook.published ? "Unpublish notebook" : "Publish notebook"
            }
            disabled={publishBusy}
          >
            {publishBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : notebook.published ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Megaphone className="h-4 w-4" />
            )}
          </Button>
        ) : null}
        {notebook.published && onViewPublished ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onViewPublished(notebook)}
            aria-label={`Open published view for ${notebook.name}`}
            title="Open published view"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onExport(notebook)}
          disabled={exporting}
          aria-label={`Export ${notebook.name}`}
          title="Export notebook"
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
        </Button>
        {isAdmin ? (
          <Button
            variant="ghost"
            size="icon"
            className="text-rose-600 hover:text-rose-700"
            onClick={() => onDelete(notebook.id)}
            aria-label={`Delete ${notebook.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </Card>
  );
};

interface NotebookGroupProps {
  title: string;
  projectId: string | null;
  notebooks: NotebookWithAccess[];
  isAdmin: boolean;
  onOpenNotebook: (id: string) => void;
  onExportNotebook: (notebook: NotebookWithAccess) => void;
  onDeleteNotebook: (id: string) => void;
  onMoveNotebook: (
    item: DragNotebookItem,
    targetProjectId: string | null,
    targetIndex: number
  ) => void;
  onRenameNotebook: (notebook: NotebookWithAccess) => void;
  onPublishNotebook: (notebook: NotebookWithAccess) => void;
  onUnpublishNotebook: (notebook: NotebookWithAccess) => void;
  onViewPublishedNotebook?: (notebook: NotebookWithAccess) => void;
  exportingId: string | null;
  publishingId: string | null;
  unpublishingId: string | null;
  emptyLabel?: string;
  headerActions?: React.ReactNode;
}

const NotebookGroup = ({
  title,
  projectId,
  notebooks,
  isAdmin,
  onOpenNotebook,
  onExportNotebook,
  onDeleteNotebook,
  onMoveNotebook,
  onRenameNotebook,
  onPublishNotebook,
  onUnpublishNotebook,
  onViewPublishedNotebook,
  exportingId,
  publishingId,
  unpublishingId,
  emptyLabel,
  headerActions,
}: NotebookGroupProps) => {
  const [{ isOver }, drop] = useDrop(
    () => ({
      accept: NOTEBOOK_ITEM_TYPE,
      canDrop: () => isAdmin,
      drop: (item: DragNotebookItem, monitor: DropTargetMonitor) => {
        if (monitor.didDrop()) {
          return;
        }
        const targetIndex = notebooks.length;
        onMoveNotebook(item, projectId, targetIndex);
      },
      collect: (monitor) => ({
        isOver: monitor.isOver({ shallow: true }) && monitor.canDrop(),
      }),
    }),
    [isAdmin, notebooks.length, onMoveNotebook, projectId]
  );

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <div className="flex items-center gap-2">{headerActions}</div>
      </div>
      <div
        ref={(node) => {
          drop(node);
        }}
        className={`space-y-3 rounded-lg border border-dashed border-transparent p-1 transition-colors ${isOver ? "border-ring bg-muted/30" : ""}`}
      >
        {notebooks.length === 0 ? (
          <p className="rounded-md border border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            {emptyLabel ?? "No notebooks yet. Drag notebooks here to organize."}
          </p>
        ) : (
          notebooks.map((notebook, index) => (
            <NotebookCard
              key={notebook.id}
              notebook={notebook}
              projectId={projectId}
              index={index}
              isAdmin={isAdmin}
              onOpen={onOpenNotebook}
              onExport={onExportNotebook}
              onDelete={onDeleteNotebook}
              exporting={exportingId === notebook.id}
              onMove={onMoveNotebook}
              onRename={onRenameNotebook}
              onPublish={onPublishNotebook}
              onUnpublish={onUnpublishNotebook}
              onViewPublished={onViewPublishedNotebook}
              publishingId={publishingId}
              unpublishingId={unpublishingId}
            />
          ))
        )}
      </div>
    </section>
  );
};

interface ProjectSidebarProps {
  board: ProjectBoard;
  selectedProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
  onCreateProject?: () => void;
  onOpenNotebook: (id: string) => void;
  isAdmin: boolean;
}

const ProjectSidebar = ({
  board,
  selectedProjectId,
  onSelectProject,
  onCreateProject,
  onOpenNotebook,
  isAdmin,
}: ProjectSidebarProps) => {
  const totalCount = useMemo(
    () =>
      board.unassigned.length +
      board.projects.reduce(
        (acc, project) => acc + project.notebooks.length,
        0
      ),
    [board]
  );

  const renderNotebookLinks = (notebooks: NotebookWithAccess[]) => (
    <ul className="mt-2 space-y-1 pl-4 text-xs">
      {notebooks.map((notebook) => (
        <li key={notebook.id}>
          <button
            type="button"
            className="w-full truncate rounded-md px-2 py-1 text-left text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => onOpenNotebook(notebook.id)}
          >
            <span className="flex items-center gap-2">
              <span className="truncate">{notebook.name}</span>
              {notebook.published ? (
                <Badge variant="secondary" className="text-[9px]">
                  Published
                </Badge>
              ) : null}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Projects
          </p>
          <p className="text-sm text-muted-foreground">
            {totalCount} notebooks
          </p>
        </div>
        {isAdmin ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onCreateProject}
            title="Create project"
          >
            <Plus className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-4">
        <button
          type="button"
          className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${selectedProjectId === null ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
          onClick={() => onSelectProject(null)}
        >
          <span>Workspace</span>
          <Badge variant={selectedProjectId === null ? "default" : "outline"}>
            {board.unassigned.length}
          </Badge>
        </button>
        {selectedProjectId === null && board.unassigned.length > 0
          ? renderNotebookLinks(board.unassigned)
          : null}
        {board.projects.map((group) => (
          <div key={group.project.id} className="space-y-1">
            <button
              type="button"
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${selectedProjectId === group.project.id ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
              onClick={() => onSelectProject(group.project.id)}
            >
              <span className="flex items-center gap-2">
                {group.project.name}
                {group.project.published ? (
                  <Badge variant="secondary" className="h-5 px-2 text-[10px]">
                    Published
                  </Badge>
                ) : null}
              </span>
              <Badge
                variant={
                  selectedProjectId === group.project.id ? "default" : "outline"
                }
              >
                {group.notebooks.length}
              </Badge>
            </button>
            {selectedProjectId === group.project.id &&
            group.notebooks.length > 0
              ? renderNotebookLinks(group.notebooks)
              : null}
          </div>
        ))}
      </div>
    </div>
  );
};

interface ProjectNameDialogState {
  mode: "create" | "rename";
  projectId?: string;
  open: boolean;
}

interface ProjectNameDialogProps {
  state: ProjectNameDialogState | null;
  value: string;
  error: string | null;
  submitting: boolean;
  onValueChange(value: string): void;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
  onOpenChange(open: boolean): void;
}

const ProjectNameDialog = ({
  state,
  value,
  error,
  submitting,
  onValueChange,
  onSubmit,
  onOpenChange,
}: ProjectNameDialogProps) => {
  if (!state) {
    return null;
  }

  const title = state.mode === "create" ? "Create project" : "Rename project";
  const description =
    state.mode === "create"
      ? "Organize notebooks into a new project."
      : "Update the project name.";
  const confirmLabel = state.mode === "create" ? "Create" : "Save";

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md space-y-4">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={onSubmit}>
          <div className="space-y-2">
            <label htmlFor="project-name" className="text-sm font-medium">
              Project name
            </label>
            <Input
              id="project-name"
              autoFocus
              value={value}
              onChange={(event) => onValueChange(event.target.value)}
              placeholder="Data science workshop"
              disabled={submitting}
            />
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />{" "}
                  {confirmLabel}…
                </>
              ) : (
                confirmLabel
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

interface NotebookRenameDialogProps {
  open: boolean;
  value: string;
  error: string | null;
  submitting: boolean;
  onValueChange(value: string): void;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
  onOpenChange(open: boolean): void;
}

const NotebookRenameDialog = ({
  open,
  value,
  error,
  submitting,
  onValueChange,
  onSubmit,
  onOpenChange,
}: NotebookRenameDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md space-y-4">
        <DialogHeader>
          <DialogTitle>Rename notebook</DialogTitle>
          <DialogDescription>
            Update the notebook title. Changes are visible to everyone with
            access.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={onSubmit}>
          <div className="space-y-2">
            <label htmlFor="notebook-rename" className="text-sm font-medium">
              Notebook name
            </label>
            <Input
              id="notebook-rename"
              autoFocus
              value={value}
              onChange={(event) => onValueChange(event.target.value)}
              placeholder="My analysis notebook"
              disabled={submitting}
            />
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default function NotebooksPage() {
  const { currentUser, isAdmin } = useCurrentUser();
  const { theme } = useTheme();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [board, setBoard] = useState<ProjectBoard>({
    projects: [],
    unassigned: [],
  });
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null
  );
  const [projectNameDialog, setProjectNameDialog] =
    useState<ProjectNameDialogState | null>(null);
  const [projectNameValue, setProjectNameValue] = useState("");
  const [projectNameSubmitting, setProjectNameSubmitting] = useState(false);
  const [projectNameError, setProjectNameError] = useState<string | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [sharingProjectId, setSharingProjectId] = useState<string | null>(null);
  const [renameNotebookId, setRenameNotebookId] = useState<string | null>(null);
  const [renameNotebookValue, setRenameNotebookValue] = useState("");
  const [renameNotebookSubmitting, setRenameNotebookSubmitting] =
    useState(false);
  const [renameNotebookError, setRenameNotebookError] = useState<string | null>(
    null
  );
  const [publishNotebookTarget, setPublishNotebookTarget] =
    useState<NotebookWithAccess | null>(null);
  const [notebookPublishError, setNotebookPublishError] = useState<
    string | null
  >(null);
  const [notebookPublishSubmitting, setNotebookPublishSubmitting] =
    useState(false);
  const [unpublishNotebookTarget, setUnpublishNotebookTarget] =
    useState<NotebookWithAccess | null>(null);
  const [notebookUnpublishSubmitting, setNotebookUnpublishSubmitting] =
    useState(false);
  const [publishProjectTarget, setPublishProjectTarget] =
    useState<ProjectWithNotebooks | null>(null);
  const [projectPublishError, setProjectPublishError] = useState<string | null>(
    null
  );
  const [projectPublishSubmitting, setProjectPublishSubmitting] =
    useState(false);
  const [unpublishProjectTarget, setUnpublishProjectTarget] =
    useState<ProjectWithNotebooks | null>(null);
  const [projectUnpublishSubmitting, setProjectUnpublishSubmitting] =
    useState(false);

  const sortProjectNotebooks = (list: NotebookWithAccess[]) =>
    [...list].sort((a, b) => {
      const orderA = a.projectOrder ?? Number.POSITIVE_INFINITY;
      const orderB = b.projectOrder ?? Number.POSITIVE_INFINITY;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.name.localeCompare(b.name);
    });

  const applyNotebookUpdate = useCallback((updated: NotebookWithAccess) => {
    setBoard((prev) => ({
      projects: prev.projects.map((group) => ({
        project: group.project,
        notebooks: group.notebooks.map((item) =>
          item.id === updated.id ? { ...item, ...updated } : item
        ),
      })),
      unassigned: prev.unassigned.map((item) =>
        item.id === updated.id ? { ...item, ...updated } : item
      ),
    }));
  }, []);

  const applyProjectUpdate = useCallback(
    (
      project: ProjectWithNotebooks["project"],
      notebooks: NotebookWithAccess[]
    ) => {
      const sorted = sortProjectNotebooks(notebooks);
      const map = new Map(sorted.map((nb) => [nb.id, nb]));
      setBoard((prev) => ({
        projects: prev.projects.map((group) =>
          group.project.id === project.id
            ? {
                project,
                notebooks: sorted,
              }
            : {
                project: group.project,
                notebooks: group.notebooks.map((item) =>
                  map.has(item.id) ? { ...item, ...map.get(item.id)! } : item
                ),
              }
        ),
        unassigned: prev.unassigned.map((item) =>
          map.has(item.id) ? { ...item, ...map.get(item.id)! } : item
        ),
      }));
    },
    []
  );

  const getNotebookPublishHref = useCallback(
    (notebook: NotebookWithAccess) => {
      if (!notebook.published) {
        return null;
      }
      if (notebook.projectId) {
        const group = board.projects.find(
          (entry) => entry.project.id === notebook.projectId
        );
        if (group?.project.slug) {
          const slugPart = notebook.publicSlug ?? notebook.id;
          return `/v/${encodeURIComponent(group.project.slug)}/${encodeURIComponent(slugPart)}`;
        }
      }
      const identifier = notebook.publicSlug ?? notebook.id;
      return `/v/${encodeURIComponent(identifier)}`;
    },
    [board.projects]
  );

  const projectSharing = useProjectSharing({
    isAdmin,
    projectId: sharingProjectId ?? undefined,
  });

  const handleOpenRenameNotebook = useCallback(
    (notebook: NotebookWithAccess) => {
      if (!isAdmin) {
        setActionError("Only workspace admins can rename notebooks.");
        return;
      }
      setRenameNotebookId(notebook.id);
      setRenameNotebookValue(notebook.name);
      setRenameNotebookError(null);
    },
    [isAdmin]
  );

  const handlePublishNotebook = useCallback(
    (notebook: NotebookWithAccess) => {
      if (!isAdmin) {
        setActionError("Only workspace admins can publish notebooks.");
        return;
      }
      setNotebookPublishError(null);
      setPublishNotebookTarget(notebook);
    },
    [isAdmin]
  );

  const handleNotebookPublishSubmit = useCallback(
    async (slug: string | null) => {
      if (!publishNotebookTarget) {
        return;
      }
      setNotebookPublishSubmitting(true);
      setNotebookPublishError(null);
      try {
        const updated = await publishNotebook(
          publishNotebookTarget.id,
          slug ?? undefined
        );
        applyNotebookUpdate(updated);
        setPublishNotebookTarget(null);
      } catch (error) {
        setNotebookPublishError(
          error instanceof Error ? error.message : "Failed to publish notebook"
        );
      } finally {
        setNotebookPublishSubmitting(false);
      }
    },
    [publishNotebookTarget, applyNotebookUpdate]
  );

  const handleUnpublishNotebook = useCallback(
    (notebook: NotebookWithAccess) => {
      if (!isAdmin) {
        setActionError("Only workspace admins can unpublish notebooks.");
        return;
      }
      setUnpublishNotebookTarget(notebook);
    },
    [isAdmin]
  );

  const confirmUnpublishNotebook = useCallback(async () => {
    if (!unpublishNotebookTarget) {
      return;
    }
    setNotebookUnpublishSubmitting(true);
    setActionError(null);
    try {
      const updated = await unpublishNotebook(unpublishNotebookTarget.id);
      applyNotebookUpdate(updated);
      setUnpublishNotebookTarget(null);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to unpublish notebook"
      );
    } finally {
      setNotebookUnpublishSubmitting(false);
    }
  }, [unpublishNotebookTarget, applyNotebookUpdate]);

  const handleViewPublishedNotebook = useCallback(
    (notebook: NotebookWithAccess) => {
      const href = getNotebookPublishHref(notebook);
      if (!href) {
        return;
      }
      window.open(href, "_blank", "noopener,noreferrer");
    },
    [getNotebookPublishHref]
  );

  const handlePublishProject = useCallback(
    (project: ProjectWithNotebooks) => {
      if (!isAdmin) {
        setActionError("Only workspace admins can publish projects.");
        return;
      }
      setProjectPublishError(null);
      setPublishProjectTarget(project);
    },
    [isAdmin]
  );

  const handleProjectPublishSubmit = useCallback(
    async (slug: string | null) => {
      if (!publishProjectTarget) {
        return;
      }
      setProjectPublishSubmitting(true);
      setProjectPublishError(null);
      try {
        const result = await publishProject(
          publishProjectTarget.project.id,
          slug ?? undefined
        );
        applyProjectUpdate(result.project, result.notebooks ?? []);
        setPublishProjectTarget(null);
      } catch (error) {
        setProjectPublishError(
          error instanceof Error ? error.message : "Failed to publish project"
        );
      } finally {
        setProjectPublishSubmitting(false);
      }
    },
    [publishProjectTarget, applyProjectUpdate]
  );

  const handleUnpublishProject = useCallback(
    (project: ProjectWithNotebooks) => {
      if (!isAdmin) {
        setActionError("Only workspace admins can unpublish projects.");
        return;
      }
      setUnpublishProjectTarget(project);
    },
    [isAdmin]
  );

  const confirmUnpublishProject = useCallback(async () => {
    if (!unpublishProjectTarget) {
      return;
    }
    setProjectUnpublishSubmitting(true);
    setActionError(null);
    try {
      const result = await unpublishProject(unpublishProjectTarget.project.id);
      applyProjectUpdate(result.project, result.notebooks ?? []);
      setUnpublishProjectTarget(null);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to unpublish project"
      );
    } finally {
      setProjectUnpublishSubmitting(false);
    }
  }, [unpublishProjectTarget, applyProjectUpdate]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setActionError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/projects`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload?.error ?? "Failed to load projects");
      }
      const payload = (await response.json().catch(() => ({}))) as {
        data?: {
          projects?: ProjectWithNotebooks[];
          unassignedNotebooks?: NotebookWithAccess[];
        };
      };
      const projects = Array.isArray(payload?.data?.projects)
        ? payload.data!.projects.map((entry) => ({
            project: entry.project,
            notebooks: entry.notebooks ?? [],
          }))
        : [];
      const unassigned = Array.isArray(payload?.data?.unassignedNotebooks)
        ? payload.data!.unassignedNotebooks
        : [];
      setBoard({ projects, unassigned });
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to load projects"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (projectSharing.sharingOpen && !sharingProjectId) {
      projectSharing.handleSharingOpenChange(false);
    }
  }, [projectSharing, sharingProjectId]);

  useEffect(() => {
    if (sharingProjectId && !projectSharing.sharingOpen) {
      projectSharing.handleOpenSharing();
    }
  }, [sharingProjectId, projectSharing]);

  useEffect(() => {
    if (selectedProjectId) {
      const exists = board.projects.some(
        (project) => project.project.id === selectedProjectId
      );
      if (!exists) {
        setSelectedProjectId((prev) =>
          prev && board.projects.length > 0
            ? board.projects[0].project.id
            : null
        );
      }
    } else if (
      selectedProjectId === null &&
      board.unassigned.length === 0 &&
      board.projects.length > 0
    ) {
      setSelectedProjectId(board.projects[0].project.id);
    }
  }, [board, selectedProjectId]);

  const totalNotebooks = useMemo(
    () =>
      board.unassigned.length +
      board.projects.reduce(
        (acc, project) => acc + project.notebooks.length,
        0
      ),
    [board]
  );

  const publishingNotebookId =
    notebookPublishSubmitting && publishNotebookTarget
      ? publishNotebookTarget.id
      : null;
  const unpublishingNotebookId =
    notebookUnpublishSubmitting && unpublishNotebookTarget
      ? unpublishNotebookTarget.id
      : null;
  const publishingProjectId =
    projectPublishSubmitting && publishProjectTarget
      ? publishProjectTarget.project.id
      : null;
  const unpublishingProjectId =
    projectUnpublishSubmitting && unpublishProjectTarget
      ? unpublishProjectTarget.project.id
      : null;

  const handleOpen = useCallback(
    (id: string) => router.push(`/notebooks/${id}`),
    [router]
  );

  const handleDeleteNotebook = useCallback(
    async (id: string) => {
      if (!isAdmin) {
        setActionError("Only workspace admins can delete notebooks.");
        return;
      }
      await fetch(`${API_BASE_URL}/notebooks/${id}`, { method: "DELETE" });
      void refresh();
    },
    [isAdmin, refresh]
  );

  const handleCreateNotebook = useCallback(async () => {
    if (!isAdmin) {
      setActionError("Only workspace admins can create notebooks.");
      return;
    }
    const response = await fetch(`${API_BASE_URL}/notebooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template: "blank" }),
    });
    const payload = await response.json().catch(() => ({}));
    const created: NotebookWithAccess | undefined = payload?.data;
    if (created) {
      router.push(`/notebooks/${created.id}`);
      return;
    }
    setActionError("Failed to create notebook");
  }, [isAdmin, router]);

  const handleImportClick = useCallback(() => {
    setActionError(null);
    if (!isAdmin) {
      setActionError("Only workspace admins can import notebooks.");
      return;
    }
    fileInputRef.current?.click();
  }, [isAdmin]);

  const handleImportFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      if (!isAdmin) {
        setImporting(false);
        setActionError("Only workspace admins can import notebooks.");
        event.target.value = "";
        return;
      }
      setImporting(true);
      setActionError(null);
      try {
        const contents = await file.text();
        const res = await fetch(`${API_BASE_URL}/notebooks/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents }),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          const message =
            typeof payload?.error === "string"
              ? payload.error
              : "Failed to import notebook";
          throw new Error(message);
        }
        const created: NotebookWithAccess | undefined = payload?.data;
        if (created) {
          router.push(`/notebooks/${created.id}`);
        } else {
          void refresh();
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to import notebook";
        setActionError(message);
      } finally {
        setImporting(false);
        event.target.value = "";
      }
    },
    [isAdmin, refresh, router]
  );

  const slugify = useCallback((value: string) => {
    return (
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64) || "notebook"
    );
  }, []);

  const handleExport = useCallback(
    async (notebook: NotebookWithAccess) => {
      setExportingId(notebook.id);
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
        setExportingId(null);
      }
    },
    [slugify]
  );

  const persistMove = useCallback(
    async (data: {
      targetProjectId: string | null;
      targetIds: string[];
      sourceProjectId: string | null;
      sourceIds: string[];
    }) => {
      const requests: Promise<Response>[] = [];
      if (data.targetIds.length > 0) {
        requests.push(
          fetch(
            `${API_BASE_URL}/projects/${projectSlug(data.targetProjectId)}/reorder`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ notebookIds: data.targetIds }),
            }
          )
        );
      }
      if (
        data.sourceProjectId !== data.targetProjectId &&
        data.sourceIds.length > 0
      ) {
        requests.push(
          fetch(
            `${API_BASE_URL}/projects/${projectSlug(data.sourceProjectId)}/reorder`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ notebookIds: data.sourceIds }),
            }
          )
        );
      }
      try {
        const responses = await Promise.all(requests);
        const failed = responses.find((res) => !res.ok);
        if (failed) {
          const payload = (await failed.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(payload?.error ?? "Failed to update ordering");
        }
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : "Failed to update ordering"
        );
        void refresh();
      }
    },
    [refresh]
  );

  const handleMoveNotebook = useCallback(
    (
      item: DragNotebookItem,
      targetProjectId: string | null,
      targetIndex: number
    ) => {
      if (!isAdmin) {
        return;
      }
      let result: {
        targetProjectId: string | null;
        targetIds: string[];
        sourceProjectId: string | null;
        sourceIds: string[];
      } | null = null;

      setBoard((prev) => {
        const projectsClone = prev.projects.map((entry) => ({
          project: entry.project,
          notebooks: entry.notebooks.map((notebook) => ({ ...notebook })),
        }));
        let unassignedClone = prev.unassigned.map((notebook) => ({
          ...notebook,
        }));

        const findList = (projectId: string | null) =>
          projectId
            ? projectsClone.find((group) => group.project.id === projectId)
                ?.notebooks
            : unassignedClone;

        const sourceList = findList(item.fromProjectId);
        const targetList = findList(targetProjectId);

        if (!sourceList || !targetList) {
          return prev;
        }

        const sourceIndex = sourceList.findIndex(
          (notebook) => notebook.id === item.notebookId
        );
        if (sourceIndex === -1) {
          return prev;
        }

        const [removed] = sourceList.splice(sourceIndex, 1);
        const insertionIndex = Math.max(
          0,
          Math.min(targetIndex, targetList.length)
        );
        targetList.splice(insertionIndex, 0, {
          ...removed,
          projectId: targetProjectId,
        });

        if (item.fromProjectId === null) {
          unassignedClone = resequence(sourceList, null);
        } else {
          const sourceProject = projectsClone.find(
            (group) => group.project.id === item.fromProjectId
          );
          if (sourceProject) {
            sourceProject.notebooks = resequence(
              sourceList,
              item.fromProjectId
            );
          }
        }

        if (targetProjectId === null) {
          unassignedClone = resequence(targetList, null);
        } else {
          const targetProject = projectsClone.find(
            (group) => group.project.id === targetProjectId
          );
          if (targetProject) {
            targetProject.notebooks = resequence(targetList, targetProjectId);
          }
        }

        const targetIds =
          targetProjectId === null
            ? unassignedClone.map((notebook) => notebook.id)
            : (projectsClone
                .find((group) => group.project.id === targetProjectId)
                ?.notebooks.map((notebook) => notebook.id) ?? []);

        const sourceIds =
          item.fromProjectId === null
            ? unassignedClone.map((notebook) => notebook.id)
            : (projectsClone
                .find((group) => group.project.id === item.fromProjectId)
                ?.notebooks.map((notebook) => notebook.id) ?? []);

        result = {
          targetProjectId,
          targetIds,
          sourceProjectId: item.fromProjectId,
          sourceIds,
        };

        return {
          projects: projectsClone,
          unassigned: unassignedClone,
        };
      });

      if (result) {
        void persistMove(result);
      }
    },
    [isAdmin, persistMove]
  );

  const handleOpenCreateProject = useCallback(() => {
    if (!isAdmin) {
      setActionError("Only workspace admins can create projects.");
      return;
    }
    setProjectNameError(null);
    setProjectNameValue("");
    setProjectNameDialog({ mode: "create", open: true });
  }, [isAdmin]);

  const handleRenameProject = useCallback(
    (projectId: string, currentName: string) => {
      if (!isAdmin) {
        setActionError("Only workspace admins can rename projects.");
        return;
      }
      setProjectNameError(null);
      setProjectNameValue(currentName);
      setProjectNameDialog({ mode: "rename", projectId, open: true });
    },
    [isAdmin]
  );

  const handleSubmitProjectName = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!projectNameDialog) {
        return;
      }
      const trimmed = projectNameValue.trim();
      if (!trimmed) {
        setProjectNameError("Please enter a project name.");
        return;
      }
      setProjectNameSubmitting(true);
      setProjectNameError(null);
      try {
        if (projectNameDialog.mode === "create") {
          const response = await fetch(`${API_BASE_URL}/projects`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: trimmed }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || !payload?.data?.id) {
            throw new Error(payload?.error ?? "Failed to create project");
          }
          setSelectedProjectId(payload.data.id as string);
        } else if (projectNameDialog.projectId) {
          const response = await fetch(
            `${API_BASE_URL}/projects/${projectNameDialog.projectId}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: trimmed }),
            }
          );
          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload?.error ?? "Failed to rename project");
          }
        }
        setProjectNameDialog(null);
        setProjectNameValue("");
        void refresh();
      } catch (error) {
        setProjectNameError(
          error instanceof Error ? error.message : "Unable to save project"
        );
      } finally {
        setProjectNameSubmitting(false);
      }
    },
    [projectNameDialog, projectNameValue, refresh]
  );

  const handleDeleteProject = useCallback(
    async (projectId: string) => {
      if (!isAdmin) {
        setActionError("Only workspace admins can delete projects.");
        return;
      }
      setProjectToDelete(projectId);
    },
    [isAdmin]
  );

  const confirmDeleteProject = useCallback(async () => {
    if (!projectToDelete) {
      return;
    }
    try {
      const response = await fetch(
        `${API_BASE_URL}/projects/${projectToDelete}`,
        {
          method: "DELETE",
        }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error ?? "Failed to delete project");
      }
      if (selectedProjectId === projectToDelete) {
        setSelectedProjectId(null);
      }
      if (sharingProjectId === projectToDelete) {
        setSharingProjectId(null);
      }
      setProjectToDelete(null);
      void refresh();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to delete project"
      );
    }
  }, [projectToDelete, refresh, selectedProjectId, sharingProjectId]);

  const handleShareProject = useCallback(
    (projectId: string) => {
      if (!isAdmin) {
        setActionError("Only workspace admins can share projects.");
        return;
      }
      setSharingProjectId(projectId);
    },
    [isAdmin]
  );

  const handleRenameNotebookSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!renameNotebookId) {
        return;
      }
      const trimmed = renameNotebookValue.trim();
      if (!trimmed) {
        setRenameNotebookError("Please enter a notebook name.");
        return;
      }
      setRenameNotebookSubmitting(true);
      setRenameNotebookError(null);
      try {
        const response = await fetch(
          `${API_BASE_URL}/notebooks/${renameNotebookId}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: trimmed }),
          }
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            typeof payload?.error === "string"
              ? payload.error
              : "Failed to rename notebook"
          );
        }
        setBoard((prev) => {
          const updateList = (list: NotebookWithAccess[]) =>
            list.map((item) =>
              item.id === renameNotebookId ? { ...item, name: trimmed } : item
            );
          return {
            projects: prev.projects.map((group) => ({
              project: group.project,
              notebooks: updateList(group.notebooks),
            })),
            unassigned: updateList(prev.unassigned),
          };
        });
        setRenameNotebookId(null);
        setRenameNotebookValue("");
      } catch (error) {
        setRenameNotebookError(
          error instanceof Error ? error.message : "Failed to rename notebook"
        );
      } finally {
        setRenameNotebookSubmitting(false);
      }
    },
    [renameNotebookId, renameNotebookValue]
  );

  const handleRenameNotebookDialogChange = useCallback((open: boolean) => {
    if (!open) {
      setRenameNotebookId(null);
      setRenameNotebookValue("");
      setRenameNotebookError(null);
      setRenameNotebookSubmitting(false);
    }
  }, []);

  return (
    <DndProvider backend={HTML5Backend}>
      <AppShell
        title="Notebooks"
        onNewNotebook={isAdmin ? handleCreateNotebook : undefined}
        secondarySidebar={
          <ProjectSidebar
            board={board}
            selectedProjectId={selectedProjectId}
            onSelectProject={setSelectedProjectId}
            onCreateProject={handleOpenCreateProject}
            onOpenNotebook={handleOpen}
            isAdmin={isAdmin}
          />
        }
        headerRight={
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".nbdm,.yaml,.yml"
              className="hidden"
              onChange={handleImportFile}
            />
            <Button
              variant="secondary"
              size="sm"
              className="gap-2"
              onClick={handleImportClick}
              disabled={importing || !isAdmin}
            >
              {importing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {importing ? "Importing…" : "Import"}
            </Button>
          </div>
        }
      >
        <h1 className="text-3xl font-semibold text-foreground">Notebooks</h1>
        <p className="mt-2 text-muted-foreground">
          Organize notebooks into projects and share them with your team.
        </p>
        {actionError ? (
          <p className="mt-4 text-sm text-rose-600">{actionError}</p>
        ) : null}
        {loading ? (
          <LoadingOverlay label="Loading notebooks…" />
        ) : totalNotebooks === 0 ? (
          isAdmin ? (
            <div className="mt-8 space-y-6">
              <NewNotebookCallout onCreate={handleCreateNotebook} />
            </div>
          ) : (
            <p className="mt-8 text-sm text-muted-foreground">
              You don’t have any notebooks yet. Ask an admin to share one with
              you.
            </p>
          )
        ) : (
          <div className="mt-8 space-y-10">
            <NotebookGroup
              title="Workspace"
              projectId={null}
              notebooks={board.unassigned}
              isAdmin={isAdmin}
              onOpenNotebook={handleOpen}
              onExportNotebook={handleExport}
              onDeleteNotebook={(id) => {
                setPendingDeleteId(id);
                setConfirmOpen(true);
              }}
              onMoveNotebook={handleMoveNotebook}
              onRenameNotebook={handleOpenRenameNotebook}
              exportingId={exportingId}
              onPublishNotebook={handlePublishNotebook}
              onUnpublishNotebook={handleUnpublishNotebook}
              onViewPublishedNotebook={handleViewPublishedNotebook}
              publishingId={publishingNotebookId}
              unpublishingId={unpublishingNotebookId}
              emptyLabel="Drag notebooks here to remove them from a project."
            />
            {board.projects.map((group) => (
              <NotebookGroup
                key={group.project.id}
                title={group.project.name}
                projectId={group.project.id}
                notebooks={group.notebooks}
                isAdmin={isAdmin}
                onOpenNotebook={handleOpen}
                onExportNotebook={handleExport}
                onDeleteNotebook={(id) => {
                  setPendingDeleteId(id);
                  setConfirmOpen(true);
                }}
                onMoveNotebook={handleMoveNotebook}
                onRenameNotebook={handleOpenRenameNotebook}
                exportingId={exportingId}
                onPublishNotebook={handlePublishNotebook}
                onUnpublishNotebook={handleUnpublishNotebook}
                onViewPublishedNotebook={handleViewPublishedNotebook}
                publishingId={publishingNotebookId}
                unpublishingId={unpublishingNotebookId}
                headerActions={
                  isAdmin ? (
                    <div className="flex items-center gap-1">
                      <Badge
                        variant={
                          group.project.published ? "secondary" : "outline"
                        }
                        className="px-2 text-[10px]"
                      >
                        {group.project.published ? "Published" : "Private"}
                      </Badge>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          group.project.published
                            ? handleUnpublishProject(group)
                            : handlePublishProject(group)
                        }
                        title={
                          group.project.published
                            ? "Unpublish project"
                            : "Publish project"
                        }
                        disabled={
                          (group.project.published &&
                            unpublishingProjectId === group.project.id) ||
                          (!group.project.published &&
                            publishingProjectId === group.project.id)
                        }
                      >
                        {group.project.published ? (
                          unpublishingProjectId === group.project.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <EyeOff className="h-4 w-4" />
                          )
                        ) : publishingProjectId === group.project.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Megaphone className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1"
                        onClick={() => handleShareProject(group.project.id)}
                      >
                        <Users className="h-4 w-4" /> Share
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          handleRenameProject(
                            group.project.id,
                            group.project.name
                          )
                        }
                        title="Rename project"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-rose-600 hover:text-rose-700"
                        onClick={() => handleDeleteProject(group.project.id)}
                        title="Delete project"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : undefined
                }
              />
            ))}
          </div>
        )}
        <ConfirmDialog
          open={confirmOpen}
          title="Delete notebook?"
          description="This action cannot be undone. The notebook will be permanently removed."
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirmOpen(false)}
          onConfirm={async () => {
            if (pendingDeleteId) await handleDeleteNotebook(pendingDeleteId);
            setConfirmOpen(false);
            setPendingDeleteId(null);
          }}
        />
        <PublishDialog
          open={publishNotebookTarget !== null}
          kind="notebook"
          defaultSlug={publishNotebookTarget?.publicSlug ?? null}
          suggestedSlug={
            publishNotebookTarget
              ? (suggestSlug(
                  publishNotebookTarget.name,
                  publishNotebookTarget.id
                ) ?? undefined)
              : undefined
          }
          submitting={notebookPublishSubmitting}
          error={notebookPublishError}
          onOpenChange={(open) => {
            if (!open) {
              setPublishNotebookTarget(null);
              setNotebookPublishError(null);
            }
          }}
          onSubmit={async (slug) => {
            await handleNotebookPublishSubmit(slug);
          }}
        />
        <ConfirmDialog
          open={unpublishNotebookTarget !== null}
          title="Unpublish notebook?"
          description="The notebook will no longer be publicly accessible."
          confirmLabel="Unpublish"
          onCancel={() => setUnpublishNotebookTarget(null)}
          onConfirm={async () => {
            if (notebookUnpublishSubmitting) {
              return;
            }
            await confirmUnpublishNotebook();
          }}
        />
        <PublishDialog
          open={publishProjectTarget !== null}
          kind="project"
          defaultSlug={publishProjectTarget?.project.slug ?? null}
          suggestedSlug={
            publishProjectTarget
              ? (suggestSlug(
                  publishProjectTarget.project.name,
                  publishProjectTarget.project.id
                ) ?? undefined)
              : undefined
          }
          submitting={projectPublishSubmitting}
          error={projectPublishError}
          onOpenChange={(open) => {
            if (!open) {
              setPublishProjectTarget(null);
              setProjectPublishError(null);
            }
          }}
          onSubmit={async (slug) => {
            await handleProjectPublishSubmit(slug);
          }}
        />
        <ConfirmDialog
          open={unpublishProjectTarget !== null}
          title="Unpublish project?"
          description="All notebooks in this project will become private."
          confirmLabel="Unpublish project"
          onCancel={() => setUnpublishProjectTarget(null)}
          onConfirm={async () => {
            if (projectUnpublishSubmitting) {
              return;
            }
            await confirmUnpublishProject();
          }}
        />
        <ConfirmDialog
          open={Boolean(projectToDelete)}
          title="Delete project?"
          description="All notebooks will remain available but move back to the unassigned list."
          confirmLabel="Delete project"
          danger
          onCancel={() => setProjectToDelete(null)}
          onConfirm={confirmDeleteProject}
        />
        <ProjectNameDialog
          state={projectNameDialog}
          value={projectNameValue}
          error={projectNameError}
          submitting={projectNameSubmitting}
          onValueChange={setProjectNameValue}
          onSubmit={handleSubmitProjectName}
          onOpenChange={(open) => {
            if (!open) {
              setProjectNameDialog(null);
              setProjectNameError(null);
              setProjectNameValue("");
            }
          }}
        />
        <NotebookRenameDialog
          open={renameNotebookId !== null}
          value={renameNotebookValue}
          error={renameNotebookError}
          submitting={renameNotebookSubmitting}
          onValueChange={setRenameNotebookValue}
          onSubmit={handleRenameNotebookSubmit}
          onOpenChange={handleRenameNotebookDialogChange}
        />
        <ProjectSharingDialog
          open={Boolean(sharingProjectId) && projectSharing.sharingOpen}
          isAdmin={isAdmin}
          themeMode={theme}
          invitationEmail={projectSharing.invitationEmail}
          invitationRole={projectSharing.invitationRole}
          invitationError={projectSharing.invitationError}
          shareFetchError={projectSharing.shareFetchError}
          shareSubmitting={projectSharing.shareSubmitting}
          invitesLoading={projectSharing.invitesLoading}
          sortedInvitations={projectSharing.sortedInvitations}
          sortedCollaborators={projectSharing.sortedCollaborators}
          currentUserId={currentUser?.id}
          newInviteLink={projectSharing.newInviteLink}
          copySuccess={projectSharing.copySuccess}
          revokingInvitationId={projectSharing.revokingInvitationId}
          updatingCollaboratorId={projectSharing.updatingCollaboratorId}
          removingCollaboratorId={projectSharing.removingCollaboratorId}
          onOpenChange={(open) => {
            if (!open) {
              setSharingProjectId(null);
              projectSharing.handleSharingOpenChange(false);
            }
          }}
          onInvitationEmailChange={projectSharing.setInvitationEmail}
          onInvitationRoleChange={projectSharing.setInvitationRole}
          onInviteSubmit={projectSharing.handleInviteSubmit}
          onCopyInviteLink={projectSharing.handleCopyInviteLink}
          onRevokeInvitation={projectSharing.handleRevokeInvitation}
          onUpdateCollaboratorRole={projectSharing.handleUpdateCollaboratorRole}
          onRemoveCollaborator={projectSharing.handleRemoveCollaborator}
        />
      </AppShell>
    </DndProvider>
  );
}
