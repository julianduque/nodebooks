import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AuthService } from "../auth/service.js";
import { ensureAdmin } from "../notebooks/permissions.js";

interface RegisterNotebookSharingRoutesOptions {
  auth: AuthService;
}

const notebookParamsSchema = z.object({ notebookId: z.string().min(1) });
const invitationBodySchema = z.object({
  email: z.string().email(),
  role: z.enum(["editor", "viewer"]).default("viewer"),
});
const invitationParamsSchema = notebookParamsSchema.extend({
  invitationId: z.string().min(1),
});
const collaboratorParamsSchema = notebookParamsSchema.extend({
  userId: z.string().min(1),
});
const collaboratorUpdateSchema = z.object({
  role: z.enum(["editor", "viewer"]),
});

export const registerNotebookSharingRoutes = (
  app: FastifyInstance,
  options: RegisterNotebookSharingRoutesOptions
) => {
  app.get("/notebooks/:notebookId/sharing", async (request, reply) => {
    if (!ensureAdmin(request, reply)) {
      return;
    }
    const parsedParams = notebookParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      void reply.code(400).send({ error: "Invalid notebook id" });
      return;
    }
    const { notebookId } = parsedParams.data;
    const [collaborators, invitations] = await Promise.all([
      options.auth.listNotebookCollaborators(notebookId),
      options.auth.listNotebookInvitations(notebookId),
    ]);
    void reply.send({ data: { collaborators, invitations } });
  });

  app.post(
    "/notebooks/:notebookId/sharing/invitations",
    async (request, reply) => {
      if (!ensureAdmin(request, reply)) {
        return;
      }
      const parsedParams = notebookParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        void reply.code(400).send({ error: "Invalid notebook id" });
        return;
      }
      const parsedBody = invitationBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        void reply.code(400).send({ error: "Invalid invitation payload" });
        return;
      }
      const { notebookId } = parsedParams.data;
      const { email, role } = parsedBody.data;
      try {
        const existingUser = await options.auth.findUserByEmail(email);
        if (existingUser) {
          const collaborator = await options.auth.grantNotebookAccess({
            notebookId,
            userId: existingUser.id,
            role,
          });
          if (!collaborator) {
            void reply.code(500).send({ error: "Failed to add collaborator" });
            return;
          }
          void reply.code(200).send({
            data: {
              type: "collaborator" as const,
              collaborator,
            },
          });
          return;
        }
        const result = await options.auth.inviteToNotebook({
          email,
          notebookId,
          role,
          invitedBy: request.user.id,
        });
        void reply.code(201).send({
          data: {
            type: "invitation" as const,
            invitation: result.invitation,
            token: result.token,
          },
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        if (message.includes("already exists")) {
          void reply.code(409).send({ error: message });
          return;
        }
        void reply
          .code(500)
          .send({ error: "Failed to create notebook invitation" });
      }
    }
  );

  app.post(
    "/notebooks/:notebookId/sharing/invitations/:invitationId/revoke",
    async (request, reply) => {
      if (!ensureAdmin(request, reply)) {
        return;
      }
      const parsedParams = invitationParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        void reply.code(400).send({ error: "Invalid invitation id" });
        return;
      }
      const { notebookId, invitationId } = parsedParams.data;
      const revoked = await options.auth.revokeInvitation(invitationId);
      if (!revoked || revoked.notebookId !== notebookId) {
        void reply.code(404).send({ error: "Invitation not found" });
        return;
      }
      void reply.send({ data: revoked });
    }
  );

  app.patch(
    "/notebooks/:notebookId/sharing/collaborators/:userId",
    async (request, reply) => {
      if (!ensureAdmin(request, reply)) {
        return;
      }
      const parsedParams = collaboratorParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        void reply.code(400).send({ error: "Invalid collaborator parameters" });
        return;
      }
      const parsedBody = collaboratorUpdateSchema.safeParse(request.body);
      if (!parsedBody.success) {
        void reply
          .code(400)
          .send({ error: "Invalid collaborator update payload" });
        return;
      }
      const { notebookId, userId } = parsedParams.data;
      const { role } = parsedBody.data;
      const updated = await options.auth.updateNotebookCollaboratorRole({
        notebookId,
        userId,
        role,
      });
      if (!updated) {
        void reply.code(404).send({ error: "Collaborator not found" });
        return;
      }
      void reply.send({ data: updated });
    }
  );

  app.delete(
    "/notebooks/:notebookId/sharing/collaborators/:userId",
    async (request, reply) => {
      if (!ensureAdmin(request, reply)) {
        return;
      }
      const parsedParams = collaboratorParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        void reply.code(400).send({ error: "Invalid collaborator parameters" });
        return;
      }
      const { notebookId, userId } = parsedParams.data;
      const removed = await options.auth.removeNotebookCollaborator(
        notebookId,
        userId
      );
      if (!removed) {
        void reply.code(404).send({ error: "Collaborator not found" });
        return;
      }
      void reply.code(204).send();
    }
  );
};

export type RegisterNotebookSharingRoutes =
  typeof registerNotebookSharingRoutes;
