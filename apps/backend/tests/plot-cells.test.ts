import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import {
  createEmptyNotebook,
  createPlotCell,
} from "@nodebooks/notebook-schema";
import { registerPlotCellRoutes } from "../src/routes/plot-cells.js";
import {
  InMemoryNotebookStore,
  InMemoryNotebookCollaboratorStore,
  InMemorySessionManager,
} from "../src/store/memory.js";
import type { SafeUser } from "../src/types.js";
import * as kernelRouter from "../src/kernel/router.js";

describe("Plot cell routes", () => {
  const createAdminUser = (): SafeUser => ({
    id: "user-admin",
    email: "admin@example.com",
    name: "Admin",
    role: "admin",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  let getSessionGlobalsSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getSessionGlobalsSpy = vi.spyOn(kernelRouter, "getSessionGlobals");
  });

  afterEach(() => {
    getSessionGlobalsSpy.mockRestore();
  });

  const createApp = async () => {
    const store = new InMemoryNotebookStore([]);
    const collaborators = new InMemoryNotebookCollaboratorStore();
    const sessions = new InMemorySessionManager(store);
    const user = createAdminUser();

    const app = Fastify();
    app.addHook("preHandler", (req, _reply, done) => {
      (req as typeof req & { user: SafeUser }).user = user;
      done();
    });

    registerPlotCellRoutes(app, store, collaborators, sessions);
    await app.ready();

    return { app, store, user, sessions };
  };

  it("successfully executes plot cell with runtime globals", async () => {
    const { app, store, sessions } = await createApp();

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
    getSessionGlobalsSpy.mockReturnValue(mockGlobals);

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
    const { app, store, sessions } = await createApp();

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

    // Mock session globals with different variables
    const mockGlobals = {
      readinessBySprint: [{ sprint: "Sprint 1", readiness: 55 }],
    };
    getSessionGlobalsSpy.mockReturnValue(mockGlobals);

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
    const { app, store, sessions } = await createApp();

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

    // Mock empty session globals
    getSessionGlobalsSpy.mockReturnValue(undefined);

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
    const { app, store, sessions } = await createApp();

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

    // Mock session globals with nested structure
    const mockGlobals = {
      data: {
        items: [
          { x: 1, y: 10 },
          { x: 2, y: 20 },
        ],
      },
    };
    getSessionGlobalsSpy.mockReturnValue(mockGlobals);

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
    const { app, store } = await createApp();

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
