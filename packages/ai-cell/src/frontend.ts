// Frontend-only exports for ai-cell plugin
import type { CellPlugin } from "@nodebooks/cell-plugin-api";
import { Sparkles } from "lucide-react";
import AiCellView from "./frontend/ai-cell-view.js";
import PublicAiCell from "./frontend/public/public-ai-cell.js";
import { pluginMetadata, aiCellMetadata } from "./metadata.js";

export const aiCellPlugin: CellPlugin = {
  ...pluginMetadata,
  cells: [
    {
      ...aiCellMetadata,
      // Override metadata with frontend-specific icon
      metadata: {
        ...aiCellMetadata.metadata,
        icon: Sparkles,
      },
      frontend: {
        Component: AiCellView,
        PublicComponent: PublicAiCell,
      },
      // Backend is only loaded on server side
      backend: undefined,
      enabled: () => true,
    },
  ],
  init: async () => {
    // No initialization needed
  },
};

export default aiCellPlugin;
