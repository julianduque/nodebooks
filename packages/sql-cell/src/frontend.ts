// Frontend-only exports for sql-cell plugin
import type { CellPlugin } from "@nodebooks/cell-plugin-api";
import { Database } from "lucide-react";
import SqlCellView from "./frontend/sql-cell-view.js";
import PublicSqlCell from "./frontend/public/public-sql-cell.js";
import { pluginMetadata, sqlCellMetadata } from "./metadata.js";
export { buildSqlCodeSnippet } from "./frontend/sql-cell-utils.js";

export const sqlCellPlugin: CellPlugin = {
  ...pluginMetadata,
  cells: [
    {
      ...sqlCellMetadata,
      // Override metadata with frontend-specific icon
      metadata: {
        ...sqlCellMetadata.metadata,
        icon: Database,
      },
      frontend: {
        Component: SqlCellView,
        PublicComponent: PublicSqlCell,
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

export default sqlCellPlugin;
