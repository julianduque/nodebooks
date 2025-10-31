"use client";

import clsx from "clsx";
import { Button } from "@nodebooks/client-ui/components/ui";
import type { OutlineItem } from "@/components/notebook/types";

interface OutlinePanelProps {
  items: OutlineItem[];
  onSelect: (cellId: string) => void;
  activeCellId?: string;
}

const OutlinePanel = ({ items, onSelect, activeCellId }: OutlinePanelProps) => {
  return (
    <div className="flex h-full flex-col gap-4">
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Add headings to your Markdown cells to build an outline.
        </p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.id}>
              <Button
                variant="ghost"
                size="sm"
                className={clsx(
                  "w-full justify-start text-sm h-auto min-h-8 whitespace-normal break-words text-left leading-snug",
                  activeCellId === item.cellId
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                style={{ paddingLeft: 12 + (item.level - 1) * 12 }}
                onClick={() => onSelect(item.cellId)}
              >
                <span className="block w-full whitespace-normal break-words text-left">
                  {item.title}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default OutlinePanel;
