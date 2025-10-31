import {
  createCodeCell,
  createEmptyNotebook,
  createMarkdownCell,
  createUnknownCell,
  ensureNotebookRuntimeVersion,
  NotebookEnvSchema,
  NotebookSqlSchema,
  type CodeCell,
  type MarkdownCell,
  type Notebook,
  type NotebookCell,
  type NotebookEnv,
  type NotebookFile,
  type NotebookFileCell,
  type NotebookFileCodeCell,
  type NotebookFileNotebook,
  type NotebookSql,
  type UnknownCell,
} from "@nodebooks/notebook-schema";
import { backendPluginRegistry } from "../plugins/index.js";

const cloneEnv = (env?: NotebookFileNotebook["env"]): NotebookEnv => {
  const config = env ?? {};
  return NotebookEnvSchema.parse({
    ...config,
    packages: config.packages ?? {},
    variables: config.variables ?? {},
  });
};

const cloneSql = (sql?: NotebookFileNotebook["sql"]): NotebookSql => {
  return NotebookSqlSchema.parse(sql ?? {});
};

const cloneCells = (cells: NotebookFileCell[]): NotebookCell[] => {
  const result: NotebookCell[] = [];
  for (const cell of cells) {
    // Handle core cells (always available)
    if (cell.type === "markdown") {
      const markdownCell = cell as {
        type: "markdown";
        source: string;
        metadata?: Record<string, unknown>;
      };
      result.push(
        createMarkdownCell({
          source: markdownCell.source,
          metadata: markdownCell.metadata ?? {},
        })
      );
      continue;
    }

    if (cell.type === "code") {
      const codeCell = cell as NotebookFileCodeCell;
      result.push(
        createCodeCell({
          language: codeCell.language ?? "ts",
          source: codeCell.source,
          metadata: codeCell.metadata ?? {},
          outputs: codeCell.outputs ?? [],
        })
      );
      continue;
    }

    // Handle plugin cells dynamically
    const cellTypeDef = backendPluginRegistry.getCellType(cell.type);

    if (cellTypeDef?.deserialize) {
      try {
        result.push(cellTypeDef.deserialize(cell));
      } catch (error) {
        // Failed to deserialize - create unknown cell
        console.error(
          `Failed to deserialize cell of type "${cell.type}":`,
          error
        );
        result.push(createUnknownCell(cell.type, cell, cellTypeDef.type));
      }
    } else {
      // Plugin not loaded - create unknown cell
      result.push(createUnknownCell(cell.type, cell));
    }
  }
  return result;
};

export const createNotebookFromFileDefinition = (
  file: NotebookFile
): Notebook => {
  const env = cloneEnv(file.notebook.env);
  const sql = cloneSql(file.notebook.sql);
  const cells = cloneCells(file.notebook.cells ?? []);
  const name =
    file.notebook.name ?? file.title ?? file.description ?? "Imported Notebook";
  return ensureNotebookRuntimeVersion(
    createEmptyNotebook({
      name,
      env,
      sql,
      cells,
    })
  );
};

const isEmptyRecord = (value: Record<string, unknown> | undefined | null) => {
  if (!value) {
    return true;
  }
  return Object.keys(value).length === 0;
};

const serializeEnv = (env: NotebookEnv): NotebookFileNotebook["env"] => {
  const result: NotebookFileNotebook["env"] = {
    runtime: env.runtime,
    version: env.version,
  };
  if (!isEmptyRecord(env.packages)) {
    result.packages = env.packages;
  }
  if (!isEmptyRecord(env.variables)) {
    result.variables = env.variables;
  }
  return result;
};

const serializeSql = (
  sql: NotebookSql
): NotebookFileNotebook["sql"] | undefined => {
  const parsed = NotebookSqlSchema.parse(sql ?? {});
  if (!parsed.connections || parsed.connections.length === 0) {
    return undefined;
  }
  return parsed;
};

const serializeMarkdownCell = (cell: MarkdownCell): NotebookFileCell => {
  const result: NotebookFileCell = {
    type: "markdown",
    source: cell.source,
  };
  if (!isEmptyRecord(cell.metadata)) {
    result.metadata = cell.metadata;
  }
  return result;
};

const serializeCodeCell = (cell: CodeCell): NotebookFileCell => {
  const result: NotebookFileCell = {
    type: "code",
    language: cell.language,
    source: cell.source,
  };
  if (!isEmptyRecord(cell.metadata)) {
    result.metadata = cell.metadata;
  }
  if (cell.outputs && cell.outputs.length > 0) {
    result.outputs = cell.outputs;
  }
  return result;
};

const serializeCells = (cells: NotebookCell[]): NotebookFileCell[] => {
  return cells.map((cell) => {
    // Handle core cells
    if (cell.type === "markdown") {
      return serializeMarkdownCell(cell as MarkdownCell);
    }

    if (cell.type === "code") {
      return serializeCodeCell(cell as CodeCell);
    }

    // Handle unknown cells (preserve original data)
    if (cell.type === "unknown") {
      const unknownCell = cell as UnknownCell;
      return unknownCell.originalData as NotebookFileCell;
    }

    // Handle plugin cells dynamically
    const cellTypeDef = backendPluginRegistry.getCellType(cell.type);

    if (cellTypeDef?.serialize) {
      return cellTypeDef.serialize(cell);
    }

    // Fallback: shouldn't happen but preserve as unknown
    console.warn(
      `No serializer found for cell type "${cell.type}", preserving as generic cell`
    );
    return {
      type: cell.type,
      metadata: cell.metadata,
    } as NotebookFileCell;
  });
};

export const serializeNotebookToFileDefinition = (
  notebook: Notebook
): NotebookFile => {
  const env = serializeEnv(notebook.env);
  const cells = serializeCells(notebook.cells);
  const sql = serializeSql(notebook.sql);
  const notebookDefinition: NotebookFileNotebook = {
    name: notebook.name,
    env,
    cells,
  };
  if (sql) {
    notebookDefinition.sql = sql;
  }
  return {
    title: notebook.name,
    notebook: notebookDefinition,
  };
};
