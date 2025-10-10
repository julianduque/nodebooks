import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  ensureNotebookRuntimeVersion,
  normalizeSlug,
  type Notebook,
} from "@nodebooks/notebook-schema";
import type { NotebookStore, ProjectStore } from "../types.js";

const compareByProjectOrder = (a: Notebook, b: Notebook) => {
  const orderA = a.projectOrder ?? Number.POSITIVE_INFINITY;
  const orderB = b.projectOrder ?? Number.POSITIVE_INFINITY;
  if (orderA !== orderB) {
    return orderA - orderB;
  }
  return a.name.localeCompare(b.name);
};

interface RegisterPublicViewRoutesOptions {
  store: NotebookStore;
  projects: ProjectStore;
}

const buildPublicPayload = async (
  store: NotebookStore,
  projects: ProjectStore,
  notebook: Notebook
) => {
  const formattedNotebook = ensureNotebookRuntimeVersion(notebook);

  if (!formattedNotebook.projectId) {
    return { notebook: formattedNotebook, project: null } as const;
  }

  const project = await projects.get(formattedNotebook.projectId);
  if (!project) {
    return { notebook: formattedNotebook, project: null } as const;
  }

  const projectNotebooks = (await store.all())
    .filter((entry) => entry.projectId === project.id && entry.published)
    .map((entry) => ensureNotebookRuntimeVersion(entry))
    .sort(compareByProjectOrder);

  return {
    notebook: formattedNotebook,
    project: {
      project,
      notebooks: projectNotebooks,
    },
  } as const;
};

export const registerPublicViewRoutes = (
  app: FastifyInstance,
  options: RegisterPublicViewRoutesOptions
) => {
  app.get("/public/notebooks/:identifier", async (request, reply) => {
    const params = z
      .object({ identifier: z.string().min(1) })
      .safeParse(request.params);
    if (!params.success) {
      void reply.code(400).send({ error: "Invalid notebook identifier" });
      return;
    }

    const identifier = params.data.identifier.trim();
    let notebook = await options.store.getByPublicSlug(identifier);
    if (!notebook) {
      notebook = await options.store.get(identifier);
    }

    if (!notebook || !notebook.published) {
      void reply.code(404).send({ error: "Notebook not found" });
      return;
    }

    const payload = await buildPublicPayload(
      options.store,
      options.projects,
      notebook
    );
    void reply.send({ data: payload });
  });

  app.get(
    "/public/projects/:projectSlug/notebooks/:notebookSlug",
    async (request, reply) => {
      const params = z
        .object({
          projectSlug: z.string().min(1),
          notebookSlug: z.string().min(1),
        })
        .safeParse(request.params);
      if (!params.success) {
        void reply.code(400).send({ error: "Invalid publish path" });
        return;
      }

      const projectSlug = normalizeSlug(params.data.projectSlug);
      const notebookSlug = normalizeSlug(params.data.notebookSlug);
      if (!projectSlug || !notebookSlug) {
        void reply.code(404).send({ error: "Notebook not found" });
        return;
      }

      const project = await options.projects.getBySlug(projectSlug);
      if (!project) {
        void reply.code(404).send({ error: "Project not found" });
        return;
      }

      const notebook = await options.store.getByPublicSlug(notebookSlug);
      if (
        !notebook ||
        notebook.projectId !== project.id ||
        !notebook.published
      ) {
        void reply.code(404).send({ error: "Notebook not found" });
        return;
      }

      const payload = await buildPublicPayload(
        options.store,
        options.projects,
        notebook
      );
      void reply.send({ data: payload });
    }
  );
};
