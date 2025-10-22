"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { Database, Globe, Plus, Terminal, Zap } from "lucide-react";
import type { NotebookCell } from "@nodebooks/notebook-schema";

const SPECIAL_CELL_LABEL = "Special";
const DROPDOWN_WIDTH = 176;

const AddCellMenu = ({
  onAdd,
  className,
  disabled = false,
  terminalCellsEnabled = false,
}: {
  onAdd: (type: NotebookCell["type"]) => void | Promise<void>;
  className?: string;
  disabled?: boolean;
  terminalCellsEnabled?: boolean;
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
    if ((disabled || !terminalCellsEnabled) && menuOpen) {
      setMenuOpen(false);
    }
  }, [disabled, menuOpen, terminalCellsEnabled]);

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
    setMenuOpen(false);
    void onAdd(type);
  };

  return (
    <div
      ref={containerRef}
      className={clsx(
        "relative mt-1 mb-2 flex items-center gap-1 px-1 py-1 text-sm text-slate-600",
        className
      )}
    >
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => handleAdd("markdown")}
        disabled={disabled}
      >
        <Plus className="h-4 w-4" />
        Markdown
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => handleAdd("code")}
        disabled={disabled}
      >
        <Plus className="h-4 w-4" />
        Code
      </Button>
      {terminalCellsEnabled ? (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              if (disabled) return;
              setMenuOpen((open) => !open);
            }}
            ref={triggerRef}
            disabled={disabled}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <Zap className="h-4 w-4" />
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
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-slate-200 hover:bg-slate-800"
                    onClick={() => handleAdd("http")}
                  >
                    <Globe className="h-4 w-4" />
                    HTTP Request
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-slate-200 hover:bg-slate-800"
                    onClick={() => handleAdd("sql")}
                  >
                    <Database className="h-4 w-4" />
                    SQL Query
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-slate-200 hover:bg-slate-800"
                    onClick={() => handleAdd("terminal")}
                  >
                    <Terminal className="h-4 w-4" />
                    Terminal
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-slate-200 hover:bg-slate-800"
                    onClick={() => handleAdd("command")}
                  >
                    <Zap className="h-4 w-4" />
                    Command
                  </button>
                </div>,
                document.body
              )
            : null}
        </>
      ) : (
        <>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => handleAdd("http")}
            disabled={disabled}
          >
            <Plus className="h-4 w-4" />
            HTTP Request
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => handleAdd("sql")}
            disabled={disabled}
          >
            <Database className="h-4 w-4" />
            SQL Query
          </Button>
        </>
      )}
    </div>
  );
};

export default AddCellMenu;
