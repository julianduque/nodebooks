import type { FastifyReply, FastifyRequest } from "fastify";

import type {
  NotebookCollaboratorStore,
  NotebookRole,
  SafeUser,
} from "../types.js";

const ROLE_RANK: Record<NotebookRole, number> = {
  viewer: 0,
  editor: 1,
};

export const ensureAuthenticated = (
  request: FastifyRequest,
  reply: FastifyReply
): request is FastifyRequest & { user: SafeUser } => {
  if (!request.user) {
    void reply.code(401).send({ error: "Unauthorized" });
    return false;
  }
  return true;
};

export const ensureAdmin = (
  request: FastifyRequest,
  reply: FastifyReply
): request is FastifyRequest & { user: SafeUser } => {
  if (!ensureAuthenticated(request, reply)) {
    return false;
  }
  if (request.user.role !== "admin") {
    void reply.code(403).send({ error: "Admin access required" });
    return false;
  }
  return true;
};

export const ensureNotebookAccess = async (
  request: FastifyRequest,
  reply: FastifyReply,
  collaborators: NotebookCollaboratorStore,
  notebookId: string,
  requiredRole: NotebookRole
): Promise<NotebookRole | null> => {
  if (!ensureAuthenticated(request, reply)) {
    return null;
  }

  if (request.user.role === "admin") {
    return "editor";
  }

  const collaborator = await collaborators.get(notebookId, request.user.id);
  if (!collaborator) {
    void reply.code(403).send({ error: "Notebook access denied" });
    return null;
  }

  if (ROLE_RANK[collaborator.role] < ROLE_RANK[requiredRole]) {
    void reply
      .code(403)
      .send({ error: "Notebook permission level is insufficient" });
    return null;
  }

  return collaborator.role;
};

export const toNotebookAccessRole = (
  role: NotebookRole | null,
  isAdmin: boolean
): NotebookRole => {
  if (isAdmin) {
    return "editor";
  }
  return role ?? "viewer";
};

export const NOTEBOOK_ROLE_RANK = ROLE_RANK;
