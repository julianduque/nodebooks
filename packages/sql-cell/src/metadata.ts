import { Database } from "lucide-react";
import type { CellTypeDefinition } from "@nodebooks/cell-plugin-api";
import type {
  NotebookCell,
  NotebookFileCell,
} from "@nodebooks/notebook-schema";
import {
  SqlCellSchema,
  createSqlCell,
  type SqlCell,
  type NotebookFileSqlCell,
} from "./schema.js";

const isEmptyRecord = (
  value: Record<string, unknown> | undefined | null
): boolean => {
  if (!value) return true;
  return Object.keys(value).length === 0;
};

/**
 * Shared metadata for SQL cell type.
 * Used by both frontend.ts and index.ts to avoid duplication.
 */
export const sqlCellMetadata = {
  type: "sql",
  schema: SqlCellSchema,
  metadata: {
    name: "SQL",
    description: "Run SQL queries against a database connection",
    icon: Database,
  },
  createCell: createSqlCell,
  serialize: (cell: NotebookCell): NotebookFileCell => {
    const sqlCell = cell as SqlCell;
    const result: NotebookFileSqlCell = {
      type: "sql",
      query: sqlCell.query,
    };
    if (!isEmptyRecord(sqlCell.metadata)) {
      result.metadata = sqlCell.metadata;
    }
    if (sqlCell.connectionId) {
      result.connectionId = sqlCell.connectionId;
    }
    if (sqlCell.assignVariable) {
      result.assignVariable = sqlCell.assignVariable;
    }
    if (sqlCell.result) {
      result.result = sqlCell.result;
    }
    return result;
  },
  deserialize: (fileCell: NotebookFileCell): NotebookCell => {
    const sqlFileCell = fileCell as NotebookFileSqlCell;
    return createSqlCell({
      metadata: sqlFileCell.metadata ?? {},
      connectionId: sqlFileCell.connectionId,
      query: sqlFileCell.query ?? "",
      assignVariable: sqlFileCell.assignVariable,
      result: sqlFileCell.result,
    });
  },
} satisfies Pick<
  CellTypeDefinition,
  "type" | "schema" | "metadata" | "createCell" | "serialize" | "deserialize"
>;

/**
 * Shared plugin metadata.
 */
export const pluginMetadata = {
  id: "@nodebooks/sql-cell",
  version: "0.1.0",
  metadata: {
    name: "SQL Cell",
    description: "Execute SQL queries against PostgreSQL databases",
    version: "0.1.0",
  },
};
