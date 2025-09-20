import Fastify from "fastify";
import websocket from "@fastify/websocket";
import cors from "@fastify/cors";
import { InMemoryNotebookStore, InMemorySessionManager } from "./store/memory.js";
import { registerNotebookRoutes } from "./routes/notebooks.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerKernelRoutes } from "./kernel/router.js";

export interface CreateServerOptions {
  logger?: boolean;
}

export const createServer = async ({ logger = true }: CreateServerOptions = {}) => {
  const app = Fastify({ logger });

  await app.register(cors, { origin: true });
  await app.register(websocket);

  const store = new InMemoryNotebookStore();
  const sessions = new InMemorySessionManager(store);

  app.get("/health", async () => ({ status: "ok" }));

  registerNotebookRoutes(app, store);
  registerSessionRoutes(app, sessions);
  registerKernelRoutes(app, sessions, store);

  return app;
};
