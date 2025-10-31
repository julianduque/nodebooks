"use client";

import type { UnknownCell } from "@/types/notebook";
import { AlertCallout } from "@nodebooks/ui";

interface UnknownCellProps {
  cell: UnknownCell;
}

export function UnknownCell({ cell }: UnknownCellProps) {
  const pluginInfo = cell.pluginId ? ` (${cell.pluginId})` : "";

  return (
    <AlertCallout
      level="warn"
      title="Plugin Not Available"
      text={`This cell requires the plugin for "${cell.originalType}" cells.${pluginInfo}\n\nInstall and enable the plugin to view and edit this cell. The cell data is preserved and will be restored when the plugin is available.`}
    />
  );
}
