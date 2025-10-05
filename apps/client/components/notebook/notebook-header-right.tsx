import type { Notebook } from "@nodebooks/notebook-schema";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import StatusDot from "@/components/notebook/status-dot";
import {
  Check,
  Download,
  Eraser,
  Loader2,
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
  currentUserLoading: boolean;
  exporting: boolean;
  onSave(): void;
  onRunAll(): void;
  onClearOutputs(): void;
  onReconnect(): void;
  onRestart(): void;
  onOpenSharing(): void;
  onExport(): void;
  onDelete(): void;
}

const NotebookHeaderRight = ({
  env,
  socketReady,
  hasSession,
  dirty,
  canEdit,
  canShare,
  canDelete,
  currentUserLoading,
  exporting,
  onSave,
  onRunAll,
  onClearOutputs,
  onReconnect,
  onRestart,
  onOpenSharing,
  onExport,
  onDelete,
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
          onClick={onSave}
          disabled={!dirty || !canEdit}
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
            className="text-rose-600 hover:text-rose-700"
            onClick={onDelete}
            aria-label="Delete notebook"
            title="Delete notebook"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
};

export default NotebookHeaderRight;
