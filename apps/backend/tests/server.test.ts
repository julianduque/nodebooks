import { describe, it, expect, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Notebook } from "@nodebooks/notebook-schema";

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
    async all(): Promise<Notebook[]> {
      return [] as Notebook[];
    }
    async save() {}
  },
}));
vi.mock("../src/store/memory.js", () => ({
  InMemorySessionManager: class {},
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

import { createServer } from "../src/server.js";

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
