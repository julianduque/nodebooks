import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Notebook } from "@nodebooks/notebook-schema";

const sqliteCtor = vi.fn();
const sqliteSettingsCtor = vi.fn();
const memoryCtor = vi.fn();
const memorySettingsCtor = vi.fn();
const sessionCtor = vi.fn();
const postgresCtor = vi.fn();
const postgresSettingsCtor = vi.fn();
const settingsServiceCtor = vi.fn();
const authValidateSession = vi.fn(async (_token?: string) => null as const);
const authHasUsers = vi.fn(async () => true);
const authCreateUser = vi.fn();
const authCompleteInvitation = vi.fn();
const authAuthenticate = vi.fn();
const authLogout = vi.fn();
const authLogoutAll = vi.fn();
const authInspectInvitation = vi.fn();
const authListUsers = vi.fn();
const authInviteToNotebook = vi.fn();
const authListNotebookInvitations = vi.fn();
const authListNotebookCollaborators = vi.fn();

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
  SqliteSettingsStore: class {
    constructor(store: unknown) {
      sqliteSettingsCtor(store);
    }
    async all() {
      return {} as Record<string, unknown>;
    }
    async get() {
      return undefined;
    }
    async set() {}
    async delete() {}
  },
  SqliteUserStore: class {
    constructor(_store: unknown) {}
  },
  SqliteAuthSessionStore: class {
    constructor(_store: unknown) {}
  },
  SqliteInvitationStore: class {
    constructor(_store: unknown) {}
  },
  SqliteNotebookCollaboratorStore: class {
    constructor(_store: unknown) {}
  },
  SqliteProjectStore: class {
    constructor(_store: unknown) {}
  },
  SqliteProjectInvitationStore: class {
    constructor(_store: unknown) {}
  },
  SqliteProjectCollaboratorStore: class {
    constructor(_store: unknown) {}
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
  InMemorySettingsStore: class {
    constructor() {
      memorySettingsCtor();
    }
    async all() {
      return {} as Record<string, unknown>;
    }
    async get() {
      return undefined;
    }
    async set() {}
    async delete() {}
  },
  InMemoryUserStore: class {
    constructor() {}
  },
  InMemoryAuthSessionStore: class {
    constructor() {}
  },
  InMemoryInvitationStore: class {
    constructor() {}
  },
  InMemoryNotebookCollaboratorStore: class {
    constructor() {}
  },
  InMemoryProjectStore: class {
    constructor() {}
  },
  InMemoryProjectInvitationStore: class {
    constructor() {}
  },
  InMemoryProjectCollaboratorStore: class {
    constructor() {}
  },
}));
vi.mock("../src/store/postgres.js", () => ({
  PostgresNotebookStore: class {
    constructor(options?: unknown) {
      postgresCtor(options);
    }
  },
  PostgresSettingsStore: class {
    constructor(store: unknown) {
      postgresSettingsCtor(store);
    }
    async all() {
      return {} as Record<string, unknown>;
    }
    async get() {
      return undefined;
    }
    async set() {}
    async delete() {}
  },
  PostgresUserStore: class {
    constructor(_store: unknown) {}
  },
  PostgresAuthSessionStore: class {
    constructor(_store: unknown) {}
  },
  PostgresInvitationStore: class {
    constructor(_store: unknown) {}
  },
  PostgresNotebookCollaboratorStore: class {
    constructor(_store: unknown) {}
  },
  PostgresProjectStore: class {
    constructor(_store: unknown) {}
  },
  PostgresProjectInvitationStore: class {
    constructor(_store: unknown) {}
  },
  PostgresProjectCollaboratorStore: class {
    constructor(_store: unknown) {}
  },
}));
vi.mock("../src/routes/notebooks.js", () => ({
  registerNotebookRoutes: () => {},
}));
vi.mock("../src/routes/dependencies.js", () => ({
  registerDependencyRoutes: () => {},
}));
vi.mock("../src/routes/attachments.js", () => ({
  registerAttachmentRoutes: () => {},
}));
vi.mock("../src/routes/sessions.js", () => ({
  registerSessionRoutes: () => {},
}));
vi.mock("../src/kernel/router.js", () => ({
  createKernelUpgradeHandler: () => () => false,
  getSessionGlobals: (_sessionId: string) => undefined,
}));
vi.mock("../src/routes/settings.js", () => ({
  registerSettingsRoutes: () => {},
}));
vi.mock("../src/settings/service.js", () => ({
  SettingsService: class {
    constructor(store: unknown) {
      settingsServiceCtor(store);
    }
    async whenReady() {}
    getSettings() {
      return {};
    }
  },
}));
vi.mock("../src/settings/index.js", () => ({
  setSettingsService: () => {},
}));
vi.mock("../src/auth/service.js", () => ({
  AuthService: class {
    async hasUsers(...args: unknown[]) {
      return authHasUsers(...args);
    }
    async validateSession(...args: unknown[]) {
      return authValidateSession(...args);
    }
    async createUser(...args: unknown[]) {
      return authCreateUser(...args);
    }
    async completeInvitation(...args: unknown[]) {
      return authCompleteInvitation(...args);
    }
    async authenticate(...args: unknown[]) {
      return authAuthenticate(...args);
    }
    async logout(...args: unknown[]) {
      return authLogout(...args);
    }
    async logoutAll(...args: unknown[]) {
      return authLogoutAll(...args);
    }
    async inspectInvitation(...args: unknown[]) {
      return authInspectInvitation(...args);
    }
    async listUsers(...args: unknown[]) {
      return authListUsers(...args);
    }
    async inviteToNotebook(...args: unknown[]) {
      return authInviteToNotebook(...args);
    }
    async listNotebookInvitations(...args: unknown[]) {
      return authListNotebookInvitations(...args);
    }
    async listNotebookCollaborators(...args: unknown[]) {
      return authListNotebookCollaborators(...args);
    }
  },
}));

import { createServer, createNotebookStore } from "../src/server.js";
import { SESSION_COOKIE_NAME } from "../src/auth/session.js";

beforeEach(() => {
  handledPaths.length = 0;
  sqliteCtor.mockClear();
  sqliteSettingsCtor.mockClear();
  memoryCtor.mockClear();
  memorySettingsCtor.mockClear();
  sessionCtor.mockClear();
  postgresCtor.mockClear();
  postgresSettingsCtor.mockClear();
  settingsServiceCtor.mockClear();
  authValidateSession.mockReset();
  authHasUsers.mockReset();
  authCreateUser.mockReset();
  authCompleteInvitation.mockReset();
  authAuthenticate.mockReset();
  authLogout.mockReset();
  authLogoutAll.mockReset();
  authInspectInvitation.mockReset();
  authListUsers.mockReset();
  authInviteToNotebook.mockReset();
  authListNotebookInvitations.mockReset();
  authListNotebookCollaborators.mockReset();
  authValidateSession.mockResolvedValue(null);
  authHasUsers.mockResolvedValue(true);
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
    expect(sqliteCtor).toHaveBeenCalledWith({
      databaseFile: ".data/nodebooks.sqlite",
    });
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
  it("allows health checks without auth and redirects unauthorized traffic", async () => {
    const app = await createServer({ logger: false });
    await app.ready();

    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: "ok" });

    const nextRes = await app.inject({ method: "GET", url: "/" });
    expect(nextRes.statusCode).toBe(302);
    expect(nextRes.headers.location).toBe("/login");
    expect(handledPaths).not.toContain("/");

    await app.close();
  });

  it("forwards authenticated requests to Next", async () => {
    const app = await createServer({ logger: false });
    await app.ready();

    const user = {
      id: "user-123",
      email: "admin@example.com",
      name: "Admin User",
      role: "admin" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const session = {
      id: "session-123",
      userId: user.id,
      tokenHash: "hashed-token",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      revokedAt: null,
    };
    authValidateSession.mockResolvedValueOnce({ user, session });

    const nextRes = await app.inject({
      method: "GET",
      url: "/",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=valid-session-token`,
      },
    });

    expect(nextRes.statusCode).toBe(200);
    expect(nextRes.body).toBe("next-ok");
    expect(handledPaths).toContain("/");

    await app.close();
  });
});
