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
  InMemorySessionManager as InMemoryKernelSessionManager,
  InMemorySettingsStore,
  InMemoryUserStore,
  InMemoryAuthSessionStore,
  InMemoryInvitationStore,
  InMemoryNotebookCollaboratorStore,
} from "./store/memory.js";
import {
  SqliteNotebookStore,
  SqliteSettingsStore,
  SqliteUserStore,
  SqliteAuthSessionStore,
  SqliteInvitationStore,
  SqliteNotebookCollaboratorStore,
} from "./store/sqlite.js";
import {
  PostgresNotebookStore,
  PostgresSettingsStore,
  PostgresUserStore,
  PostgresAuthSessionStore,
  PostgresInvitationStore,
  PostgresNotebookCollaboratorStore,
} from "./store/postgres.js";
import type {
  NotebookStore,
  SettingsStore,
  UserStore,
  AuthSessionStore,
  SafeUser,
  AuthSession,
  InvitationStore,
  NotebookCollaboratorStore,
} from "./types.js";
import { registerNotebookRoutes } from "./routes/notebooks.js";
import { registerDependencyRoutes } from "./routes/dependencies.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerTemplateRoutes } from "./routes/templates.js";
import { registerTypesRoutes } from "./routes/types.js";
import { registerAiRoutes } from "./routes/ai.js";
import { registerAttachmentRoutes } from "./routes/attachments.js";
import { registerNotebookSharingRoutes } from "./routes/notebook-sharing.js";
import { createKernelUpgradeHandler } from "./kernel/router.js";
import { createTerminalUpgradeHandler } from "./terminal/router.js";
import { NotebookCollaborationService } from "./notebooks/collaboration.js";
import { AuthService } from "./auth/service.js";
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE_MS,
  parseCookieHeader,
} from "./auth/session.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { loadServerConfig } from "@nodebooks/config";
import type { ServerConfig } from "@nodebooks/config";
import { SettingsService } from "./settings/service.js";
import { setSettingsService } from "./settings/index.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: SafeUser;
    authSession?: AuthSession;
  }
}

export interface CreateServerOptions {
  logger?: boolean;
}

export const createServer = async ({
  logger = true,
}: CreateServerOptions = {}) => {
  const baseConfig = loadServerConfig();
  const {
    store,
    settings,
    driver,
    users,
    authSessions,
    invitations,
    collaborators,
  } = createNotebookStore({}, baseConfig);
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

  const authService = new AuthService(
    users,
    authSessions,
    invitations,
    collaborators
  );

  const cookieOptions: FastifyCookieNamespace.CookieSerializeOptions = {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: !isDev,
    maxAge: Math.floor(SESSION_COOKIE_MAX_AGE_MS / 1000),
  };

  const clearCookieOptions: FastifyCookieNamespace.CookieSerializeOptions = {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: !isDev,
  };

  const isPublicRequest = async (request: FastifyRequest) => {
    if (request.method === "OPTIONS") {
      return true;
    }
    const url = request.raw.url ?? "/";
    if (url.startsWith("/auth/login") || url.startsWith("/auth/logout")) {
      return true;
    }
    if (url.startsWith("/auth/signup/status")) {
      return true;
    }
    if (url.startsWith("/auth/signup")) {
      return true;
    }
    if (url.startsWith("/auth/invitations/inspect")) {
      return true;
    }
    if (url.startsWith("/login")) {
      return true;
    }
    if (url.startsWith("/signup")) {
      return true;
    }
    if (url.startsWith("/health")) {
      return true;
    }
    if (url.startsWith("/_next/")) {
      if (url.startsWith("/_next/data")) {
        return url.includes("/login") || url.includes("/signup");
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

  app.addHook("onRequest", async (request, reply) => {
    if (await isPublicRequest(request)) {
      return;
    }

    const sessionToken = request.cookies[SESSION_COOKIE_NAME];
    const validated = await authService.validateSession(sessionToken);
    if (!validated) {
      return sendUnauthorized(request, reply);
    }

    request.user = validated.user;
    request.authSession = validated.session;
  });

  const signupSchema = z.object({
    token: z.string().min(1).optional(),
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().trim().min(1).max(120),
  });

  const invitationSignupSchema = z.object({
    token: z.string().min(1),
    password: z.string().min(8),
    name: z.string().trim().min(1).max(120),
  });

  const invitationInspectSchema = z.object({
    token: z.string().min(1),
  });

  app.get("/auth/signup/status", async (_request, reply) => {
    const hasUsers = await authService.hasUsers();
    void reply.send({ data: { hasUsers, canBootstrap: !hasUsers } });
  });

  app.post("/auth/signup", async (request, reply) => {
    const hasUsers = await authService.hasUsers();
    if (!hasUsers) {
      const body = signupSchema.safeParse(request.body);
      if (!body.success) {
        void reply.code(400).send({ error: "Invalid signup payload" });
        return;
      }
      try {
        const result = await authService.createUser({
          email: body.data.email,
          password: body.data.password,
          name: body.data.name,
          role: "admin",
          autoLogin: true,
        });

        if ("token" in result && result.token) {
          reply.setCookie(SESSION_COOKIE_NAME, result.token, cookieOptions);
        }

        void reply.code(201).send({ data: result.user });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        if (message.includes("already exists")) {
          void reply.code(409).send({ error: "User already exists" });
          return;
        }
        request.log.error({ err: error }, "Failed to sign up user");
        void reply.code(500).send({ error: "Failed to sign up user" });
      }
      return;
    }

    const invited = invitationSignupSchema.safeParse(request.body);
    if (!invited.success) {
      void reply.code(400).send({ error: "Invalid signup payload" });
      return;
    }

    try {
      const result = await authService.completeInvitation({
        token: invited.data.token,
        password: invited.data.password,
        name: invited.data.name,
      });

      if ("token" in result && result.token) {
        reply.setCookie(SESSION_COOKIE_NAME, result.token, cookieOptions);
      }

      void reply.code(201).send({ data: result.user });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message.includes("no longer valid")) {
        void reply.code(410).send({ error: "Invitation expired" });
        return;
      }
      request.log.error({ err: error }, "Failed to complete invitation");
      void reply.code(500).send({ error: "Failed to complete invitation" });
    }
  });

  const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  });

  app.post("/auth/login", async (request, reply) => {
    const body = loginSchema.safeParse(request.body);
    if (!body.success) {
      void reply.code(400).send({ error: "Invalid login payload" });
      return;
    }

    try {
      const session = await authService.authenticate(
        body.data.email,
        body.data.password
      );
      reply.setCookie(SESSION_COOKIE_NAME, session.token, cookieOptions);
      void reply.send({ data: session.user });
    } catch {
      void reply.code(401).send({ error: "Invalid credentials" });
    }
  });

  app.post("/auth/logout", async (request, reply) => {
    const currentSession = request.authSession;
    reply.clearCookie(SESSION_COOKIE_NAME, clearCookieOptions);
    if (currentSession) {
      await authService.logout(currentSession.id);
    }
    void reply.code(204).send();
  });

  app.get("/auth/me", async (request, reply) => {
    if (!request.user) {
      void reply.code(401).send({ error: "Unauthorized" });
      return;
    }
    void reply.send({ data: request.user });
  });

  const ensureAdmin = (
    request: FastifyRequest,
    reply: FastifyReply
  ): request is FastifyRequest & { user: SafeUser } => {
    if (!request.user || request.user.role !== "admin") {
      void reply.code(403).send({ error: "Admin access required" });
      return false;
    }
    return true;
  };

  app.post("/auth/invitations/inspect", async (request, reply) => {
    const body = invitationInspectSchema.safeParse(request.body);
    if (!body.success) {
      void reply.code(400).send({ error: "Invalid invitation token" });
      return;
    }
    const invitation = await authService.inspectInvitation(body.data.token);
    if (!invitation) {
      void reply.code(404).send({ error: "Invitation not found" });
      return;
    }
    void reply.send({ data: invitation });
  });

  app.get("/auth/users", async (request, reply) => {
    if (!ensureAdmin(request, reply)) {
      return;
    }
    const usersList = await authService.listUsers();
    void reply.send({ data: usersList });
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

  const kernelSessions = new InMemoryKernelSessionManager(store);
  const collaboration = new NotebookCollaborationService(store, collaborators);

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
      });
      await registerAiRoutes(api, { settings: settingsService });
      registerAttachmentRoutes(api, store, collaborators);
      registerNotebookRoutes(api, store, collaborators);
      registerNotebookSharingRoutes(api, { auth: authService });
      registerDependencyRoutes(api, store, collaborators);
      registerSessionRoutes(api, kernelSessions, store, collaborators);
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
  const authenticateUpgrade = async (req: IncomingMessage) => {
    const cookies = parseCookieHeader(req.headers.cookie);
    const token = cookies[SESSION_COOKIE_NAME];
    return authService.validateSession(token);
  };

  const kernelUpgrade = createKernelUpgradeHandler(
    "/api",
    kernelSessions,
    store,
    {
      authenticate: authenticateUpgrade,
    }
  );
  const terminalUpgrade = createTerminalUpgradeHandler("/api", store, {
    authenticate: authenticateUpgrade,
  });
  const collabUpgrade = collaboration.getUpgradeHandler(
    "/api",
    authenticateUpgrade
  );
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
        if (terminalUpgrade(req, socket, head)) {
          return;
        }
        if (collabUpgrade(req, socket, head)) {
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
  users: UserStore;
  authSessions: AuthSessionStore;
  invitations: InvitationStore;
  collaborators: NotebookCollaboratorStore;
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
        users: new InMemoryUserStore(),
        authSessions: new InMemoryAuthSessionStore(),
        invitations: new InMemoryInvitationStore(),
        collaborators: new InMemoryNotebookCollaboratorStore(),
        driver,
      };
    case "sqlite": {
      const sqliteStore = new SqliteNotebookStore({
        databaseFile: options.sqlitePath ?? config.persistence.sqlitePath,
      });
      return {
        store: sqliteStore,
        settings: new SqliteSettingsStore(sqliteStore),
        users: new SqliteUserStore(sqliteStore),
        authSessions: new SqliteAuthSessionStore(sqliteStore),
        invitations: new SqliteInvitationStore(sqliteStore),
        collaborators: new SqliteNotebookCollaboratorStore(sqliteStore),
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
        users: new PostgresUserStore(postgresStore),
        authSessions: new PostgresAuthSessionStore(postgresStore),
        invitations: new PostgresInvitationStore(postgresStore),
        collaborators: new PostgresNotebookCollaboratorStore(postgresStore),
        driver,
      };
    }
  }
};
