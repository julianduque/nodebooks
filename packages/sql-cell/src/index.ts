import type { CellPlugin } from "@nodebooks/cell-plugin-api";
import SqlCellView from "./frontend/sql-cell-view.js";
import PublicSqlCell from "./frontend/public/public-sql-cell.js";
import { registerBackendRoutes } from "./backend.js";
import { pluginMetadata, sqlCellMetadata } from "./metadata.js";
export { buildSqlCodeSnippet } from "./frontend/sql-cell-utils.js";

export const sqlCellPlugin: CellPlugin = {
  ...pluginMetadata,
  cells: [
    {
      ...sqlCellMetadata,
      frontend: {
        Component: SqlCellView,
        PublicComponent: PublicSqlCell,
      },
      backend: registerBackendRoutes,
      enabled: () => true,
    },
  ],
  init: async () => {
    // No initialization needed
  },
};

export default sqlCellPlugin;
