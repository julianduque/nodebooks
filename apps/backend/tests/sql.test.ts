import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import {
  createEmptyNotebook,
  type SqlResult,
} from "@nodebooks/notebook-schema";
import { registerSqlRoutes } from "../src/routes/sql.js";
import {
  InMemoryNotebookStore,
  InMemoryNotebookCollaboratorStore,
} from "../src/store/memory.js";
import type { SafeUser } from "../src/types.js";

const mockConnect = vi.fn();
const mockQuery = vi.fn();
const mockEnd = vi.fn();

vi.mock("pg", async () => {
  const actual = await vi.importActual<{ types: unknown }>("pg");
  return {
    ...(actual ?? {}),
    Client: vi.fn(() => ({
      connect: mockConnect,
      query: mockQuery,
      end: mockEnd,
    })),
    types: {
      builtins: {
        INT4: 23,
        TEXT: 25,
      },
    },
  };
});

describe("SQL routes", () => {
  const createAdminUser = (): SafeUser => ({
    id: "user-admin",
    email: "admin@example.com",
    name: "Admin",
    role: "admin",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  beforeEach(() => {
    mockConnect.mockReset();
    mockQuery.mockReset();
    mockEnd.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("executes SQL queries via configured connections", async () => {
    const store = new InMemoryNotebookStore([]);
    const collaborators = new InMemoryNotebookCollaboratorStore();
    const notebook = createEmptyNotebook({
      id: "nb-sql-1",
      sql: {
        connections: [
          {
            id: "conn-1",
            driver: "postgres",
            name: "Primary",
            config: { connectionString: "postgres://example.com/db" },
          },
        ],
      },
    });
    await store.save(notebook);

    mockQuery.mockResolvedValue({
      rows: [
        { id: 1, title: "first" },
        { id: 2, title: "second" },
      ],
      rowCount: 2,
      fields: [
        { name: "id", dataTypeID: 23 },
        { name: "title", dataTypeID: 25 },
      ],
    });

    const app = Fastify();
    app.addHook("preHandler", (req, _reply, done) => {
      (req as typeof req & { user: SafeUser }).user = createAdminUser();
      done();
    });

    registerSqlRoutes(app, store, collaborators);
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/notebooks/nb-sql-1/sql",
      payload: {
        cellId: "cell-1",
        connectionId: "conn-1",
        query: "select id, title from articles",
        assignVariable: "articles",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { data?: { result?: SqlResult } };
    expect(body.data?.result?.rows?.length).toBe(2);
    expect(body.data?.result?.assignedVariable).toBe("articles");
    expect(mockQuery).toHaveBeenCalledWith("select id, title from articles");
    await app.close();
  });

  it("fails when the connection is missing", async () => {
    const store = new InMemoryNotebookStore([]);
    const collaborators = new InMemoryNotebookCollaboratorStore();
    const notebook = createEmptyNotebook({
      id: "nb-sql-2",
    });
    await store.save(notebook);

    const app = Fastify();
    app.addHook("preHandler", (req, _reply, done) => {
      (req as typeof req & { user: SafeUser }).user = createAdminUser();
      done();
    });

    registerSqlRoutes(app, store, collaborators);
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/notebooks/nb-sql-2/sql",
      payload: {
        cellId: "cell-1",
        connectionId: "missing",
        query: "select 1",
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json() as { error?: string };
    expect(body.error).toBe("Database connection not found");
    expect(mockQuery).not.toHaveBeenCalled();
    await app.close();
  });
});
