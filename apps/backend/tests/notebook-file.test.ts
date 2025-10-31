import { beforeAll, describe, expect, it } from "vitest";
import {
  createNotebookFromFileDefinition,
  serializeNotebookToFileDefinition,
} from "../src/notebooks/file.js";
import type {
  NotebookFile,
  NotebookFileSqlCell,
  SqlCell,
} from "@nodebooks/notebook-schema";
import { backendPluginRegistry } from "../src/plugins/index.js";
import {
  SqlCellSchema,
  createSqlCell,
  type NotebookFileSqlCell as SqlFileCellType,
} from "@nodebooks/sql-cell/schema";
import type {
  NotebookCell,
  NotebookFileCell,
} from "@nodebooks/notebook-schema";

const isEmptyRecord = (
  value: Record<string, unknown> | undefined | null
): boolean => {
  if (!value) return true;
  return Object.keys(value).length === 0;
};

describe("notebook file helpers", () => {
  beforeAll(async () => {
    // Register SQL plugin metadata so SQL cells can be deserialized
    // Construct plugin without frontend dependencies
    await backendPluginRegistry.register({
      id: "@nodebooks/sql-cell",
      version: "0.1.0",
      metadata: {
        name: "SQL Cell",
        description: "Execute SQL queries against PostgreSQL databases",
        version: "0.1.0",
      },
      cells: [
        {
          type: "sql",
          schema: SqlCellSchema,
          metadata: {
            name: "SQL",
            description: "Run SQL queries against a database connection",
          },
          createCell: createSqlCell,
          serialize: (cell: NotebookCell): NotebookFileCell => {
            const sqlCell = cell as SqlCell;
            const result: SqlFileCellType = {
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
            const sqlFileCell = fileCell as SqlFileCellType;
            return createSqlCell({
              metadata: sqlFileCell.metadata ?? {},
              connectionId: sqlFileCell.connectionId,
              query: sqlFileCell.query ?? "",
              assignVariable: sqlFileCell.assignVariable,
              result: sqlFileCell.result,
            });
          },
          enabled: () => true,
        },
      ],
      init: async () => {
        // No initialization needed
      },
    });
  });

  it("preserves SQL cells and connections when importing", () => {
    const template: NotebookFile = {
      id: "sql-template",
      title: "SQL Template",
      description: "Includes SQL cells",
      notebook: {
        name: "SQL Template",
        env: {
          runtime: "node",
          version: "22.x",
          variables: {
            DATABASE_URL: "postgres://user:pass@host:5432/db",
          },
        },
        sql: {
          connections: [
            {
              id: "conn-1",
              driver: "postgres",
              name: "Primary",
              config: {
                connectionString: "{{DATABASE_URL}}",
              },
            },
          ],
        },
        cells: [
          {
            type: "sql",
            connectionId: "conn-1",
            query: "select now();",
            assignVariable: "currentTime",
          },
        ],
      },
    };

    const notebook = createNotebookFromFileDefinition(template);
    expect(notebook.sql.connections).toHaveLength(1);
    expect(notebook.sql.connections[0]?.id).toBe("conn-1");
    expect(notebook.cells).toHaveLength(1);
    expect(notebook.cells[0]?.type).toBe("sql");
    const sqlCell = notebook.cells[0] as SqlCell;
    expect(sqlCell.query).toBe("select now();");
    expect(sqlCell.assignVariable).toBe("currentTime");
  });

  it("serializes SQL cells and connections back to file definition", () => {
    const template: NotebookFile = {
      id: "sql-template",
      title: "SQL Template",
      description: "Includes SQL cells",
      notebook: {
        name: "SQL Template",
        env: {
          runtime: "node",
          version: "22.x",
        },
        sql: {
          connections: [
            {
              id: "conn-1",
              driver: "postgres",
              name: "Primary",
              config: {
                connectionString: "postgres://example.com/db",
              },
            },
          ],
        },
        cells: [
          {
            type: "sql",
            connectionId: "conn-1",
            query: "select 1;",
            assignVariable: "rows",
          },
        ],
      },
    };

    const notebook = createNotebookFromFileDefinition(template);
    const serialized = serializeNotebookToFileDefinition(notebook);

    expect(serialized.notebook.sql?.connections).toHaveLength(1);
    expect(serialized.notebook.sql?.connections[0]?.id).toBe("conn-1");
    expect(serialized.notebook.cells).toHaveLength(1);
    const serializedCell = serialized.notebook.cells[0] as
      | NotebookFileSqlCell
      | undefined;
    expect(serializedCell?.type).toBe("sql");
    expect(serializedCell?.query).toBe("select 1;");
    expect(serializedCell?.assignVariable).toBe("rows");
  });
});
