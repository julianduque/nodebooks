import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import fastifyCookie from "@fastify/cookie";
import type * as FastifyCookieNamespace from "@fastify/cookie";
import next from "next";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  InMemoryNotebookStore,
  InMemorySessionManager,
  InMemorySettingsStore,
} from "./store/memory.js";
import { SqliteNotebookStore, SqliteSettingsStore } from "./store/sqlite.js";
import {
  PostgresNotebookStore,
  PostgresSettingsStore,
} from "./store/postgres.js";
import type { NotebookStore, SettingsStore } from "./types.js";
import { registerNotebookRoutes } from "./routes/notebooks.js";
import { registerDependencyRoutes } from "./routes/dependencies.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerTemplateRoutes } from "./routes/templates.js";
import { registerTypesRoutes } from "./routes/types.js";
import { registerAttachmentRoutes } from "./routes/attachments.js";
import { createKernelUpgradeHandler } from "./kernel/router.js";
import {
  PASSWORD_COOKIE_NAME,
  derivePasswordToken,
  isTokenValid,
} from "./auth/password.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { loadServerConfig } from "@nodebooks/config";
import type { ServerConfig } from "@nodebooks/config";
import { SettingsService } from "./settings/service.js";
import { setSettingsService } from "./settings/index.js";

export interface CreateServerOptions {
  logger?: boolean;
}

export const createServer = async ({
  logger = true,
}: CreateServerOptions = {}) => {
  const baseConfig = loadServerConfig();
  const { store, settings, driver } = createNotebookStore({}, baseConfig);
  const settingsService = new SettingsService(settings);
  await settingsService.whenReady();
  setSettingsService(settingsService);

  const cfg = loadServerConfig(undefined, settingsService.getSettings());
  const isDev = cfg.isDev;
  const app = Fastify({ logger, pluginTimeout: isDev ? 120_000 : undefined });

  await app.register(fastifyCookie);
  await app.register(cors, {
    origin: true,
    methods: ["OPTIONS", "GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Accept", "Authorization"],
  });
  // Do not register @fastify/websocket to avoid conflicting with Next HMR

  const cookieOptions = {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: !isDev,
  };

  const shouldBypassAuth = (
    request: FastifyRequest,
    passwordToken: string | null
  ) => {
    if (!passwordToken) {
      return true;
    }
    if (request.method === "OPTIONS") {
      return true;
    }
    const url = request.raw.url ?? "/";
    if (url.startsWith("/auth/login")) {
      return true;
    }
    if (url.startsWith("/login")) {
      return true;
    }
    if (url.startsWith("/health")) {
      return true;
    }
    if (url.startsWith("/_next/")) {
      if (url.startsWith("/_next/data")) {
        return url.includes("/login");
      }
      return true;
    }
    if (url.startsWith("/favicon")) {
      return true;
    }
    if (url.startsWith("/icon")) {
      return true;
    }
    if (url.startsWith("/opengraph-image")) {
      return true;
    }
    if (url.startsWith("/assets/")) {
      return true;
    }
    if (request.headers.upgrade === "websocket") {
      return true;
    }
    return false;
  };

  const sendUnauthorized = (request: FastifyRequest, reply: FastifyReply) => {
    const url = request.raw.url ?? "/";
    const wantsJson =
      request.method !== "GET" ||
      url.startsWith("/api") ||
      (request.headers.accept ?? "").includes("application/json") ||
      request.headers["x-requested-with"] === "XMLHttpRequest";

    if (wantsJson) {
      void reply.code(401).send({ error: "Unauthorized" });
      return reply;
    }

    void reply.redirect("/login", 302);
    return reply;
  };

  if (settingsService.getPasswordToken()) {
    app.log.info("Password protection enabled");
  }

  app.addHook("onRequest", async (request, reply) => {
    const passwordToken = settingsService.getPasswordToken();
    if (shouldBypassAuth(request, passwordToken)) {
      return;
    }

    const token = request.cookies[PASSWORD_COOKIE_NAME];
    if (isTokenValid(token, passwordToken ?? "")) {
      return;
    }

    return sendUnauthorized(request, reply);
  });

  app.post("/auth/login", async (request, reply) => {
    const passwordToken = settingsService.getPasswordToken();
    if (!passwordToken) {
      void reply
        .code(400)
        .send({ error: "Password protection is not enabled" });
      return;
    }

    const body = z
      .object({ password: z.string().min(1) })
      .safeParse(request.body);
    if (!body.success) {
      void reply.code(400).send({ error: "Password is required" });
      return;
    }

    if (!isTokenValid(derivePasswordToken(body.data.password), passwordToken)) {
      void reply.code(401).send({ error: "Incorrect password" });
      return;
    }

    reply.setCookie(PASSWORD_COOKIE_NAME, passwordToken, cookieOptions);
    void reply.code(204).send();
  });

  // Mount Next.js (apps/client) using Next's handler so UI is served by Fastify
  const embedNext = cfg.embedNext;
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
    const port = cfg.port;
    const host = cfg.host;
    const hostnameForNext = host === "0.0.0.0" ? "localhost" : host;
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const uiDir = path.join(__dirname, "../../client");

    // Switch CWD so Next/PostCSS/Tailwind resolve client configs correctly.
    // Keeping CWD at the client root avoids missing CSS during dev.
    const originalCwd = process.cwd();
    const keepClientCwd = cfg.keepClientCwd;
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

  const sessions = new InMemorySessionManager(store);

  const maybeClosable = store as { close?: () => Promise<void> | void };
  if (typeof maybeClosable.close === "function") {
    app.addHook("onClose", async () => {
      await maybeClosable.close?.();
    });
  }

  app.log.info({ persistence: driver }, "Notebook persistence ready");

  app.get("/health", async () => ({ status: "ok" }));

  // Mount all API routes under /api to avoid path conflicts with Next pages
  await app.register(
    async (api) => {
      await registerSettingsRoutes(api, {
        settings: settingsService,
        cookieOptions:
          cookieOptions as FastifyCookieNamespace.CookieSerializeOptions,
      });
      registerAttachmentRoutes(api, store);
      registerNotebookRoutes(api, store);
      registerDependencyRoutes(api, store);
      registerSessionRoutes(api, sessions);
      registerTemplateRoutes(api);
      registerTypesRoutes(api);
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
  const kernelUpgrade = createKernelUpgradeHandler("/api", sessions, store, {
    getPasswordToken: () => settingsService.getPasswordToken(),
  });
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

type PersistenceDriver = "in-memory" | "sqlite" | "postgres";

interface CreateNotebookStoreOptions {
  driver?: string;
  sqlitePath?: string;
  databaseUrl?: string;
}

interface NotebookStoreResult {
  store: NotebookStore;
  settings: SettingsStore;
  driver: PersistenceDriver;
}

const resolvePersistenceDriver = (
  raw: string | undefined
): PersistenceDriver => {
  const normalized = (raw ?? "sqlite").trim().toLowerCase();
  if (normalized === "in-memory" || normalized === "memory") {
    return "in-memory";
  }
  if (normalized === "sqlite") {
    return "sqlite";
  }
  if (normalized === "postgres" || normalized === "postgresql") {
    return "postgres";
  }
  throw new Error(
    `Unsupported NODEBOOKS_PERSISTENCE value "${raw}". Use "in-memory", "sqlite", or "postgres".`
  );
};

export const createNotebookStore = (
  options: CreateNotebookStoreOptions = {},
  config: ServerConfig = loadServerConfig()
): NotebookStoreResult => {
  const driver = resolvePersistenceDriver(
    options.driver ?? config.persistence.driver
  );
  switch (driver) {
    case "in-memory":
      return {
        store: new InMemoryNotebookStore(),
        settings: new InMemorySettingsStore(),
        driver,
      };
    case "sqlite": {
      const sqliteStore = new SqliteNotebookStore({
        databaseFile: options.sqlitePath ?? config.persistence.sqlitePath,
      });
      return {
        store: sqliteStore,
        settings: new SqliteSettingsStore(sqliteStore),
        driver,
      };
    }
    case "postgres": {
      const postgresStore = new PostgresNotebookStore({
        connectionString: options.databaseUrl ?? config.persistence.databaseUrl,
      });
      return {
        store: postgresStore,
        settings: new PostgresSettingsStore(postgresStore),
        driver,
      };
    }
  }
};
