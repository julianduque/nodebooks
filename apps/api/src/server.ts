import Fastify from "fastify";
import websocket from "@fastify/websocket";
import cors from "@fastify/cors";
import {
  createCodeCell,
  createEmptyNotebook,
  createMarkdownCell,
} from "@nodebooks/notebook-schema";
import { InMemorySessionManager } from "./store/memory.js";
import { SqliteNotebookStore } from "./store/sqlite.js";
import { registerNotebookRoutes } from "./routes/notebooks.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerKernelRoutes } from "./kernel/router.js";

export interface CreateServerOptions {
  logger?: boolean;
}

export const createServer = async ({ logger = true }: CreateServerOptions = {}) => {
  const app = Fastify({ logger });

  await app.register(cors, {
    origin: true,
    methods: ["OPTIONS", "GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Accept", "Authorization"],
  });
  await app.register(websocket);

  const store = new SqliteNotebookStore({
    databaseFile: process.env.NODEBOOKS_SQLITE_PATH,
  });
  const existing = await store.all();
  if (existing.length === 0) {
    await store.save(
      createEmptyNotebook({
        name: "Welcome to NodeBooks",
        cells: [
          createMarkdownCell({
            source:
              "# Welcome to NodeBooks\nCreate, edit, and run JavaScript or TypeScript notebooks right from your browser.",
          }),
          createCodeCell({
            language: "ts",
            source: "const answer: number = 21 * 2;\nconsole.log('The answer is', answer);\nanswer;",
          }),
        ],
      }),
    );
  }
  const sessions = new InMemorySessionManager(store);

  app.get("/health", async () => ({ status: "ok" }));

  registerNotebookRoutes(app, store);
  registerSessionRoutes(app, sessions);
  registerKernelRoutes(app, sessions, store);

  return app;
};
