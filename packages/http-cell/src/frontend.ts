// Frontend-only exports for http-cell plugin
import type { CellPlugin } from "@nodebooks/cell-plugin-api";
import { Globe } from "lucide-react";
import HttpCellView from "./frontend/http-cell-view.js";
import PublicHttpCell from "./frontend/public/public-http-cell.js";
import { pluginMetadata, httpCellMetadata } from "./metadata.js";
export {
  buildHttpExecutionDetails,
  buildHttpCurlCommand,
  buildHttpCodeSnippet,
} from "./frontend/http-cell-utils.js";
export type { HttpExecutionDetails } from "./frontend/http-cell-utils.js";

export const httpCellPlugin: CellPlugin = {
  ...pluginMetadata,
  cells: [
    {
      ...httpCellMetadata,
      // Override metadata with frontend-specific icon
      metadata: {
        ...httpCellMetadata.metadata,
        icon: Globe,
      },
      frontend: {
        Component: HttpCellView,
        PublicComponent: PublicHttpCell,
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

export default httpCellPlugin;
