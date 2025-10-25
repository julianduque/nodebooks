import { describe, expect, it } from "vitest";
import {
  createNotebookFromFileDefinition,
  serializeNotebookToFileDefinition,
} from "../src/notebooks/file.js";
import type {
  NotebookFile,
  NotebookFileSqlCell,
  SqlCell,
} from "@nodebooks/notebook-schema";

describe("notebook file helpers", () => {
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
