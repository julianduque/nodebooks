"use client";

import { useMemo } from "react";
import {
  isAiCell,
  isMarkdownCell,
  isCodeCell,
  isSqlCell,
  isPlotCell,
  isTerminalCell,
  type NotebookCell,
  type SqlConnection,
} from "@/types/notebook";
import type { ThemeMode } from "@/components/theme-context";
import PublicMarkdownCell from "@/components/notebook/public/public-markdown-cell";
import PublicCodeCell from "@/components/notebook/public/public-code-cell";
import { pluginRegistry } from "@/lib/plugins";
import { SharedMarkdown } from "@/components/notebook/shared-markdown";

const PublicCell = ({
  cell,
  theme,
  connections,
  globals,
  userAvatarUrl,
}: {
  cell: NotebookCell;
  theme: ThemeMode;
  connections: SqlConnection[];
  globals?: Record<string, unknown>;
  userAvatarUrl?: string | null;
}) => {
  // Memoize MarkdownComponent for AI cells to prevent infinite re-renders
  const aiMarkdownComponent = useMemo(() => {
    if (!isAiCell(cell)) return undefined;
    return (props: { markdown: string; themeMode?: "light" | "dark" }) => (
      <SharedMarkdown {...props} cellId={cell.id} />
    );
  }, [cell.id]);
  // Core cells (code, markdown) are rendered directly
  if (isMarkdownCell(cell)) {
    return <PublicMarkdownCell cell={cell} theme={theme} />;
  }
  if (isCodeCell(cell)) {
    return <PublicCodeCell cell={cell} />;
  }

  // Dynamic plugin-based rendering for special cells
  const cellDef = pluginRegistry.getCellType(cell.type);
  const isEnabled = pluginRegistry.isCellTypeEnabledSync(cell.type);

  if (!cellDef || !cellDef.frontend?.PublicComponent) {
    // Fallback for unknown cell types or cells without public components
    return (
      <div className="rounded-lg border border-yellow-500 bg-yellow-50 p-4 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
        Cell type &quot;{cell.type}&quot; is not available in public view.
      </div>
    );
  }

  if (!isEnabled) {
    // Plugin is disabled - show a message instead of rendering the cell
    return (
      <div className="rounded-lg border border-yellow-500 bg-yellow-50 p-4 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
        Cell type &quot;{cell.type}&quot; is disabled. This cell cannot be
        displayed in public view.
      </div>
    );
  }

  const PublicComponent = cellDef.frontend.PublicComponent;
  const baseProps = {
    cell,
  };

  // Add type-specific props
  const additionalProps: Record<string, unknown> = {};
  if (isSqlCell(cell)) {
    additionalProps.connections = connections;
    additionalProps.theme = theme;
  } else if (isPlotCell(cell)) {
    additionalProps.globals = globals ?? {};
  } else if (isAiCell(cell) || isTerminalCell(cell)) {
    additionalProps.theme = theme;
    additionalProps.userAvatarUrl = userAvatarUrl;
    if (isAiCell(cell) && aiMarkdownComponent) {
      // Use SharedMarkdown for mermaid diagram support (same as markdown cells)
      additionalProps.MarkdownComponent = aiMarkdownComponent;
    }
  }

  return <PublicComponent {...baseProps} {...additionalProps} />;
};

export default PublicCell;
