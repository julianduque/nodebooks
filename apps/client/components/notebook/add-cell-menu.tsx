"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { Database, Globe, LineChart, Plus, Sparkles, Terminal, Zap } from "lucide-react";
import type { NotebookCell } from "@nodebooks/notebook-schema";

const SPECIAL_CELL_LABEL = "Special";
const DROPDOWN_WIDTH = 176;

const AddCellMenu = ({
  onAdd,
  className,
  disabled = false,
  terminalCellsEnabled = false,
  aiEnabled = false,
}: {
  onAdd: (type: NotebookCell["type"]) => void | Promise<void>;
  className?: string;
  disabled?: boolean;
  terminalCellsEnabled?: boolean;
  aiEnabled?: boolean;
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current && !containerRef.current.contains(target)) {
        if (menuRef.current && menuRef.current.contains(target)) {
          return;
        }
        setMenuOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (disabled && menuOpen) {
      setMenuOpen(false);
    }
  }, [disabled, menuOpen]);

  useEffect(() => {
    if (!menuOpen) {
      setMenuPosition(null);
      menuRef.current = null;
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    const updatePosition = () => {
      const button = triggerRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const width = DROPDOWN_WIDTH;
      const top = rect.bottom + window.scrollY + 4;
      const maxLeft = window.scrollX + window.innerWidth - width - 8;
      const preferredLeft = rect.right + window.scrollX - width;
      const left = Math.max(Math.min(preferredLeft, maxLeft), 8);
      setMenuPosition({ top, left, width });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [menuOpen]);

  const handleAdd = (type: NotebookCell["type"]) => {
    if (
      disabled ||
      (!terminalCellsEnabled && (type === "terminal" || type === "command"))
    ) {
      return;
    }
    if (!aiEnabled && type === "ai") {
      return;
    }
    setMenuOpen(false);
    void onAdd(type);
  };

  const specialItems = useMemo(() => {
    const items: Array<{
      type: NotebookCell["type"];
      label: string;
      icon:
        | typeof LineChart
        | typeof Globe
        | typeof Database
        | typeof Terminal
        | typeof Zap;
    }> = [];
    if (terminalCellsEnabled) {
      items.push(
        { type: "http", label: "HTTP Request", icon: Globe },
        { type: "sql", label: "SQL Query", icon: Database },
        { type: "plot", label: "Plot", icon: LineChart },
        { type: "terminal", label: "Terminal", icon: Terminal },
        { type: "command", label: "Command", icon: Zap }
      );
    } else {
      items.push({
        type: "plot",
        label: "Plot",
        icon: LineChart,
      });
    }
    return items;
  }, [terminalCellsEnabled]);

  return (
    <div
      ref={containerRef}
      className={clsx(
        "relative mt-1 mb-2 flex items-center gap-1 px-1 py-1 text-sm text-slate-600",
        className
      )}
    >
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 rounded-lg border border-border/50 bg-background/50 px-2.5 text-xs font-medium text-muted-foreground shadow-sm transition-all hover:border-border hover:bg-background hover:text-foreground hover:shadow"
        onClick={() => handleAdd("markdown")}
        disabled={disabled}
      >
        <Plus className="h-3 w-3" />
        Markdown
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 rounded-lg border border-border/50 bg-background/50 px-2.5 text-xs font-medium text-muted-foreground shadow-sm transition-all hover:border-border hover:bg-background hover:text-foreground hover:shadow"
        onClick={() => handleAdd("code")}
        disabled={disabled}
      >
        <Plus className="h-3 w-3" />
        Code
      </Button>
      {aiEnabled ? (
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => handleAdd("ai")}
          disabled={disabled}
        >
          <Sparkles className="h-4 w-4" />
          AI Cell
        </Button>
      ) : null}
      {terminalCellsEnabled ? (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 rounded-lg border border-border/50 bg-background/50 px-2.5 text-xs font-medium text-muted-foreground shadow-sm transition-all hover:border-border hover:bg-background hover:text-foreground hover:shadow"
            onClick={() => handleAdd("http")}
            disabled={disabled}
          >
            <Plus className="h-3 w-3" />
            HTTP Request
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 rounded-lg border border-border/50 bg-background/50 px-2.5 text-xs font-medium text-muted-foreground shadow-sm transition-all hover:border-border hover:bg-background hover:text-foreground hover:shadow"
            onClick={() => handleAdd("sql")}
            disabled={disabled}
          >
            <Database className="h-3 w-3" />
            SQL Query
          </Button>
        </>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 rounded-lg border border-border/50 bg-background/50 px-2.5 text-xs font-medium text-muted-foreground shadow-sm transition-all hover:border-border hover:bg-background hover:text-foreground hover:shadow"
        onClick={() => {
          if (disabled) return;
          setMenuOpen((open) => !open);
        }}
        ref={triggerRef}
        disabled={disabled}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
      >
        <Zap className="h-3 w-3" />
        {SPECIAL_CELL_LABEL}
      </Button>
      {menuOpen && menuPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              className="z-[1000] rounded-md border border-slate-700 bg-slate-900/95 p-1 text-sm shadow-lg"
              ref={(node) => {
                menuRef.current = node;
              }}
              style={{
                position: "absolute",
                top: menuPosition.top,
                left: menuPosition.left,
                width: menuPosition.width,
              }}
            >
              {specialItems.map(({ type, label, icon: Icon }) => (
                <button
                  key={type}
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-slate-200 hover:bg-slate-800"
                  onClick={() => handleAdd(type)}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  );
};

export default AddCellMenu;
