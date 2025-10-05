import type {
  Notebook,
  NotebookCell,
  NotebookOutput,
} from "@nodebooks/notebook-schema";

import AddCellMenu from "@/components/notebook/add-cell-menu";
import CellCard from "@/components/notebook/cell-card";
import OutputView from "@/components/notebook/output-view";
import type { AttachmentMetadata } from "@/components/notebook/attachment-utils";
import { cellUri } from "@/components/notebook/monaco-models";
import { AlertCallout } from "@nodebooks/notebook-ui";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eraser, Loader2, XCircle } from "lucide-react";
import type { ThemeMode } from "@/components/theme-context";

type NotebookCellUpdater = (cell: NotebookCell) => NotebookCell;

type NotebookCellUpdateOptions = {
  persist?: boolean;
  touch?: boolean;
};

export interface NotebookEditorViewProps {
  loading: boolean;
  notebook: Notebook | null;
  error: string | null;
  actionError: string | null;
  socketReady: boolean;
  runningCellId: string | null;
  runQueue: string[];
  activeCellId: string | null;
  themeMode: ThemeMode;
  aiEnabled: boolean;
  readOnly: boolean;
  readOnlyMessage?: string;
  pendingShellIds: Set<string>;
  depBusy: boolean;
  depError: string | null;
  depOutputs: NotebookOutput[];
  onCellChange(
    id: string,
    updater: NotebookCellUpdater,
    options?: NotebookCellUpdateOptions
  ): void;
  onDeleteCell(id: string): void;
  onRunCell(id: string): void;
  onMoveCell(id: string, direction: "up" | "down"): void;
  onAddCell(type: NotebookCell["type"], index?: number): void;
  onActivateCell(id: string): void;
  onInterruptKernel(): void;
  onAttachmentUploaded(attachment: AttachmentMetadata): void;
  onClearDepOutputs(): void;
  onAbortInstall(): void;
}

const NotebookEditorView = ({
  loading,
  notebook,
  error,
  actionError,
  socketReady,
  runningCellId,
  runQueue,
  activeCellId,
  themeMode,
  aiEnabled,
  readOnly,
  readOnlyMessage,
  pendingShellIds,
  depBusy,
  depError,
  depOutputs,
  onCellChange,
  onDeleteCell,
  onRunCell,
  onMoveCell,
  onAddCell,
  onActivateCell,
  onInterruptKernel,
  onAttachmentUploaded,
  onClearDepOutputs,
  onAbortInstall,
}: NotebookEditorViewProps) => {
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
                themeMode={themeMode}
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
            {readOnly ? (
              <AlertCallout
                level="info"
                text={
                  readOnlyMessage ??
                  "This notebook is read-only. An editor can add content."
                }
                themeMode={themeMode}
              />
            ) : (
              <>
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
                  onAdd={(type) => onAddCell(type)}
                  className="mt-0 flex justify-center gap-2 text-[13px]"
                  disabled={readOnly}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {readOnly ? (
        <div className="px-2 pt-2">
          <AlertCallout
            level="info"
            text={readOnlyMessage ?? "This notebook is currently read-only."}
            themeMode={themeMode}
          />
        </div>
      ) : null}
      <div className="flex flex-1 overflow-visible">
        <div className="flex-1 px-2 py-2">
          {error ? (
            <AlertCallout
              level="error"
              text={error}
              className="mb-6"
              themeMode={themeMode}
            />
          ) : null}
          {actionError ? (
            <AlertCallout
              level="error"
              text={actionError}
              className="mb-6"
              themeMode={themeMode}
            />
          ) : null}
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
                    onClick={readOnly ? undefined : onClearDepOutputs}
                    disabled={
                      readOnly ||
                      (!depBusy && depOutputs.length === 0 && !depError)
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
                      onClick={readOnly ? undefined : onAbortInstall}
                      aria-label="Abort install"
                      disabled={readOnly}
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
          <div className="space-y-2">
            {notebook.cells.map((cell, index) => (
              <CellCard
                key={cell.id}
                cell={cell}
                notebookId={notebook.id}
                onAttachmentUploaded={onAttachmentUploaded}
                isRunning={runningCellId === cell.id}
                queued={runQueue.includes(cell.id)}
                canRun={socketReady && !readOnly}
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
                onActivate={() => onActivateCell(cell.id)}
                onChange={(updater, options) => {
                  if (readOnly) return;
                  onCellChange(cell.id, updater, options);
                }}
                onDelete={() => {
                  if (readOnly) return;
                  onDeleteCell(cell.id);
                }}
                onRun={() => {
                  if (readOnly) return;
                  onRunCell(cell.id);
                }}
                onInterrupt={() => {
                  if (readOnly) return;
                  onInterruptKernel();
                }}
                onMove={(direction) => {
                  if (readOnly) return;
                  onMoveCell(cell.id, direction);
                }}
                onAddBelow={(type) => {
                  if (readOnly) return;
                  onAddCell(type, index + 1);
                }}
                aiEnabled={aiEnabled}
                dependencies={notebook.env.packages}
                pendingShellPersist={pendingShellIds.has(cell.id)}
                readOnly={readOnly}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotebookEditorView;
