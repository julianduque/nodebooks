"use client";

import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { Plus, Terminal } from "lucide-react";
import type { NotebookCell } from "@nodebooks/notebook-schema";

const AddCellMenu = ({
  onAdd,
  className,
}: {
  onAdd: (type: NotebookCell["type"]) => void | Promise<void>;
  className?: string;
}) => {
  const handleAdd = (type: NotebookCell["type"]) => {
    void onAdd(type);
  };

  return (
    <div
      className={clsx(
        "mt-1 mb-2 flex items-center gap-1 px-1 py-1 text-sm text-slate-600",
        className
      )}
    >
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => handleAdd("markdown")}
      >
        <Plus className="h-4 w-4" />
        Markdown
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => handleAdd("code")}
      >
        <Plus className="h-4 w-4" />
        Code
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => handleAdd("shell")}
      >
        <Terminal className="h-4 w-4" />
        Shell
      </Button>
    </div>
  );
};

export default AddCellMenu;
