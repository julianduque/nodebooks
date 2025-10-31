"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Notebook } from "@nodebooks/notebook-schema";

import { cn } from "@nodebooks/client-ui/lib/utils";
import { Badge, badgeVariants } from "@nodebooks/client-ui/components/ui";
import { Button } from "@nodebooks/client-ui/components/ui";
import StatusDot from "@/components/notebook/status-dot";
import {
  Check,
  ChevronDown,
  Download,
  Eraser,
  EyeOff,
  ExternalLink,
  Globe2,
  Loader2,
  Megaphone,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Save,
  Share2,
  ShieldCheck,
  Trash2,
} from "lucide-react";

export interface NotebookHeaderRightProps {
  env: Notebook["env"];
  socketReady: boolean;
  hasSession: boolean;
  dirty: boolean;
  canEdit: boolean;
  canShare: boolean;
  canDelete: boolean;
  canPublish: boolean;
  currentUserLoading: boolean;
  exporting: boolean;
  published: boolean;
  publicSlug?: string | null;
  publishHref?: string | null;
  publishPending?: boolean;
  unpublishPending?: boolean;
  onSave(): void;
  onRunAll(): void;
  onClearOutputs(): void;
  onReconnect(): void;
  onRestart(): void;
  onOpenSharing(): void;
  onExport(): void;
  onDelete(): void;
  onPublish(): void;
  onUnpublish(): void;
}

const NotebookHeaderRight = ({
  env,
  socketReady,
  hasSession,
  dirty,
  canEdit,
  canShare,
  canDelete,
  canPublish,
  currentUserLoading,
  exporting,
  published,
  publishHref,
  publishPending,
  unpublishPending,
  onSave,
  onRunAll,
  onClearOutputs,
  onReconnect,
  onRestart,
  onOpenSharing,
  onExport,
  onDelete,
  onPublish,
  onUnpublish,
}: NotebookHeaderRightProps) => {
  const runtimeName = env.runtime === "node" ? "Node.js" : env.runtime;
  const versionLabel = env.version
    ? env.version.startsWith("v")
      ? env.version
      : `v${env.version}`
    : "unknown";

  const kernelStatusLabel = socketReady
    ? "Kernel connected"
    : hasSession
      ? "Kernel disconnected"
      : "Kernel offline";
  const kernelStatusText = kernelStatusLabel;
  const kernelStatusColor = socketReady
    ? "bg-primary"
    : "bg-[color:var(--chart-5)]";

  const saveStatusLabel = dirty
    ? "You have unsaved changes"
    : "All changes saved";
  const saveStatusText = dirty ? "Unsaved" : "Saved";
  const saveStatusColor = dirty ? "bg-[color:var(--chart-5)]" : "bg-primary";

  const [publishMenuOpen, setPublishMenuOpen] = useState(false);
  const publishMenuAnchorRef = useRef<HTMLDivElement | null>(null);
  const publishMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const publishMenuRef = useRef<HTMLDivElement | null>(null);
  const [publishMenuPosition, setPublishMenuPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const publishMenuEnabled = canPublish || (published && Boolean(publishHref));
  const publishBusy = publishPending || unpublishPending;

  useEffect(() => {
    if (!publishMenuOpen) {
      return;
    }
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        publishMenuAnchorRef.current?.contains(target) ||
        publishMenuRef.current?.contains(target)
      ) {
        return;
      }
      setPublishMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPublishMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [publishMenuOpen]);

  useEffect(() => {
    if (!publishMenuOpen) {
      setPublishMenuPosition(null);
      publishMenuRef.current = null;
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    const updatePosition = () => {
      const trigger = publishMenuTriggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const width = 220;
      const top = rect.bottom + window.scrollY + 6;
      const minLeft = window.scrollX + 8;
      const preferredLeft = rect.right + window.scrollX - width;
      const maxLeft = window.scrollX + window.innerWidth - width - 8;
      const left = Math.max(Math.min(preferredLeft, maxLeft), minLeft);
      setPublishMenuPosition({ top, left, width });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [publishMenuOpen]);

  useEffect(() => {
    if (!publishMenuEnabled && publishMenuOpen) {
      setPublishMenuOpen(false);
    }
  }, [publishMenuEnabled, publishMenuOpen]);

  const handlePublishView = () => {
    if (!publishHref) return;
    if (typeof window === "undefined") return;
    window.open(publishHref, "_blank", "noopener,noreferrer");
  };

  const handlePublishAction = (action: () => void) => {
    setPublishMenuOpen(false);
    action();
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      <div className="flex w-full flex-wrap items-center justify-end gap-1.5 rounded-lg bg-muted/40 px-2 py-1 shadow-sm sm:w-auto sm:flex-nowrap sm:gap-2">
        <div className="relative" ref={publishMenuAnchorRef}>
          <button
            type="button"
            ref={publishMenuTriggerRef}
            onClick={() => {
              if (!publishMenuEnabled) return;
              setPublishMenuOpen((open) => !open);
            }}
            disabled={!publishMenuEnabled}
            aria-haspopup={publishMenuEnabled ? "menu" : undefined}
            aria-expanded={publishMenuEnabled ? publishMenuOpen : undefined}
            title={
              published ? "Published notebook actions" : "Publishing options"
            }
            className={cn(
              badgeVariants({ variant: published ? "default" : "outline" }),
              "flex items-center gap-1 text-[11px] focus:ring-offset-background",
              published
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground",
              publishMenuEnabled
                ? "cursor-pointer"
                : "cursor-default opacity-70"
            )}
          >
            {publishBusy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : published ? (
              <Globe2 className="h-3 w-3" />
            ) : (
              <ShieldCheck className="h-3 w-3" />
            )}
            <span>{published ? "Published" : "Private"}</span>
            {publishMenuEnabled ? <ChevronDown className="h-3 w-3" /> : null}
          </button>
          {publishMenuOpen &&
          publishMenuPosition &&
          typeof document !== "undefined"
            ? createPortal(
                <div
                  ref={(node) => {
                    publishMenuRef.current = node;
                  }}
                  className="z-[1000] rounded-md border border-border bg-popover p-1 text-sm shadow-lg"
                  style={{
                    position: "absolute",
                    top: publishMenuPosition.top,
                    left: publishMenuPosition.left,
                    width: publishMenuPosition.width,
                  }}
                >
                  {published && publishHref ? (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-foreground hover:bg-muted"
                      onClick={() => handlePublishAction(handlePublishView)}
                    >
                      <ExternalLink className="h-4 w-4" />
                      View
                    </button>
                  ) : null}
                  {canPublish ? (
                    published ? (
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-muted",
                          publishBusy || !canEdit
                            ? "cursor-not-allowed text-muted-foreground"
                            : "text-foreground"
                        )}
                        disabled={publishBusy || !canEdit}
                        onClick={() => {
                          if (publishBusy || !canEdit) {
                            return;
                          }
                          handlePublishAction(onUnpublish);
                        }}
                      >
                        {publishBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <EyeOff className="h-4 w-4" />
                        )}
                        Unpublish
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-muted",
                          publishBusy || !canEdit
                            ? "cursor-not-allowed text-muted-foreground"
                            : "text-foreground"
                        )}
                        disabled={publishBusy || !canEdit}
                        onClick={() => {
                          if (publishBusy || !canEdit) {
                            return;
                          }
                          handlePublishAction(onPublish);
                        }}
                      >
                        {publishBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Megaphone className="h-4 w-4" />
                        )}
                        Publish notebook
                      </button>
                    )
                  ) : null}
                </div>,
                document.body
              )
            : null}
        </div>
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
        <div className="flex flex-1 flex-wrap items-center justify-end gap-1.5 sm:flex-none sm:gap-2">
          <Button
            variant={dirty ? "secondary" : "ghost"}
            size="icon"
            onClick={onSave}
            disabled={!dirty || !canEdit}
            aria-label="Save notebook"
            title={dirty ? "Save notebook" : "Saved"}
          >
            {dirty ? (
              <Save className="h-4 w-4" />
            ) : (
              <Check className="h-4 w-4 text-primary" />
            )}
          </Button>
          <Button
            variant="default"
            size="icon"
            onClick={onRunAll}
            disabled={!socketReady || !canEdit}
            aria-label="Run all cells"
            title="Run all cells"
          >
            <PlayCircle className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClearOutputs}
            aria-label="Clear all outputs"
            title="Clear all outputs"
            disabled={!canEdit}
          >
            <Eraser className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onReconnect}
            aria-label="Reconnect kernel"
            title="Reconnect kernel"
            disabled={!hasSession || !canEdit}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRestart}
            aria-label="Restart kernel"
            title="Restart kernel"
            disabled={!canEdit}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenSharing}
            aria-label={
              canShare
                ? "Invite collaborators"
                : "Only admins can invite collaborators"
            }
            title={
              canShare
                ? "Invite collaborators"
                : "Only admins can invite collaborators"
            }
            disabled={!canShare || currentUserLoading}
          >
            {canShare ? (
              <Share2 className="h-4 w-4" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onExport}
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
          {canDelete ? (
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive/90"
              onClick={onDelete}
              aria-label="Delete notebook"
              title="Delete notebook"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default NotebookHeaderRight;
