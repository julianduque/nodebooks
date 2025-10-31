import type { CellPlugin } from "@nodebooks/cell-plugin-api";
import AiCellView from "./frontend/ai-cell-view.js";
import PublicAiCell from "./frontend/public/public-ai-cell.js";
import { registerBackendRoutes } from "./backend.js";
import { aiCellMetadata, pluginMetadata } from "./metadata.js";

export * from "./schema.js";

export const aiCellPlugin: CellPlugin = {
  ...pluginMetadata,
  cells: [
    {
      ...aiCellMetadata,
      frontend: {
        Component: AiCellView,
        PublicComponent: PublicAiCell,
      },
      backend: registerBackendRoutes,
      enabled: () => true,
    },
  ],
  init: async () => {
    // No initialization needed
  },
};

export default aiCellPlugin;
