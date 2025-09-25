import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { z } from "zod";
import {
  createCodeCell,
  createEmptyNotebook,
  createMarkdownCell,
  NotebookEnvSchema,
  NotebookOutputSchema,
  type Notebook,
  type NotebookEnv,
  NotebookTemplateSummarySchema,
  type NotebookTemplateSummary,
} from "@nodebooks/notebook-schema";

const TemplateEnvSchema = z.object({
  runtime: z.enum(["node"]).optional(),
  version: z.string().optional(),
  packages: z.record(z.string(), z.string()).optional(),
  variables: z.record(z.string(), z.string()).optional(),
});

type TemplateEnv = z.infer<typeof TemplateEnvSchema>;

const TemplateMarkdownCellSchema = z.object({
  type: z.literal("markdown"),
  source: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const TemplateCodeCellSchema = z.object({
  type: z.literal("code"),
  language: z.enum(["js", "ts"]).optional(),
  source: z.string(),
  metadata: z
    .object({
      timeoutMs: z.number().int().positive().max(600_000).optional(),
      display: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  outputs: z.array(NotebookOutputSchema).optional(),
});

type TemplateCodeCell = z.infer<typeof TemplateCodeCellSchema>;

type TemplateCell =
  | z.infer<typeof TemplateMarkdownCellSchema>
  | TemplateCodeCell;

const TemplateCellSchema = z.discriminatedUnion("type", [
  TemplateMarkdownCellSchema,
  TemplateCodeCellSchema,
]);

const TemplateNotebookSchema = z.object({
  name: z.string().optional(),
  env: TemplateEnvSchema.optional(),
  cells: z.array(TemplateCellSchema).default([]),
});

type TemplateNotebook = z.infer<typeof TemplateNotebookSchema>;

const TemplateFileSchema = NotebookTemplateSummarySchema.extend({
  notebook: TemplateNotebookSchema,
});

type TemplateFile = z.infer<typeof TemplateFileSchema>;

interface NotebookTemplateDefinition {
  summary: NotebookTemplateSummary;
  notebook: TemplateNotebook;
  sourcePath: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_TEMPLATE_DIR = path.join(
  __dirname,
  "../../../..",
  "content",
  "templates"
);

import { loadServerConfig } from "@nodebooks/config";

const TEMPLATE_DIR = (() => {
  const cfg = loadServerConfig();
  if (cfg.templatesDir && cfg.templatesDir.length > 0) {
    return path.resolve(process.cwd(), cfg.templatesDir);
  }
  return DEFAULT_TEMPLATE_DIR;
})();

const registry = new Map<string, NotebookTemplateDefinition>();

class TemplateParseError extends Error {
  constructor(
    message: string,
    readonly filePath: string
  ) {
    super(message);
    this.name = "TemplateParseError";
  }
}

export class TemplateNotFoundError extends Error {
  constructor(public readonly templateId: string) {
    super(`Template '${templateId}' not found`);
    this.name = "TemplateNotFoundError";
  }
}

const readTemplateFile = (filePath: string): TemplateFile => {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = TemplateFileSchema.safeParse(YAML.parse(raw));
  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((issue) => issue.message)
      .join("; ");
    throw new TemplateParseError(
      formatted || "Invalid template file",
      filePath
    );
  }
  return parsed.data;
};

const loadTemplates = () => {
  if (!fs.existsSync(TEMPLATE_DIR)) {
    throw new Error(`Template directory '${TEMPLATE_DIR}' does not exist`);
  }
  const entries = fs.readdirSync(TEMPLATE_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".nbmd")) {
      continue;
    }
    const fullPath = path.join(TEMPLATE_DIR, entry.name);
    const file = readTemplateFile(fullPath);
    if (registry.has(file.id)) {
      throw new Error(
        `Duplicate template id '${file.id}' detected at '${fullPath}'`
      );
    }
    registry.set(file.id, {
      summary: {
        id: file.id,
        title: file.title,
        description: file.description,
        badge: file.badge,
        tags: file.tags,
        order: file.order,
      },
      notebook: file.notebook,
      sourcePath: fullPath,
    });
  }

  if (registry.size === 0) {
    throw new Error(
      `No notebook templates found in directory '${TEMPLATE_DIR}'`
    );
  }
};

loadTemplates();

const cloneEnv = (base: TemplateEnv | undefined): NotebookEnv => {
  const envConfig = base ?? {};
  const parsed = NotebookEnvSchema.parse({
    ...envConfig,
    packages: envConfig.packages ?? {},
    variables: envConfig.variables ?? {},
  });
  return parsed;
};

const cloneCells = (cells: TemplateCell[]) => {
  return cells.map((cell) => {
    if (cell.type === "markdown") {
      return createMarkdownCell({
        source: cell.source,
        metadata: cell.metadata ?? {},
      });
    }
    const codeCell = cell as TemplateCodeCell;
    return createCodeCell({
      language: codeCell.language ?? "ts",
      source: codeCell.source,
      metadata: codeCell.metadata ?? {},
      outputs: codeCell.outputs ?? [],
    });
  });
};

export const listTemplateSummaries = (): NotebookTemplateSummary[] => {
  return Array.from(registry.values())
    .map((entry) => entry.summary)
    .sort((a, b) => {
      if (a.order === b.order) {
        return a.title.localeCompare(b.title);
      }
      return a.order - b.order;
    });
};

export const hasTemplate = (id: string): boolean => registry.has(id);

export const createNotebookFromTemplate = (id: string): Notebook => {
  const entry = registry.get(id);
  if (!entry) {
    throw new TemplateNotFoundError(id);
  }

  const env = cloneEnv(entry.notebook.env);
  const cells = cloneCells(entry.notebook.cells ?? []);

  return createEmptyNotebook({
    name: entry.notebook.name ?? entry.summary.title,
    env,
    cells,
  });
};

export const getTemplateDirectory = () => TEMPLATE_DIR;
