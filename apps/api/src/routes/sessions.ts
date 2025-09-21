import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { SessionManager } from "../types.js";

export const registerSessionRoutes = (
  app: FastifyInstance,
  sessions: SessionManager
) => {
  app.get("/notebooks/:id/sessions", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const data = await sessions.listSessions(params.id);
    if (data.length === 0) {
      reply.code(204);
      return null;
    }

    return { data };
  });

  app.post("/notebooks/:id/sessions", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const session = await sessions.createSession(params.id);
    reply.code(201);
    return { data: session };
  });

  app.delete("/sessions/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const session = await sessions.closeSession(params.id);
    if (!session) {
      reply.code(404);
      return { error: "Session not found" };
    }

    return { data: session };
  });
};
