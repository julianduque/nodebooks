import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { createEmptyNotebook } from "@nodebooks/notebook-schema";
import { createPlotCell } from "../src/schema.js";
import { registerPlotCellRoutes } from "../src/backend/router.js";

// Mock store implementations
class InMemoryNotebookStore {
  private notebooks = new Map<string, unknown>();

  constructor(notebooks: unknown[] = []) {
    for (const nb of notebooks) {
      const notebook = nb as { id: string };
      this.notebooks.set(notebook.id, nb);
    }
  }

  async save(notebook: unknown): Promise<unknown> {
    const nb = notebook as { id: string };
    this.notebooks.set(nb.id, notebook);
    return notebook;
  }

  async get(id: string): Promise<unknown | undefined> {
    return this.notebooks.get(id);
  }

  async all(): Promise<unknown[]> {
    return Array.from(this.notebooks.values());
  }

  async remove(id: string): Promise<unknown | undefined> {
    const notebook = this.notebooks.get(id);
    this.notebooks.delete(id);
    return notebook;
  }

  async getByPublicSlug(_slug: string): Promise<unknown | undefined> {
    return undefined;
  }
}

class InMemoryNotebookCollaboratorStore {
  async getUserRole(_notebookId: string, _userId: string): Promise<string> {
    return "owner";
  }
}

class InMemorySessionManager {
  private sessions = new Map<
    string,
    { id: string; notebookId: string; status: "open" | "closed" }
  >();
  private counter = 0;

  constructor(private store: InMemoryNotebookStore) {}

  async createSession(notebookId: string): Promise<{
    id: string;
    notebookId: string;
    status: "open" | "closed";
  }> {
    const id = `session-${++this.counter}`;
    const session = { id, notebookId, status: "open" as const };
    this.sessions.set(id, session);
    return session;
  }

  async closeSession(
    sessionId: string
  ): Promise<
    { id: string; notebookId: string; status: "open" | "closed" } | undefined
  > {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = "closed";
    }
    return session;
  }

  async listSessions(
    notebookId?: string
  ): Promise<
    Array<{ id: string; notebookId: string; status: "open" | "closed" }>
  > {
    const all = Array.from(this.sessions.values());
    if (notebookId) {
      return all.filter((s) => s.notebookId === notebookId);
    }
    return all;
  }
}

type SafeUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
  updatedAt: string;
};

describe("Plot cell routes", () => {
  const createAdminUser = (): SafeUser => ({
    id: "user-admin",
    email: "admin@example.com",
    name: "Admin",
    role: "admin",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("successfully executes plot cell with runtime globals", async () => {
    const store = new InMemoryNotebookStore([]);
    const collaborators = new InMemoryNotebookCollaboratorStore();
    const sessions = new InMemorySessionManager(store);

    // Mock session globals with runtime variables
    const mockGlobals = {
      readinessBySprint: [
        { sprint: "Sprint 1", readiness: 55 },
        { sprint: "Sprint 2", readiness: 62 },
        { sprint: "Sprint 3", readiness: 70 },
      ],
      workDistribution: [
        { category: "Features", hours: 140 },
        { category: "Maintenance", hours: 48 },
      ],
    };
    const getSessionGlobalsMock = vi.fn().mockReturnValue(mockGlobals);

    const app = Fastify();
    app.addHook("preHandler", (req, _reply, done) => {
      (req as typeof req & { user: SafeUser }).user = createAdminUser();
      done();
    });
    registerPlotCellRoutes(
      app,
      store as never,
      collaborators as never,
      sessions as never,
      getSessionGlobalsMock
    );
    await app.ready();

    const notebook = createEmptyNotebook({
      id: "nb-1",
      cells: [
        createPlotCell({
          id: "plot-1",
          chartType: "scatter",
          dataSource: {
            type: "global",
            variable: "readinessBySprint",
            path: [],
          },
          bindings: {
            traces: [
              {
                id: "trace-1",
                name: "Readiness",
                x: "sprint",
                y: "readiness",
              },
            ],
          },
        }),
      ],
    });
    await store.save(notebook);

    // Create a session for the notebook
    const session = await sessions.createSession(notebook.id);
    const sessionId = session.id;

    const res = await app.inject({
      method: "POST",
      url: `/notebooks/${notebook.id}/plot-cells`,
      payload: {
        cellId: "plot-1",
        chartType: "scatter",
        dataSource: {
          type: "global",
          variable: "readinessBySprint",
          path: [],
        },
        bindings: {
          traces: [
            {
              id: "trace-1",
              name: "Readiness",
              x: "sprint",
              y: "readiness",
            },
          ],
        },
        sessionId,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data?: { result?: unknown } };
    expect(body.data).toBeDefined();
    expect(body.data?.result).toBeDefined();

    const result = body.data?.result as {
      fields?: string[];
      traces?: Array<{ x?: unknown[]; y?: unknown[] }>;
      error?: string;
    };
    expect(result.error).toBeUndefined();
    expect(result.fields).toContain("sprint");
    expect(result.fields).toContain("readiness");
    expect(result.traces).toHaveLength(1);
    expect(result.traces?.[0]?.x).toEqual(["Sprint 1", "Sprint 2", "Sprint 3"]);
    expect(result.traces?.[0]?.y).toEqual([55, 62, 70]);

    await app.close();
  });

  it("returns error when requested global variable is not available", async () => {
    const store = new InMemoryNotebookStore([]);
    const collaborators = new InMemoryNotebookCollaboratorStore();
    const sessions = new InMemorySessionManager(store);

    // Mock session globals with different variables
    const mockGlobals = {
      readinessBySprint: [{ sprint: "Sprint 1", readiness: 55 }],
    };
    const getSessionGlobalsMock = vi.fn().mockReturnValue(mockGlobals);

    const app = Fastify();
    app.addHook("preHandler", (req, _reply, done) => {
      (req as typeof req & { user: SafeUser }).user = createAdminUser();
      done();
    });
    registerPlotCellRoutes(
      app,
      store as never,
      collaborators as never,
      sessions as never,
      getSessionGlobalsMock
    );
    await app.ready();

    const notebook = createEmptyNotebook({
      id: "nb-1",
      cells: [
        createPlotCell({
          id: "plot-1",
          chartType: "scatter",
          dataSource: {
            type: "global",
            variable: "nonExistentVar",
            path: [],
          },
        }),
      ],
    });
    await store.save(notebook);

    // Create a session for the notebook
    const session = await sessions.createSession(notebook.id);
    const sessionId = session.id;

    const res = await app.inject({
      method: "POST",
      url: `/notebooks/${notebook.id}/plot-cells`,
      payload: {
        cellId: "plot-1",
        chartType: "scatter",
        dataSource: {
          type: "global",
          variable: "nonExistentVar",
          path: [],
        },
        bindings: { traces: [] },
        sessionId,
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as {
      error?: string;
      data?: { result?: { error?: string } };
    };
    expect(body.error).toContain("not available");
    expect(body.data?.result?.error).toContain("not available");
    expect(body.data?.result?.error).toContain("readinessBySprint"); // Should list available vars

    await app.close();
  });

  it("returns error when no runtime globals are available", async () => {
    const store = new InMemoryNotebookStore([]);
    const collaborators = new InMemoryNotebookCollaboratorStore();
    const sessions = new InMemorySessionManager(store);

    // Mock empty session globals
    const getSessionGlobalsMock = vi.fn().mockReturnValue(undefined);

    const app = Fastify();
    app.addHook("preHandler", (req, _reply, done) => {
      (req as typeof req & { user: SafeUser }).user = createAdminUser();
      done();
    });
    registerPlotCellRoutes(
      app,
      store as never,
      collaborators as never,
      sessions as never,
      getSessionGlobalsMock
    );
    await app.ready();

    const notebook = createEmptyNotebook({
      id: "nb-1",
      cells: [
        createPlotCell({
          id: "plot-1",
          chartType: "scatter",
          dataSource: {
            type: "global",
            variable: "readinessBySprint",
            path: [],
          },
        }),
      ],
    });
    await store.save(notebook);

    // Create a session for the notebook
    const session = await sessions.createSession(notebook.id);
    const sessionId = session.id;

    const res = await app.inject({
      method: "POST",
      url: `/notebooks/${notebook.id}/plot-cells`,
      payload: {
        cellId: "plot-1",
        chartType: "scatter",
        dataSource: {
          type: "global",
          variable: "readinessBySprint",
          path: [],
        },
        bindings: { traces: [] },
        sessionId,
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as {
      error?: string;
      data?: { result?: { error?: string } };
    };
    expect(body.error).toContain("No runtime globals");
    expect(body.data?.result?.error).toContain("No runtime globals");

    await app.close();
  });

  it("successfully resolves nested path in global variable", async () => {
    const store = new InMemoryNotebookStore([]);
    const collaborators = new InMemoryNotebookCollaboratorStore();
    const sessions = new InMemorySessionManager(store);

    // Mock session globals with nested structure
    const mockGlobals = {
      data: {
        items: [
          { x: 1, y: 10 },
          { x: 2, y: 20 },
        ],
      },
    };
    const getSessionGlobalsMock = vi.fn().mockReturnValue(mockGlobals);

    const app = Fastify();
    app.addHook("preHandler", (req, _reply, done) => {
      (req as typeof req & { user: SafeUser }).user = createAdminUser();
      done();
    });
    registerPlotCellRoutes(
      app,
      store as never,
      collaborators as never,
      sessions as never,
      getSessionGlobalsMock
    );
    await app.ready();

    const notebook = createEmptyNotebook({
      id: "nb-1",
      cells: [
        createPlotCell({
          id: "plot-1",
          chartType: "scatter",
          dataSource: {
            type: "global",
            variable: "data",
            path: ["items"],
          },
        }),
      ],
    });
    await store.save(notebook);

    // Create a session for the notebook
    const session = await sessions.createSession(notebook.id);
    const sessionId = session.id;

    const res = await app.inject({
      method: "POST",
      url: `/notebooks/${notebook.id}/plot-cells`,
      payload: {
        cellId: "plot-1",
        chartType: "scatter",
        dataSource: {
          type: "global",
          variable: "data",
          path: ["items"],
        },
        bindings: {
          traces: [
            {
              id: "trace-1",
              x: "x",
              y: "y",
            },
          ],
        },
        sessionId,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data?: { result?: unknown } };
    expect(body.data?.result).toBeDefined();

    const result = body.data?.result as {
      fields?: string[];
      traces?: Array<{ x?: unknown[]; y?: unknown[] }>;
      error?: string;
    };
    expect(result.error).toBeUndefined();
    expect(result.traces).toHaveLength(1);
    expect(result.traces?.[0]?.x).toEqual([1, 2]);
    expect(result.traces?.[0]?.y).toEqual([10, 20]);

    await app.close();
  });

  it("requires sessionId for global data sources", async () => {
    const store = new InMemoryNotebookStore([]);
    const collaborators = new InMemoryNotebookCollaboratorStore();
    const sessions = new InMemorySessionManager(store);
    const getSessionGlobalsMock = vi.fn();

    const app = Fastify();
    app.addHook("preHandler", (req, _reply, done) => {
      (req as typeof req & { user: SafeUser }).user = createAdminUser();
      done();
    });
    registerPlotCellRoutes(
      app,
      store as never,
      collaborators as never,
      sessions as never,
      getSessionGlobalsMock
    );
    await app.ready();

    const notebook = createEmptyNotebook({
      id: "nb-1",
      cells: [
        createPlotCell({
          id: "plot-1",
          chartType: "scatter",
          dataSource: {
            type: "global",
            variable: "readinessBySprint",
            path: [],
          },
        }),
      ],
    });
    await store.save(notebook);

    // Don't provide sessionId
    const res = await app.inject({
      method: "POST",
      url: `/notebooks/${notebook.id}/plot-cells`,
      payload: {
        cellId: "plot-1",
        chartType: "scatter",
        dataSource: {
          type: "global",
          variable: "readinessBySprint",
          path: [],
        },
        bindings: { traces: [] },
        // sessionId is missing
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { error?: string };
    expect(body.error).toContain("Runtime session");

    await app.close();
  });
});
