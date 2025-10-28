import type { FastifyInstance } from "fastify";
import { z } from "zod";
import YAML from "yaml";
import {
  ensureNotebookRuntimeVersion,
  NotebookCellSchema,
  NotebookEnvSchema,
  NotebookSchema,
  NotebookFileSchema,
  SLUG_MAX_LENGTH,
  type NotebookEnv,
} from "@nodebooks/notebook-schema";
import type { Notebook } from "@nodebooks/notebook-schema";
import type {
  NotebookCollaboratorStore,
  NotebookRole,
  NotebookStore,
} from "../types.js";
import {
  createNotebookFromTemplate,
  TemplateNotFoundError,
} from "../templates/index.js";
import {
  createNotebookFromFileDefinition,
  serializeNotebookToFileDefinition,
} from "../notebooks/file.js";
import { generateUniqueNotebookSlug } from "../notebooks/slug.js";

const NotebookMutationSchema = z.object({
  name: z.string().min(1).optional(),
  env: NotebookEnvSchema.optional(),
  cells: z.array(NotebookCellSchema).optional(),
  projectId: z.string().nullable().optional(),
  projectOrder: z.number().int().nonnegative().nullable().optional(),
});

const NotebookCreateSchema = NotebookMutationSchema.extend({
  template: z.string().min(1).optional(),
});

const NotebookImportSchema = z.object({
  contents: z.string().min(1),
});

const NotebookPublishSchema = z
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

const formatNotebook = (notebook: Notebook) => {
  return ensureNotebookRuntimeVersion(notebook);
};

import {
  ensureAdmin,
  ensureAuthenticated,
  ensureNotebookAccess,
  toNotebookAccessRole,
} from "../notebooks/permissions.js";

const mergeNotebookEnv = (
  base: NotebookEnv,
  override?: NotebookEnv
): NotebookEnv => {
  if (!override) {
    return base;
  }

  return NotebookEnvSchema.parse({
    runtime: override.runtime ?? base.runtime,
    version: override.version ?? base.version,
    packages: { ...base.packages, ...override.packages },
    variables: { ...base.variables, ...override.variables },
  });
};

export const registerNotebookRoutes = (
  app: FastifyInstance,
  store: NotebookStore,
  collaborators: NotebookCollaboratorStore
) => {
  app.get("/notebooks", async (request, reply) => {
    if (!ensureAuthenticated(request, reply)) {
      return;
    }
    const notebooks = await store.all();
    if (request.user.role === "admin") {
      const enriched = notebooks.map((notebook) => ({
        ...formatNotebook(notebook),
        accessRole: "editor" as NotebookRole,
      }));
      void reply.send({ data: enriched });
      return;
    }

    const collaborations = await collaborators.listForUser(request.user.id);
    const allowedIds = new Set(collaborations.map((c) => c.notebookId));
    const roleByNotebook = new Map(
      collaborations.map((c) => [c.notebookId, c.role])
    );
    const filtered = notebooks.filter((notebook) =>
      allowedIds.has(notebook.id)
    );
    const enriched = filtered.map((notebook) => ({
      ...formatNotebook(notebook),
      accessRole: roleByNotebook.get(notebook.id) ?? "viewer",
    }));
    void reply.send({ data: enriched });
  });

  app.get("/notebooks/:id", async (request, reply) => {
    const parsedParams = z
      .object({ id: z.string().min(1) })
      .safeParse(request.params);
    if (!parsedParams.success) {
      void reply.code(400).send({ error: "Invalid notebook id" });
      return;
    }
    const { id } = parsedParams.data;
    const notebook = await store.get(id);
    if (!notebook) {
      reply.code(404);
      return { error: "Notebook not found" };
    }
    const accessRole = await ensureNotebookAccess(
      request,
      reply,
      collaborators,
      id,
      "viewer"
    );
    if (!accessRole && request.user?.role !== "admin") {
      return;
    }
    const role = toNotebookAccessRole(
      accessRole,
      request.user?.role === "admin"
    );
    void reply.send({
      data: { ...formatNotebook(notebook), accessRole: role },
    });
  });

  app.post("/notebooks", async (request, reply) => {
    if (!ensureAdmin(request, reply)) {
      return;
    }
    const body = NotebookCreateSchema.parse(request.body ?? {});

    const templateId = body.template ?? "blank";
    let templateNotebook;
    try {
      templateNotebook = createNotebookFromTemplate(templateId);
    } catch (error) {
      if (error instanceof TemplateNotFoundError) {
        reply.code(400);
        return { error: error.message };
      }
      throw error;
    }

    const env = mergeNotebookEnv(templateNotebook.env, body.env);
    const providedCells = body.cells ?? [];
    const cells =
      providedCells.length > 0 ? providedCells : templateNotebook.cells;

    const notebook = await store.save(
      formatNotebook(
        NotebookSchema.parse({
          ...templateNotebook,
          name: body.name ?? templateNotebook.name,
          env,
          cells,
        })
      )
    );
    reply.code(201);
    void reply.send({
      data: { ...formatNotebook(notebook), accessRole: "editor" },
    });
  });

  app.put("/notebooks/:id", async (request, reply) => {
    const parsedParams = z
      .object({ id: z.string().min(1) })
      .safeParse(request.params);
    if (!parsedParams.success) {
      void reply.code(400).send({ error: "Invalid notebook id" });
      return;
    }
    const { id } = parsedParams.data;
    const notebook = await store.get(id);
    if (!notebook) {
      reply.code(404);
      return { error: "Notebook not found" };
    }

    const accessRole = await ensureNotebookAccess(
      request,
      reply,
      collaborators,
      id,
      "editor"
    );
    if (!accessRole && request.user?.role !== "admin") {
      return;
    }

    const body = NotebookMutationSchema.parse(request.body ?? {});

    const updated = await store.save(
      formatNotebook({
        ...notebook,
        ...body,
        env: body.env ?? notebook.env,
        cells: body.cells ?? notebook.cells,
      })
    );

    const role = toNotebookAccessRole(
      accessRole,
      request.user?.role === "admin"
    );

    void reply.send({
      data: { ...formatNotebook(updated), accessRole: role },
    });
  });

  app.post("/notebooks/:id/publish", async (request, reply) => {
    const params = z
      .object({ id: z.string().min(1) })
      .safeParse(request.params);
    if (!params.success) {
      void reply.code(400).send({ error: "Invalid notebook id" });
      return;
    }
    const { id } = params.data;
    const notebook = await store.get(id);
    if (!notebook) {
      reply.code(404);
      return { error: "Notebook not found" };
    }

    const accessRole = await ensureNotebookAccess(
      request,
      reply,
      collaborators,
      id,
      "editor"
    );
    if (!accessRole && request.user?.role !== "admin") {
      return;
    }

    const body = NotebookPublishSchema.parse(request.body ?? {});
    const requestedSlug = body.slug ?? notebook.publicSlug ?? null;

    let slug: string | null = notebook.publicSlug ?? null;
    try {
      slug = await generateUniqueNotebookSlug(store, notebook, requestedSlug);
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        reply.code(409);
        return { error: "Slug already in use" };
      }
      throw error;
    }

    try {
      const updated = await store.save(
        formatNotebook({
          ...notebook,
          published: true,
          publicSlug: slug,
        })
      );

      const role = toNotebookAccessRole(
        accessRole,
        request.user?.role === "admin"
      );

      void reply.send({
        data: { ...formatNotebook(updated), accessRole: role },
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        reply.code(409);
        return { error: "Slug already in use" };
      }
      throw error;
    }
  });

  app.post("/notebooks/:id/unpublish", async (request, reply) => {
    const params = z
      .object({ id: z.string().min(1) })
      .safeParse(request.params);
    if (!params.success) {
      void reply.code(400).send({ error: "Invalid notebook id" });
      return;
    }
    const { id } = params.data;
    const notebook = await store.get(id);
    if (!notebook) {
      reply.code(404);
      return { error: "Notebook not found" };
    }

    const accessRole = await ensureNotebookAccess(
      request,
      reply,
      collaborators,
      id,
      "editor"
    );
    if (!accessRole && request.user?.role !== "admin") {
      return;
    }

    const body = NotebookPublishSchema.parse(request.body ?? {});
    let slug: string | null = notebook.publicSlug ?? null;

    if (body.slug !== undefined) {
      if (body.slug === null) {
        slug = null;
      } else {
        try {
          slug = await generateUniqueNotebookSlug(store, notebook, body.slug);
        } catch (error) {
          if (isUniqueConstraintViolation(error)) {
            reply.code(409);
            return { error: "Slug already in use" };
          }
          throw error;
        }
      }
    }

    try {
      const updated = await store.save(
        formatNotebook({
          ...notebook,
          published: false,
          publicSlug: slug,
        })
      );

      const role = toNotebookAccessRole(
        accessRole,
        request.user?.role === "admin"
      );

      void reply.send({
        data: { ...formatNotebook(updated), accessRole: role },
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        reply.code(409);
        return { error: "Slug already in use" };
      }
      throw error;
    }
  });

  app.delete("/notebooks/:id", async (request, reply) => {
    if (!ensureAdmin(request, reply)) {
      return;
    }
    const parsedParams = z
      .object({ id: z.string().min(1) })
      .safeParse(request.params);
    if (!parsedParams.success) {
      void reply.code(400).send({ error: "Invalid notebook id" });
      return;
    }
    const { id } = parsedParams.data;
    const deleted = await store.remove(id);
    if (!deleted) {
      reply.code(404);
      return { error: "Notebook not found" };
    }

    void reply.send({ data: deleted ? formatNotebook(deleted) : deleted });
  });

  app.post("/notebooks/import", async (request, reply) => {
    if (!ensureAdmin(request, reply)) {
      return;
    }
    const body = NotebookImportSchema.safeParse(request.body ?? {});
    if (!body.success) {
      reply.code(400);
      return { error: "Invalid import payload" };
    }

    let parsedFile;
    try {
      parsedFile = NotebookFileSchema.parse(YAML.parse(body.data.contents));
    } catch (error) {
      reply.code(400);
      const message =
        error instanceof Error ? error.message : "Failed to parse notebook";
      return { error: message };
    }

    const notebook = await store.save(
      formatNotebook(createNotebookFromFileDefinition(parsedFile))
    );

    reply.code(201);
    void reply.send({
      data: { ...formatNotebook(notebook), accessRole: "editor" },
    });
  });

  app.get("/notebooks/:id/export", async (request, reply) => {
    const parsedParams = z
      .object({ id: z.string().min(1) })
      .safeParse(request.params);
    if (!parsedParams.success) {
      void reply.code(400).send({ error: "Invalid notebook id" });
      return;
    }
    const { id } = parsedParams.data;
    const notebook = await store.get(id);
    if (!notebook) {
      reply.code(404);
      return { error: "Notebook not found" };
    }
    if (
      !(await ensureNotebookAccess(request, reply, collaborators, id, "viewer"))
    ) {
      return;
    }
    const serialized = serializeNotebookToFileDefinition(
      formatNotebook(notebook)
    );
    const yamlText = YAML.stringify(serialized);
    const baseName =
      notebook.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64) || "notebook";
    const filename = `${baseName}.nb.yml`;

    reply.header("Content-Type", "application/x-yaml; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    return yamlText;
  });
};
