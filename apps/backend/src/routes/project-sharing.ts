import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AuthService } from "../auth/service.js";
import { ensureAdmin } from "../notebooks/permissions.js";

interface RegisterProjectSharingRoutesOptions {
  auth: AuthService;
}

const projectParamsSchema = z.object({ projectId: z.string().min(1) });
const invitationBodySchema = z.object({
  email: z.string().email(),
  role: z.enum(["editor", "viewer"]).default("viewer"),
});
const invitationParamsSchema = projectParamsSchema.extend({
  invitationId: z.string().min(1),
});
const collaboratorParamsSchema = projectParamsSchema.extend({
  userId: z.string().min(1),
});
const collaboratorUpdateSchema = z.object({
  role: z.enum(["editor", "viewer"]),
});

export const registerProjectSharingRoutes = (
  app: FastifyInstance,
  options: RegisterProjectSharingRoutesOptions
) => {
  app.get("/projects/:projectId/sharing", async (request, reply) => {
    if (!ensureAdmin(request, reply)) {
      return;
    }
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) {
      void reply.code(400).send({ error: "Invalid project id" });
      return;
    }
    const { projectId } = params.data;
    const [collaborators, invitations] = await Promise.all([
      options.auth.listProjectCollaborators(projectId),
      options.auth.listProjectInvitations(projectId),
    ]);
    void reply.send({ data: { collaborators, invitations } });
  });

  app.post(
    "/projects/:projectId/sharing/invitations",
    async (request, reply) => {
      if (!ensureAdmin(request, reply)) {
        return;
      }
      const params = projectParamsSchema.safeParse(request.params);
      if (!params.success) {
        void reply.code(400).send({ error: "Invalid project id" });
        return;
      }
      const body = invitationBodySchema.safeParse(request.body ?? {});
      if (!body.success) {
        void reply.code(400).send({ error: "Invalid invitation payload" });
        return;
      }
      const { projectId } = params.data;
      const { email, role } = body.data;
      try {
        const existingUser = await options.auth.findUserByEmail(email);
        if (existingUser) {
          const collaborator = await options.auth.grantProjectAccess({
            projectId,
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
        const result = await options.auth.inviteToProject({
          email,
          projectId,
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
          .send({ error: "Failed to create project invitation" });
      }
    }
  );

  app.post(
    "/projects/:projectId/sharing/invitations/:invitationId/revoke",
    async (request, reply) => {
      if (!ensureAdmin(request, reply)) {
        return;
      }
      const params = invitationParamsSchema.safeParse(request.params);
      if (!params.success) {
        void reply.code(400).send({ error: "Invalid invitation id" });
        return;
      }
      const { projectId, invitationId } = params.data;
      const revoked = await options.auth.revokeProjectInvitation(invitationId);
      if (!revoked || revoked.projectId !== projectId) {
        void reply.code(404).send({ error: "Invitation not found" });
        return;
      }
      void reply.send({ data: revoked });
    }
  );

  app.patch(
    "/projects/:projectId/sharing/collaborators/:userId",
    async (request, reply) => {
      if (!ensureAdmin(request, reply)) {
        return;
      }
      const params = collaboratorParamsSchema.safeParse(request.params);
      if (!params.success) {
        void reply.code(400).send({ error: "Invalid collaborator parameters" });
        return;
      }
      const body = collaboratorUpdateSchema.safeParse(request.body ?? {});
      if (!body.success) {
        void reply
          .code(400)
          .send({ error: "Invalid collaborator update payload" });
        return;
      }
      const { projectId, userId } = params.data;
      const { role } = body.data;
      const updated = await options.auth.updateProjectCollaboratorRole({
        projectId,
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
    "/projects/:projectId/sharing/collaborators/:userId",
    async (request, reply) => {
      if (!ensureAdmin(request, reply)) {
        return;
      }
      const params = collaboratorParamsSchema.safeParse(request.params);
      if (!params.success) {
        void reply.code(400).send({ error: "Invalid collaborator parameters" });
        return;
      }
      const { projectId, userId } = params.data;
      const removed = await options.auth.removeProjectCollaborator(
        projectId,
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
