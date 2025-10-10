import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  ensureAuthenticated,
  ensureAdmin,
  NOTEBOOK_ROLE_RANK,
} from "../notebooks/permissions.js";
import {
  ensureNotebookRuntimeVersion,
  SLUG_MAX_LENGTH,
  type Notebook,
} from "@nodebooks/notebook-schema";
import type {
  NotebookStore,
  NotebookCollaboratorStore,
  ProjectStore,
  ProjectCollaboratorStore,
  ProjectInvitationStore,
  NotebookRole,
} from "../types.js";
import {
  generateUniqueNotebookSlug,
  normalizeRequestedSlug,
} from "../notebooks/slug.js";

const CREATE_PROJECT_SCHEMA = z.object({
  name: z.string().min(1).max(200),
});

const UPDATE_PROJECT_SCHEMA = z.object({
  name: z.string().min(1).max(200),
});

const REORDER_SCHEMA = z.object({
  notebookIds: z.array(z.string()).nonempty(),
});

const ASSIGN_SCHEMA = z.object({
  notebookId: z.string().min(1),
  order: z.number().int().nonnegative().optional(),
});

const UNASSIGNED_SLUG = "unassigned";

const ProjectPublishSchema = z
  .object({
    slug: z.string().min(1).max(SLUG_MAX_LENGTH).optional().nullable(),
  })
  .partial();

const isUniqueConstraintViolation = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = (error as { code?: string | number }).code;
  if (
    code === "SQLITE_CONSTRAINT" ||
    code === "SQLITE_CONSTRAINT_UNIQUE" ||
    code === "23505"
  ) {
    return true;
  }
  const message = String((error as { message?: unknown }).message ?? "");
  return (
    message.includes("UNIQUE constraint failed") ||
    message.includes("duplicate key") ||
    message.includes("UNIQUE violation")
  );
};

type NotebookWithAccess = Notebook & { accessRole: NotebookRole };

const withAccess = (
  notebook: Notebook,
  role: NotebookRole
): NotebookWithAccess => ({
  ...ensureNotebookRuntimeVersion(notebook),
  accessRole: role,
});

const compareByProjectOrder = (a: Notebook, b: Notebook) => {
  const orderA = a.projectOrder ?? Number.POSITIVE_INFINITY;
  const orderB = b.projectOrder ?? Number.POSITIVE_INFINITY;
  if (orderA !== orderB) {
    return orderA - orderB;
  }
  return a.name.localeCompare(b.name);
};

const resolveProjectId = (value: string): string | null => {
  return value === UNASSIGNED_SLUG ? null : value;
};

interface RegisterProjectRoutesOptions {
  store: NotebookStore;
  projects: ProjectStore;
  projectCollaborators: ProjectCollaboratorStore;
  projectInvitations: ProjectInvitationStore;
  collaborators: NotebookCollaboratorStore;
}

const maxRole = (
  current: NotebookRole | null,
  incoming: NotebookRole
): NotebookRole => {
  if (!current) {
    return incoming;
  }
  return NOTEBOOK_ROLE_RANK[current] >= NOTEBOOK_ROLE_RANK[incoming]
    ? current
    : incoming;
};

export const registerProjectRoutes = (
  app: FastifyInstance,
  options: RegisterProjectRoutesOptions
) => {
  app.get("/projects", async (request, reply) => {
    if (!ensureAuthenticated(request, reply)) {
      return;
    }

    const [allNotebooks, allProjects] = await Promise.all([
      options.store.all(),
      options.projects.list(),
    ]);

    let notebooks: NotebookWithAccess[] = [];
    if (request.user.role === "admin") {
      notebooks = allNotebooks.map((nb) => withAccess(nb, "editor"));
    } else {
      const collaborations = await options.collaborators.listForUser(
        request.user.id
      );
      const allowedIds = new Set(collaborations.map((c) => c.notebookId));
      const roleByNotebook = new Map(
        collaborations.map((c) => [c.notebookId, c.role])
      );
      notebooks = allNotebooks
        .filter((nb) => allowedIds.has(nb.id))
        .map((nb) => withAccess(nb, roleByNotebook.get(nb.id) ?? "viewer"));
    }

    const projectLookup = new Map(
      allProjects.map((project) => [
        project.id,
        { project, notebooks: [] as NotebookWithAccess[] },
      ])
    );

    const unassigned: NotebookWithAccess[] = [];
    for (const notebook of notebooks) {
      const projectId = notebook.projectId;
      if (projectId && projectLookup.has(projectId)) {
        projectLookup.get(projectId)!.notebooks.push(notebook);
      } else if (projectId) {
        // Project reference might be stale; ignore but keep notebook unassigned for client visibility.
        unassigned.push({ ...notebook, projectId: null, projectOrder: null });
      } else {
        unassigned.push(notebook);
      }
    }

    if (request.user.role !== "admin") {
      const projectIds =
        await options.projectCollaborators.listProjectIdsForUser(
          request.user.id
        );
      for (const projectId of projectIds) {
        if (!projectLookup.has(projectId)) {
          const project = allProjects.find((p) => p.id === projectId);
          if (project) {
            projectLookup.set(projectId, {
              project,
              notebooks: [],
            });
          }
        }
      }
    }

    const projects = Array.from(projectLookup.values()).map(
      ({ project, notebooks: projectNotebooks }) => ({
        project,
        notebooks: projectNotebooks.sort(compareByProjectOrder),
      })
    );

    unassigned.sort(compareByProjectOrder);

    void reply.send({
      data: {
        projects,
        unassignedNotebooks: unassigned,
      },
    });
  });

  app.get("/projects/:projectId", async (request, reply) => {
    if (!ensureAuthenticated(request, reply)) {
      return;
    }
    const params = z
      .object({ projectId: z.string().min(1) })
      .safeParse(request.params);
    if (!params.success) {
      void reply.code(400).send({ error: "Invalid project id" });
      return;
    }
    const project = await options.projects.get(params.data.projectId);
    if (!project) {
      void reply.code(404).send({ error: "Project not found" });
      return;
    }

    const notebooksInProject = (await options.store.all()).filter(
      (nb) => nb.projectId === project.id
    );

    if (request.user.role === "admin") {
      const enriched = notebooksInProject.map((nb) => withAccess(nb, "editor"));
      void reply.send({ data: { project, notebooks: enriched } });
      return;
    }

    const collaborations = await options.collaborators.listForUser(
      request.user.id
    );
    const allowedIds = new Set(collaborations.map((c) => c.notebookId));
    const roleByNotebook = new Map(
      collaborations.map((c) => [c.notebookId, c.role])
    );

    const filtered = notebooksInProject.filter((nb) => allowedIds.has(nb.id));
    const enriched = filtered.map((nb) =>
      withAccess(nb, roleByNotebook.get(nb.id) ?? "viewer")
    );

    void reply.send({ data: { project, notebooks: enriched } });
  });

  app.post("/projects", async (request, reply) => {
    if (!ensureAdmin(request, reply)) {
      return;
    }
    const body = CREATE_PROJECT_SCHEMA.safeParse(request.body);
    if (!body.success) {
      void reply.code(400).send({ error: "Invalid project payload" });
      return;
    }
    const created = await options.projects.create({
      name: body.data.name.trim(),
    });
    void reply.code(201).send({ data: created });
  });

  app.patch("/projects/:projectId", async (request, reply) => {
    if (!ensureAdmin(request, reply)) {
      return;
    }
    const params = z
      .object({ projectId: z.string().min(1) })
      .safeParse(request.params);
    if (!params.success) {
      void reply.code(400).send({ error: "Invalid project id" });
      return;
    }
    const body = UPDATE_PROJECT_SCHEMA.safeParse(request.body ?? {});
    if (!body.success) {
      void reply.code(400).send({ error: "Invalid project payload" });
      return;
    }
    try {
      const updated = await options.projects.update(params.data.projectId, {
        name: body.data.name?.trim(),
      });
      void reply.send({ data: updated });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message.includes("not found")) {
        void reply.code(404).send({ error: "Project not found" });
        return;
      }
      throw error;
    }
  });

  app.post("/projects/:projectId/publish", async (request, reply) => {
    if (!ensureAdmin(request, reply)) {
      return;
    }

    const params = z
      .object({ projectId: z.string().min(1) })
      .safeParse(request.params);
    if (!params.success) {
      void reply.code(400).send({ error: "Invalid project id" });
      return;
    }

    const body = ProjectPublishSchema.parse(request.body ?? {});
    const project = await options.projects.get(params.data.projectId);
    if (!project) {
      void reply.code(404).send({ error: "Project not found" });
      return;
    }

    let slugUpdate: string | null | undefined;
    if (body.slug !== undefined) {
      if (body.slug === null) {
        slugUpdate = null;
      } else {
        slugUpdate = normalizeRequestedSlug(body.slug) ?? null;
      }
    } else if (!project.slug) {
      slugUpdate = null;
    }

    if (typeof slugUpdate === "string") {
      const conflict = await options.projects.getBySlug(slugUpdate);
      if (conflict && conflict.id !== project.id) {
        void reply.code(409).send({ error: "Project slug already in use" });
        return;
      }
    }

    const notebooks = (await options.store.all()).filter(
      (nb) => nb.projectId === project.id
    );

    const reservedSlugs = new Set<string>();
    const updatedNotebooks: Notebook[] = [];

    try {
      for (const notebook of notebooks) {
        const slug = await generateUniqueNotebookSlug(
          options.store,
          notebook,
          notebook.publicSlug ?? null,
          reservedSlugs
        );
        const updated = await options.store.save({
          ...ensureNotebookRuntimeVersion(notebook),
          published: true,
          publicSlug: slug,
        });
        updatedNotebooks.push(updated);
      }
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        void reply.code(409).send({ error: "Notebook slug already in use" });
        return;
      }
      throw error;
    }

    let updatedProject;
    try {
      updatedProject = await options.projects.update(project.id, {
        published: true,
        ...(slugUpdate !== undefined ? { slug: slugUpdate } : {}),
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        void reply.code(409).send({ error: "Project slug already in use" });
        return;
      }
      throw error;
    }

    const notebooksWithAccess = updatedNotebooks
      .map((nb) => withAccess(nb, "editor"))
      .sort(compareByProjectOrder);

    void reply.send({
      data: {
        project: updatedProject,
        notebooks: notebooksWithAccess,
      },
    });
  });

  app.post("/projects/:projectId/unpublish", async (request, reply) => {
    if (!ensureAdmin(request, reply)) {
      return;
    }

    const params = z
      .object({ projectId: z.string().min(1) })
      .safeParse(request.params);
    if (!params.success) {
      void reply.code(400).send({ error: "Invalid project id" });
      return;
    }

    const body = ProjectPublishSchema.parse(request.body ?? {});
    const project = await options.projects.get(params.data.projectId);
    if (!project) {
      void reply.code(404).send({ error: "Project not found" });
      return;
    }

    let slugUpdate: string | null | undefined;
    if (body.slug !== undefined) {
      if (body.slug === null) {
        slugUpdate = null;
      } else {
        slugUpdate = normalizeRequestedSlug(body.slug) ?? null;
      }
    }

    if (typeof slugUpdate === "string") {
      const conflict = await options.projects.getBySlug(slugUpdate);
      if (conflict && conflict.id !== project.id) {
        void reply.code(409).send({ error: "Project slug already in use" });
        return;
      }
    }

    const notebooks = (await options.store.all()).filter(
      (nb) => nb.projectId === project.id
    );

    const updatedNotebooks: Notebook[] = [];
    try {
      for (const notebook of notebooks) {
        const updated = await options.store.save({
          ...ensureNotebookRuntimeVersion(notebook),
          published: false,
        });
        updatedNotebooks.push(updated);
      }
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        void reply.code(409).send({ error: "Notebook slug already in use" });
        return;
      }
      throw error;
    }

    let updatedProject;
    try {
      updatedProject = await options.projects.update(project.id, {
        published: false,
        ...(slugUpdate !== undefined ? { slug: slugUpdate } : {}),
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        void reply.code(409).send({ error: "Project slug already in use" });
        return;
      }
      throw error;
    }

    const notebooksWithAccess = updatedNotebooks
      .map((nb) => withAccess(nb, "editor"))
      .sort(compareByProjectOrder);

    void reply.send({
      data: {
        project: updatedProject,
        notebooks: notebooksWithAccess,
      },
    });
  });

  app.delete("/projects/:projectId", async (request, reply) => {
    if (!ensureAdmin(request, reply)) {
      return;
    }
    const params = z
      .object({ projectId: z.string().min(1) })
      .safeParse(request.params);
    if (!params.success) {
      void reply.code(400).send({ error: "Invalid project id" });
      return;
    }
    const projectId = params.data.projectId;
    const project = await options.projects.get(projectId);
    if (!project) {
      void reply.code(404).send({ error: "Project not found" });
      return;
    }

    const notebooks = await options.store.all();
    const toClear = notebooks.filter((nb) => nb.projectId === projectId);
    for (const notebook of toClear) {
      await options.store.save({
        ...ensureNotebookRuntimeVersion(notebook),
        projectId: null,
        projectOrder: null,
      });
      const collaborators =
        await options.projectCollaborators.listByProject(projectId);
      for (const collaborator of collaborators) {
        await options.collaborators.remove(notebook.id, collaborator.userId);
      }
    }

    await options.projectCollaborators.removeAllForProject(projectId);
    const invitations =
      await options.projectInvitations.listByProject(projectId);
    for (const invitation of invitations) {
      if (!invitation.revokedAt) {
        await options.projectInvitations.revoke(invitation.id);
      }
    }

    await options.projects.remove(projectId);
    void reply.code(204).send();
  });

  app.post("/projects/:projectId/reorder", async (request, reply) => {
    if (!ensureAuthenticated(request, reply)) {
      return;
    }
    if (request.user.role !== "admin") {
      void reply.code(403).send({ error: "Admin access required" });
      return;
    }

    const params = z
      .object({ projectId: z.string().min(1) })
      .safeParse(request.params);
    if (!params.success) {
      void reply.code(400).send({ error: "Invalid project id" });
      return;
    }
    const body = REORDER_SCHEMA.safeParse(request.body ?? {});
    if (!body.success) {
      void reply.code(400).send({ error: "Invalid reorder payload" });
      return;
    }
    const targetProjectId = resolveProjectId(params.data.projectId);

    const notebooksById = new Map<string, Notebook>();
    for (const notebook of await options.store.all()) {
      notebooksById.set(notebook.id, notebook);
    }

    await Promise.all(
      body.data.notebookIds.map(async (id, index) => {
        const notebook = notebooksById.get(id);
        if (!notebook) {
          throw new Error(`Notebook ${id} not found`);
        }
        const previousProjectId = notebook.projectId;
        const updated = ensureNotebookRuntimeVersion({
          ...notebook,
          projectId: targetProjectId,
          projectOrder: index,
        });
        await options.store.save(updated);

        if (previousProjectId && previousProjectId !== targetProjectId) {
          const previousCollaborators =
            await options.projectCollaborators.listByProject(previousProjectId);
          for (const collaborator of previousCollaborators) {
            await options.collaborators.remove(id, collaborator.userId);
          }
        }

        if (targetProjectId) {
          const newCollaborators =
            await options.projectCollaborators.listByProject(targetProjectId);
          for (const collaborator of newCollaborators) {
            const existing = await options.collaborators.get(
              id,
              collaborator.userId
            );
            const desiredRole = maxRole(
              existing?.role ?? null,
              collaborator.role
            );
            await options.collaborators.upsert({
              notebookId: id,
              userId: collaborator.userId,
              role: desiredRole,
            });
          }
        }
      })
    );

    void reply.code(204).send();
  });

  app.post("/projects/:projectId/notebooks", async (request, reply) => {
    if (!ensureAuthenticated(request, reply)) {
      return;
    }
    if (request.user.role !== "admin") {
      void reply.code(403).send({ error: "Admin access required" });
      return;
    }
    const params = z
      .object({ projectId: z.string().min(1) })
      .safeParse(request.params);
    if (!params.success) {
      void reply.code(400).send({ error: "Invalid project id" });
      return;
    }
    const body = ASSIGN_SCHEMA.safeParse(request.body ?? {});
    if (!body.success) {
      void reply.code(400).send({ error: "Invalid assignment payload" });
      return;
    }
    const targetProjectId = resolveProjectId(params.data.projectId);
    const notebook = await options.store.get(body.data.notebookId);
    if (!notebook) {
      void reply.code(404).send({ error: "Notebook not found" });
      return;
    }

    const previousProjectId = notebook.projectId;
    const order = body.data.order ?? 0;
    const updated = ensureNotebookRuntimeVersion({
      ...notebook,
      projectId: targetProjectId,
      projectOrder: order,
    });
    await options.store.save(updated);

    if (previousProjectId && previousProjectId !== targetProjectId) {
      const previousCollaborators =
        await options.projectCollaborators.listByProject(previousProjectId);
      for (const collaborator of previousCollaborators) {
        await options.collaborators.remove(notebook.id, collaborator.userId);
      }
    }

    if (targetProjectId) {
      const collaborators =
        await options.projectCollaborators.listByProject(targetProjectId);
      for (const collaborator of collaborators) {
        const existing = await options.collaborators.get(
          notebook.id,
          collaborator.userId
        );
        const desiredRole = maxRole(existing?.role ?? null, collaborator.role);
        await options.collaborators.upsert({
          notebookId: notebook.id,
          userId: collaborator.userId,
          role: desiredRole,
        });
      }
    }

    void reply.send({
      data: ensureNotebookRuntimeVersion(updated),
    });
  });

  app.delete(
    "/projects/:projectId/notebooks/:notebookId",
    async (request, reply) => {
      if (!ensureAuthenticated(request, reply)) {
        return;
      }
      if (request.user.role !== "admin") {
        void reply.code(403).send({ error: "Admin access required" });
        return;
      }
      const params = z
        .object({
          projectId: z.string().min(1),
          notebookId: z.string().min(1),
        })
        .safeParse(request.params);
      if (!params.success) {
        void reply.code(400).send({ error: "Invalid parameters" });
        return;
      }
      const targetProjectId = resolveProjectId(params.data.projectId);
      const notebook = await options.store.get(params.data.notebookId);
      if (!notebook) {
        void reply.code(404).send({ error: "Notebook not found" });
        return;
      }
      if (targetProjectId && notebook.projectId !== targetProjectId) {
        void reply.code(400).send({ error: "Notebook not part of project" });
        return;
      }

      const previousProjectId = notebook.projectId;
      const updated = ensureNotebookRuntimeVersion({
        ...notebook,
        projectId: null,
        projectOrder: null,
      });
      await options.store.save(updated);

      if (previousProjectId) {
        const previousCollaborators =
          await options.projectCollaborators.listByProject(previousProjectId);
        for (const collaborator of previousCollaborators) {
          await options.collaborators.remove(notebook.id, collaborator.userId);
        }
      }

      void reply.code(204).send();
    }
  );
};
