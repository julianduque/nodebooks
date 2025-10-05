import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type {
  NotebookCollaboratorStore,
  NotebookStore,
  SessionManager,
} from "../types.js";
import { ensureNotebookAccess } from "../notebooks/permissions.js";

export const registerSessionRoutes = (
  app: FastifyInstance,
  sessions: SessionManager,
  store: NotebookStore,
  collaborators: NotebookCollaboratorStore
) => {
  app.get("/notebooks/:id/sessions", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    if (
      !(await ensureNotebookAccess(
        request,
        reply,
        collaborators,
        params.id,
        "viewer"
      ))
    ) {
      return;
    }

    const data = await sessions.listSessions(params.id);
    if (data.length === 0) {
      reply.code(204);
      return null;
    }

    return { data };
  });

  app.post("/notebooks/:id/sessions", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    if (
      !(await ensureNotebookAccess(
        request,
        reply,
        collaborators,
        params.id,
        "editor"
      ))
    ) {
      return;
    }

    const notebook = await store.get(params.id);
    if (!notebook) {
      reply.code(404);
      return { error: "Notebook not found" };
    }

    try {
      const session = await sessions.createSession(params.id);
      reply.code(201);
      return { data: session };
    } catch (error) {
      void error;
      reply.code(500);
      return { error: "Failed to create session" };
    }
  });

  app.delete("/sessions/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const allSessions = await sessions.listSessions();
    const target = allSessions.find((session) => session.id === params.id);
    if (!target) {
      reply.code(404);
      return { error: "Session not found" };
    }

    if (
      !(await ensureNotebookAccess(
        request,
        reply,
        collaborators,
        target.notebookId,
        "editor"
      ))
    ) {
      return;
    }

    const session = await sessions.closeSession(params.id);
    if (!session) {
      reply.code(404);
      return { error: "Session not found" };
    }

    return { data: session };
  });
};
