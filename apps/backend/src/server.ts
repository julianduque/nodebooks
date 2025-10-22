import Fastify from "fastify";
import type {
  FastifyReply,
  FastifyRequest,
  FastifyServerOptions,
} from "fastify";
import cors from "@fastify/cors";
import fastifyCookie from "@fastify/cookie";
import type * as FastifyCookieNamespace from "@fastify/cookie";
import next from "next";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { InMemorySessionManager as InMemoryKernelSessionManager } from "./store/memory.js";
import type { SafeUser, AuthSession } from "./types.js";
import { registerNotebookRoutes } from "./routes/notebooks.js";
import { registerDependencyRoutes } from "./routes/dependencies.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerTemplateRoutes } from "./routes/templates.js";
import { registerTypesRoutes } from "./routes/types.js";
import { registerAiRoutes } from "./routes/ai.js";
import { registerAttachmentRoutes } from "./routes/attachments.js";
import { registerNotebookSharingRoutes } from "./routes/notebook-sharing.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerPublicViewRoutes } from "./routes/public.js";
import { registerProjectSharingRoutes } from "./routes/project-sharing.js";
import { registerHttpRoutes } from "./routes/http.js";
import { registerSqlRoutes } from "./routes/sql.js";
import { createKernelUpgradeHandler } from "./kernel/router.js";
import { createTerminalUpgradeHandler } from "./terminal/router.js";
import { NotebookCollaborationService } from "./notebooks/collaboration.js";
import {
  AuthService,
  CannotRemoveLastAdminError,
  CannotRemoveSelfError,
  InvalidCurrentPasswordError,
} from "./auth/service.js";
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE_MS,
  parseCookieHeader,
} from "./auth/session.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { loadServerConfig } from "@nodebooks/config";
import { SettingsService } from "./settings/service.js";
import { setSettingsService } from "./settings/index.js";
import { createNotebookStore } from "./store/factory.js";

export { createNotebookStore } from "./store/factory.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: SafeUser;
    authSession?: AuthSession;
  }
}

type LoggerOption = FastifyServerOptions["logger"];

const resolveLoggerOption = (
  provided: LoggerOption | undefined
): LoggerOption => {
  if (provided !== undefined) {
    return provided;
  }
  const envLevel = process.env.NODEBOOKS_LOG_LEVEL;
  if (!envLevel) {
    return true;
  }
  const normalized = envLevel.trim().toLowerCase();
  if (["false", "off", "none", "silent"].includes(normalized)) {
    return false;
  }
  return { level: normalized } satisfies LoggerOption;
};

export interface CreateServerOptions {
  logger?: LoggerOption;
}

export const createServer = async ({ logger }: CreateServerOptions = {}) => {
  const baseConfig = loadServerConfig();
  const {
    store,
    settings,
    driver,
    users,
    authSessions,
    invitations,
    collaborators,
    projects,
    projectInvitations,
    projectCollaborators,
  } = createNotebookStore({}, baseConfig);
  const settingsService = new SettingsService(settings);
  await settingsService.whenReady();
  setSettingsService(settingsService);

  const cfg = loadServerConfig(undefined, settingsService.getSettings());
  const isDev = cfg.isDev;
  const app = Fastify({
    logger: resolveLoggerOption(logger),
    pluginTimeout: isDev ? 120_000 : undefined,
  });

  if (cfg.terminalCellsEnabled) {
    app.log.warn(
      "Terminal cells are enabled. Terminal sessions run unsandboxed as the NodeBooks host user."
    );
  }

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
    collaborators,
    projects,
    projectInvitations,
    projectCollaborators,
    store
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
    if (url === "/api/public" || url.startsWith("/api/public/")) {
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
    if (url === "/v" || url.startsWith("/v/")) {
      return true;
    }
    if (url.startsWith("/_next/data") && url.includes("/v/")) {
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
    email: z.email(),
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
    email: z.email(),
    password: z.string().min(1),
  });

  const passwordUpdateSchema = z.object({
    currentPassword: z.string().min(8),
    newPassword: z.string().min(8),
  });

  const deleteUserParamsSchema = z.object({
    id: z.string().min(1),
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

  app.patch("/auth/password", async (request, reply) => {
    if (!request.user) {
      void reply.code(401).send({ error: "Unauthorized" });
      return;
    }
    const body = passwordUpdateSchema.safeParse(request.body);
    if (!body.success) {
      void reply.code(400).send({ error: "Invalid password payload" });
      return;
    }

    try {
      const session = await authService.updatePassword({
        userId: request.user.id,
        currentPassword: body.data.currentPassword,
        newPassword: body.data.newPassword,
      });
      reply.setCookie(SESSION_COOKIE_NAME, session.token, cookieOptions);
      void reply.send({ data: session.user });
    } catch (error) {
      if (error instanceof InvalidCurrentPasswordError) {
        void reply.code(400).send({ error: "Current password is incorrect" });
        return;
      }
      const message = error instanceof Error ? error.message : "Unknown";
      if (message.includes("New password must be different")) {
        void reply.code(400).send({ error: "Choose a different password" });
        return;
      }
      if (message.includes("User not found")) {
        void reply.code(404).send({ error: "User not found" });
        return;
      }
      request.log.error({ err: error }, "Failed to update password");
      void reply.code(500).send({ error: "Failed to update password" });
    }
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

  app.delete("/auth/users/:id", async (request, reply) => {
    if (!ensureAdmin(request, reply)) {
      return;
    }
    const params = deleteUserParamsSchema.safeParse(request.params);
    if (!params.success) {
      void reply.code(400).send({ error: "Invalid user id" });
      return;
    }

    try {
      await authService.removeUser(request.user.id, params.data.id);
      void reply.code(204).send();
    } catch (error) {
      if (error instanceof CannotRemoveSelfError) {
        void reply
          .code(400)
          .send({ error: "You cannot remove your own account" });
        return;
      }
      if (error instanceof CannotRemoveLastAdminError) {
        void reply
          .code(409)
          .send({ error: "At least one admin must remain in the workspace" });
        return;
      }
      const message = error instanceof Error ? error.message : "Unknown";
      if (message.includes("User not found")) {
        void reply.code(404).send({ error: "User not found" });
        return;
      }
      request.log.error({ err: error }, "Failed to remove user");
      void reply.code(500).send({ error: "Failed to remove user" });
    }
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
    const embeddedClientDir = path.resolve(__dirname, "..", "client");
    const workspaceClientDir = path.resolve(__dirname, "../../client");
    let uiDir = workspaceClientDir;
    try {
      await fs.access(workspaceClientDir);
    } catch {
      try {
        await fs.access(embeddedClientDir);
        uiDir = embeddedClientDir;
      } catch {
        // Neither workspace nor embedded client is available; keep default.
      }
    }

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
      registerProjectRoutes(api, {
        store,
        projects,
        projectCollaborators,
        projectInvitations,
        collaborators,
      });
      registerPublicViewRoutes(api, { store, projects });
      registerNotebookSharingRoutes(api, { auth: authService });
      registerProjectSharingRoutes(api, { auth: authService });
      registerHttpRoutes(api, store, collaborators);
      registerSqlRoutes(api, store, collaborators);
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
