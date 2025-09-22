import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Notebook } from "@nodebooks/notebook-schema";

const sqliteCtor = vi.fn();
const memoryCtor = vi.fn();
const sessionCtor = vi.fn();
const postgresCtor = vi.fn();

const originalPersistence = process.env.NODEBOOKS_PERSISTENCE;
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalSqlitePath = process.env.NODEBOOKS_SQLITE_PATH;

// Mock Next.js to avoid spinning up the real compiler
const handledPaths: string[] = [];
vi.mock("next", () => {
  return {
    default: (_opts: unknown) => {
      return {
        prepare: async () => {},
        getRequestHandler:
          () => (req: IncomingMessage, res: ServerResponse) => {
            handledPaths.push(req.url || "");
            res.statusCode = 200;
            res.setHeader("content-type", "text/plain");
            res.end("next-ok");
          },
      };
    },
  };
});

// Keep the server lightweight by stubbing heavy modules
vi.mock("../src/store/sqlite.js", () => ({
  SqliteNotebookStore: class {
    constructor(options?: unknown) {
      sqliteCtor(options);
    }
    async all(): Promise<Notebook[]> {
      return [] as Notebook[];
    }
    async save() {}
  },
}));
vi.mock("../src/store/memory.js", () => ({
  InMemoryNotebookStore: class {
    constructor(options?: unknown) {
      memoryCtor(options);
    }
  },
  InMemorySessionManager: class {
    constructor(store: unknown) {
      sessionCtor(store);
    }
  },
}));
vi.mock("../src/store/postgres.js", () => ({
  PostgresNotebookStore: class {
    constructor(options?: unknown) {
      postgresCtor(options);
    }
  },
}));
vi.mock("../src/routes/notebooks.js", () => ({
  registerNotebookRoutes: () => {},
}));
vi.mock("../src/routes/dependencies.js", () => ({
  registerDependencyRoutes: () => {},
}));
vi.mock("../src/routes/sessions.js", () => ({
  registerSessionRoutes: () => {},
}));
vi.mock("../src/kernel/router.js", () => ({
  createKernelUpgradeHandler: () => () => false,
}));

import { createServer, createNotebookStore } from "../src/server.js";

beforeEach(() => {
  handledPaths.length = 0;
  sqliteCtor.mockClear();
  memoryCtor.mockClear();
  sessionCtor.mockClear();
  postgresCtor.mockClear();
  delete process.env.NODEBOOKS_PERSISTENCE;
  delete process.env.DATABASE_URL;
  delete process.env.NODEBOOKS_SQLITE_PATH;
});

afterAll(() => {
  if (originalPersistence === undefined) {
    delete process.env.NODEBOOKS_PERSISTENCE;
  } else {
    process.env.NODEBOOKS_PERSISTENCE = originalPersistence;
  }
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
  if (originalSqlitePath === undefined) {
    delete process.env.NODEBOOKS_SQLITE_PATH;
  } else {
    process.env.NODEBOOKS_SQLITE_PATH = originalSqlitePath;
  }
});

describe("createNotebookStore", () => {
  it("defaults to sqlite when not specified", () => {
    const result = createNotebookStore();
    expect(result.driver).toBe("sqlite");
    expect(sqliteCtor).toHaveBeenCalledWith({ databaseFile: undefined });
    expect(memoryCtor).not.toHaveBeenCalled();
  });

  it("creates an in-memory store when requested", () => {
    const result = createNotebookStore({ driver: "in-memory" });
    expect(result.driver).toBe("in-memory");
    expect(memoryCtor).toHaveBeenCalledTimes(1);
    expect(sqliteCtor).not.toHaveBeenCalled();
  });

  it("passes connection strings to the Postgres store", () => {
    const connectionString = "postgres://example/db?sslmode=require";
    const result = createNotebookStore({
      driver: "postgres",
      databaseUrl: connectionString,
    });
    expect(result.driver).toBe("postgres");
    expect(postgresCtor).toHaveBeenCalledWith({
      connectionString,
    });
  });

  it("throws for unsupported persistence drivers", () => {
    expect(() => createNotebookStore({ driver: "unknown" })).toThrow(
      /Unsupported NODEBOOKS_PERSISTENCE/
    );
  });
});

describe("server integration (single-port)", () => {
  it("serves health under /health and forwards other paths to Next", async () => {
    const app = await createServer({ logger: false });
    await app.ready();

    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: "ok" });

    const nextRes = await app.inject({ method: "GET", url: "/" });
    expect(nextRes.statusCode).toBe(200);
    expect(nextRes.body).toBe("next-ok");
    expect(handledPaths).toContain("/");

    await app.close();
  });
});
