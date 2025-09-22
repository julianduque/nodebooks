import Fastify from "fastify";
import cors from "@fastify/cors";
import next from "next";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { InMemorySessionManager } from "./store/memory.js";
import { SqliteNotebookStore } from "./store/sqlite.js";
import { registerNotebookRoutes } from "./routes/notebooks.js";
import { registerDependencyRoutes } from "./routes/dependencies.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { createKernelUpgradeHandler } from "./kernel/router.js";

export interface CreateServerOptions {
  logger?: boolean;
}

export const createServer = async ({
  logger = true,
}: CreateServerOptions = {}) => {
  const isDev = process.env.NODE_ENV !== "production";
  const app = Fastify({ logger, pluginTimeout: isDev ? 120_000 : undefined });

  await app.register(cors, {
    origin: true,
    methods: ["OPTIONS", "GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Accept", "Authorization"],
  });
  // Do not register @fastify/websocket to avoid conflicting with Next HMR

  // Mount Next.js (apps/client) using Next's handler so UI is served by Fastify
  const embedNext =
    (process.env.EMBED_NEXT ?? "true").toLowerCase() !== "false";
  type NextInitOptions = {
    dev?: boolean;
    dir?: string;
    hostname?: string;
    port?: number;
  };
  type NextHandler = (
    req: IncomingMessage,
    res: ServerResponse
  ) => Promise<void>;
  type NextUpgradeHandler = (
    req: IncomingMessage,
    socket: Socket,
    head: Buffer
  ) => void;
  type NextServerLike = {
    prepare: () => Promise<void>;
    getRequestHandler: () => NextHandler;
    getUpgradeHandler?: () => NextUpgradeHandler;
  };
  type NextFactory = (opts: NextInitOptions) => NextServerLike;

  const createNext = next as unknown as NextFactory;
  let nextApp: NextServerLike | null = null;
  let nextHandle: NextHandler | null = null;
  let nextUpgrade: NextUpgradeHandler | null = null;
  if (embedNext) {
    const port = Number.parseInt(process.env.PORT ?? "4000", 10);
    const host = process.env.HOST ?? "0.0.0.0";
    const hostnameForNext = host === "0.0.0.0" ? "localhost" : host;
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const uiDir = path.join(__dirname, "../../client");

    // Switch CWD so Next/PostCSS/Tailwind resolve client configs correctly.
    // Keeping CWD at the client root avoids missing CSS during dev.
    const originalCwd = process.cwd();
    const keepClientCwd =
      (process.env.NEXT_KEEP_CLIENT_CWD ?? "true").toLowerCase() !== "false";
    try {
      process.chdir(uiDir);
    } catch (_err) {
      void _err; // ignore chdir failures
    }

    nextApp = createNext({
      dev: isDev,
      dir: uiDir,
      hostname: hostnameForNext,
      port,
    });
    nextHandle = nextApp.getRequestHandler();
    await nextApp.prepare();

    // Optionally restore API workspace CWD. By default we keep CWD pinned to
    // the client root so PostCSS/Tailwind continue to locate configs during HMR.
    if (!keepClientCwd) {
      try {
        process.chdir(originalCwd);
      } catch (_err) {
        void _err; // ignore chdir failures
      }
    }

    // HMR/WebSocket upgrades for Next dev server assets
    const maybeGetUpgrade = nextApp.getUpgradeHandler?.bind(nextApp);
    if (typeof maybeGetUpgrade === "function") {
      nextUpgrade = maybeGetUpgrade();
    }
  }

  const store = new SqliteNotebookStore({
    databaseFile: process.env.NODEBOOKS_SQLITE_PATH,
  });
  const sessions = new InMemorySessionManager(store);

  app.get("/health", async () => ({ status: "ok" }));

  // Mount all API routes under /api to avoid path conflicts with Next pages
  await app.register(
    async (api) => {
      registerNotebookRoutes(api, store);
      registerDependencyRoutes(api, store);
      registerSessionRoutes(api, sessions);
    },
    { prefix: "/api" }
  );

  // Ensure Next handles everything else (after API routes)
  await app.after();
  if (nextHandle) {
    app.get("/*", async (request, reply) => {
      const handler = nextHandle as NextHandler;
      await handler(
        request.raw as IncomingMessage,
        reply.raw as ServerResponse
      );
      reply.hijack();
    });
  }

  // Central upgrade handler: Next HMR and Kernel WS
  const kernelUpgrade = createKernelUpgradeHandler("/api", sessions, store);
  app.server.on(
    "upgrade",
    (req: IncomingMessage, socket: Socket, head: Buffer) => {
      const url = req.url || "";
      try {
        if (url.startsWith("/_next/") && nextUpgrade) {
          nextUpgrade(req, socket, head);
          return;
        }
        if (kernelUpgrade(req, socket, head)) {
          return;
        }
      } catch (_err) {
        void _err;
      }
      try {
        socket.destroy();
      } catch (_err) {
        void _err;
      }
    }
  );

  return app;
};
