import type { CellPlugin } from "@nodebooks/cell-plugin-api";
import HttpCellView from "./frontend/http-cell-view.js";
import PublicHttpCell from "./frontend/public/public-http-cell.js";
import { registerBackendRoutes } from "./backend.js";
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
      frontend: {
        Component: HttpCellView,
        PublicComponent: PublicHttpCell,
      },
      backend: registerBackendRoutes,
      enabled: () => true,
    },
  ],
  init: async () => {
    // No initialization needed
  },
};

export default httpCellPlugin;
