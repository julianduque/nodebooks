"use client";

import clsx from "clsx";
import { Button } from "../ui/button";
import { Plus } from "lucide-react";
import type { NotebookCell } from "@nodebooks/notebook-schema";

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
        className
      )}
    >
      <span className="font-medium">Add cell</span>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => onAdd("markdown")}
      >
        <Plus className="h-4 w-4" />
        Markdown
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => onAdd("code")}
      >
        <Plus className="h-4 w-4" />
        Code
      </Button>
    </div>
  );
};

export default AddCellMenu;
