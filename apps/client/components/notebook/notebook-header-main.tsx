import type { KeyboardEvent, RefObject } from "react";

import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

export interface NotebookHeaderMainProps {
  notebookName: string;
  isRenaming: boolean;
  renameDraft: string;
  renameInputRef: RefObject<HTMLInputElement>;
  onRenameDraftChange(value: string): void;
  onRenameCommit(): void;
  onRenameKeyDown(event: KeyboardEvent<HTMLInputElement>): void;
  onRenameStart(): void;
}

const NotebookHeaderMain = ({
  notebookName,
  isRenaming,
  renameDraft,
  renameInputRef,
  onRenameDraftChange,
  onRenameCommit,
  onRenameKeyDown,
  onRenameStart,
}: NotebookHeaderMainProps) => {
  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:flex-nowrap">
      {isRenaming ? (
        <input
          ref={renameInputRef}
          value={renameDraft}
          onChange={(event) => onRenameDraftChange(event.target.value)}
          onBlur={onRenameCommit}
          onKeyDown={onRenameKeyDown}
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm font-semibold text-foreground focus:outline-none sm:w-auto sm:min-w-[220px] sm:max-w-sm"
          aria-label="Notebook name"
        />
      ) : (
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-base font-semibold text-foreground"
          onClick={onRenameStart}
          title={notebookName}
        >
          {notebookName}
        </button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0"
        onClick={isRenaming ? onRenameCommit : onRenameStart}
        aria-label="Rename notebook"
      >
        <Pencil className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default NotebookHeaderMain;
