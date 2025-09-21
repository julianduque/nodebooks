"use client";

import clsx from "clsx";
import { Button } from "../ui/button";
import type { OutlineItem } from "./types";

interface OutlinePanelProps {
  items: OutlineItem[];
  onSelect: (cellId: string) => void;
  activeCellId?: string;
}

const OutlinePanel = ({ items, onSelect, activeCellId }: OutlinePanelProps) => {
  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
          Outline
        </p>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-slate-500">
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
                  "w-full justify-start text-sm",
                  activeCellId === item.cellId
                    ? "bg-slate-100 text-slate-900"
                    : "text-slate-500 hover:text-slate-900"
                )}
                style={{ paddingLeft: 12 + (item.level - 1) * 12 }}
                onClick={() => onSelect(item.cellId)}
              >
                {item.title}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default OutlinePanel;
