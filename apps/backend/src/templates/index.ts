import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import {
  NotebookFileSchema,
  NotebookTemplateSummarySchema,
  type Notebook,
  type NotebookFile,
  type NotebookTemplateSummary,
} from "@nodebooks/notebook-schema";
import { createNotebookFromFileDefinition } from "../notebooks/file.js";

interface NotebookTemplateDefinition {
  summary: NotebookTemplateSummary;
  file: NotebookFile;
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

const readTemplateFile = (filePath: string): NotebookFile => {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = NotebookFileSchema.safeParse(YAML.parse(raw));
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

const toSummary = (file: NotebookFile, filePath: string) => {
  if (!file.id || !file.title || !file.description) {
    throw new TemplateParseError(
      "Template must include id, title, and description",
      filePath
    );
  }

  return NotebookTemplateSummarySchema.parse({
    id: file.id,
    title: file.title,
    description: file.description,
    badge: file.badge,
    tags: file.tags,
    order: file.order,
  });
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
    const summary = toSummary(file, fullPath);
    if (registry.has(summary.id)) {
      throw new Error(
        `Duplicate template id '${summary.id}' detected at '${fullPath}'`
      );
    }
    registry.set(summary.id, {
      summary,
      file,
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

  return createNotebookFromFileDefinition({
    ...entry.file,
    notebook: {
      ...entry.file.notebook,
      name: entry.file.notebook.name ?? entry.summary.title,
    },
  });
};

export const getTemplateDirectory = () => TEMPLATE_DIR;
