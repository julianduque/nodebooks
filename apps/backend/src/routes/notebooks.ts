import type { FastifyInstance } from "fastify";
import { z } from "zod";
import YAML from "yaml";
import {
  ensureNotebookRuntimeVersion,
  NotebookCellSchema,
  NotebookEnvSchema,
  NotebookSchema,
  NotebookFileSchema,
  type NotebookEnv,
} from "@nodebooks/notebook-schema";
import type { Notebook } from "@nodebooks/notebook-schema";
import type { NotebookStore } from "../types.js";
import {
  createNotebookFromTemplate,
  TemplateNotFoundError,
} from "../templates/index.js";
import {
  createNotebookFromFileDefinition,
  serializeNotebookToFileDefinition,
} from "../notebooks/file.js";

const NotebookMutationSchema = z.object({
  name: z.string().min(1).optional(),
  env: NotebookEnvSchema.optional(),
  cells: z.array(NotebookCellSchema).optional(),
});

const NotebookCreateSchema = NotebookMutationSchema.extend({
  template: z.string().min(1).optional(),
});

const NotebookImportSchema = z.object({
  contents: z.string().min(1),
});

const formatNotebook = (notebook: Notebook) => {
  return ensureNotebookRuntimeVersion(notebook);
};

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
  store: NotebookStore
) => {
  app.get("/notebooks", async () => {
    return {
      data: (await store.all()).map(formatNotebook),
    };
  });

  app.get("/notebooks/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const notebook = await store.get(params.id);
    if (!notebook) {
      reply.code(404);
      return { error: "Notebook not found" };
    }

    return { data: formatNotebook(notebook) };
  });

  app.post("/notebooks", async (request, reply) => {
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
    return { data: formatNotebook(notebook) };
  });

  app.put("/notebooks/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const notebook = await store.get(params.id);
    if (!notebook) {
      reply.code(404);
      return { error: "Notebook not found" };
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

    return { data: formatNotebook(updated) };
  });

  app.delete("/notebooks/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const deleted = await store.remove(params.id);
    if (!deleted) {
      reply.code(404);
      return { error: "Notebook not found" };
    }

    return { data: deleted ? formatNotebook(deleted) : deleted };
  });

  app.post("/notebooks/import", async (request, reply) => {
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
    return { data: formatNotebook(notebook) };
  });

  app.get("/notebooks/:id/export", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const notebook = await store.get(params.id);
    if (!notebook) {
      reply.code(404);
      return { error: "Notebook not found" };
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
    const filename = `${baseName}.nbdm`;

    reply.header("Content-Type", "application/x-yaml; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    return yamlText;
  });
};
