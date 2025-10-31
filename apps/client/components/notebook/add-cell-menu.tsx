"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { Button } from "@nodebooks/client-ui/components/ui";
import { Plus as PlusIcon, Zap } from "lucide-react";
import type { NotebookCell } from "@/types/notebook";
import { pluginRegistry } from "@/lib/plugins";
import type { LucideIcon } from "lucide-react";

const SPECIAL_CELL_LABEL = "Special";
const DROPDOWN_WIDTH = 176;

const AddCellMenu = ({
  onAdd,
  className,
  disabled = false,
}: {
  onAdd: (type: NotebookCell["type"]) => void | Promise<void>;
  className?: string;
  disabled?: boolean;
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    width: number;
    renderAbove: boolean;
  } | null>(null);
  const [enabledCellTypes, setEnabledCellTypes] = useState<Set<string>>(
    new Set()
  );

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

  // Update enabled cell types - use sync method for immediate updates
  // Also listen for sync events (we'll poll or use an event system)
  useEffect(() => {
    const updateEnabled = () => {
      const enabled = pluginRegistry.getEnabledCellTypesSync();
      setEnabledCellTypes(new Set(enabled.map((def) => def.type)));
    };

    // Initial update
    updateEnabled();

    // Poll for updates (in case backend state changes)
    // TODO: Replace with proper event system or WebSocket updates
    const interval = setInterval(updateEnabled, 2000);

    return () => clearInterval(interval);
  }, []);

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

      // Estimate menu height (approximate based on number of items)
      const estimatedMenuHeight = 200; // Approximate height for special menu

      // Check if there's enough space below
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const renderAbove =
        spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow;

      // Calculate top position
      const top = renderAbove
        ? rect.top - estimatedMenuHeight - 4
        : rect.bottom + 4;

      const maxLeft = window.innerWidth - width - 8;
      const preferredLeft = rect.right - width;
      const left = Math.max(Math.min(preferredLeft, maxLeft), 8);
      setMenuPosition({ top, left, width, renderAbove });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("resize", updatePosition);
    };
  }, [menuOpen]);

  const handleAdd = (type: NotebookCell["type"]) => {
    if (disabled) {
      return;
    }
    // Core cell types (markdown and code) are always allowed
    // They don't need to be registered as plugins
    const coreCellTypes = new Set(["markdown", "code"]);
    if (coreCellTypes.has(type)) {
      setMenuOpen(false);
      void onAdd(type);
      return;
    }
    // Check if this cell type is enabled in the plugin registry
    if (!enabledCellTypes.has(type)) {
      return;
    }
    setMenuOpen(false);
    void onAdd(type);
  };

  const specialItems = useMemo(() => {
    const items: Array<{
      type: NotebookCell["type"];
      label: string;
      icon: LucideIcon | string;
    }> = [];

    // Get all cell types from plugin registry
    const allCellTypes = pluginRegistry.getAllCellTypes();

    // Filter to only enabled cell types
    const filteredCellTypes = allCellTypes.filter((cellDef) => {
      // Only show cell types that are enabled in the registry
      return enabledCellTypes.has(cellDef.type);
    });

    // Build menu items from plugin registry
    for (const cellDef of filteredCellTypes) {
      const metadata = cellDef.metadata;
      // Extract icon from plugin metadata
      // Icons from plugins are React components (Lucide icons)
      let icon: LucideIcon | string = Zap; // Fallback icon if plugin doesn't provide one

      // Get icon from metadata - React components can be functions or objects
      const iconValue = metadata?.icon;
      if (iconValue !== undefined && iconValue !== null) {
        // Lucide icons are React components - can be functions or objects with $$typeof
        // Check if it's a function (React component) or an object (Lucide icon component)
        if (typeof iconValue === "function" || typeof iconValue === "object") {
          icon = iconValue as LucideIcon;
        } else if (typeof iconValue === "string") {
          icon = iconValue;
        }
      }

      items.push({
        type: cellDef.type as NotebookCell["type"],
        label: metadata.name || cellDef.type,
        icon,
      });
    }

    return items;
  }, [enabledCellTypes]);

  return (
    <div
      ref={containerRef}
      className={clsx(
        "relative mt-1 mb-2 flex items-center gap-1 px-1 py-1 text-sm text-muted-foreground",
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
        <PlusIcon className="h-3 w-3" />
        Markdown
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 rounded-lg border border-border/50 bg-background/50 px-2.5 text-xs font-medium text-muted-foreground shadow-sm transition-all hover:border-border hover:bg-background hover:text-foreground hover:shadow"
        onClick={() => handleAdd("code")}
        disabled={disabled}
      >
        <PlusIcon className="h-3 w-3" />
        Code
      </Button>
      {specialItems.length > 0 && (
        <>
          <Button
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
                  className="z-1000 max-h-[400px] overflow-y-auto rounded-md border border-border bg-card/95 p-1 text-sm text-card-foreground shadow-lg"
                  ref={(node) => {
                    menuRef.current = node;
                  }}
                  style={{
                    position: "fixed",
                    top: menuPosition.top,
                    left: menuPosition.left,
                    width: menuPosition.width,
                  }}
                >
                  {specialItems.map(({ type, label, icon }) => {
                    // Handle Lucide React icon components
                    // React components can be functions or objects (Lucide icons are ForwardRef objects)
                    // If icon is a function or object (React component), use it; otherwise fallback to Zap
                    const IconComponent =
                      icon &&
                      (typeof icon === "function" || typeof icon === "object")
                        ? (icon as LucideIcon)
                        : null;
                    const iconString =
                      icon && typeof icon === "string" ? icon : null;

                    return (
                      <button
                        key={type}
                        type="button"
                        className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-foreground hover:bg-muted/60"
                        onClick={() => handleAdd(type)}
                      >
                        {IconComponent ? (
                          <IconComponent className="h-4 w-4 shrink-0" />
                        ) : iconString ? (
                          <span className="h-4 w-4 shrink-0">{iconString}</span>
                        ) : (
                          <Zap className="h-4 w-4 shrink-0" />
                        )}
                        {label}
                      </button>
                    );
                  })}
                </div>,
                document.body
              )
            : null}
        </>
      )}
    </div>
  );
};

export default AddCellMenu;
