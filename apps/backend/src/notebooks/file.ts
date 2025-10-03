import {
  createCodeCell,
  createEmptyNotebook,
  createMarkdownCell,
  createShellCell,
  ensureNotebookRuntimeVersion,
  NotebookEnvSchema,
  type CodeCell,
  type MarkdownCell,
  type ShellCell,
  type Notebook,
  type NotebookCell,
  type NotebookEnv,
  type NotebookFile,
  type NotebookFileCell,
  type NotebookFileCodeCell,
  type NotebookFileShellCell,
  type NotebookFileNotebook,
} from "@nodebooks/notebook-schema";

const cloneEnv = (env?: NotebookFileNotebook["env"]): NotebookEnv => {
  const config = env ?? {};
  return NotebookEnvSchema.parse({
    ...config,
    packages: config.packages ?? {},
    variables: config.variables ?? {},
  });
};

const cloneCells = (cells: NotebookFileCell[]): NotebookCell[] => {
  const result: NotebookCell[] = [];
  for (const cell of cells) {
    if (cell.type === "markdown") {
      result.push(
        createMarkdownCell({
          source: cell.source,
          metadata: cell.metadata ?? {},
        })
      );
      continue;
    }
    if (cell.type === "shell") {
      const shellCell = cell as NotebookFileShellCell;
      const shell = createShellCell({
        metadata: shellCell.metadata ?? {},
        buffer: shellCell.buffer ?? "",
      });
      const timeout =
        typeof shellCell.metadata?.timeoutMs === "number"
          ? { timeoutMs: shellCell.metadata.timeoutMs }
          : {};
      const metadata = { ...shell.metadata, ...timeout };
      result.push({ ...shell, metadata });
      continue;
    }
    const codeCell = cell as NotebookFileCodeCell;
    result.push(
      createCodeCell({
        language: codeCell.language ?? "ts",
        source: codeCell.source,
        metadata: codeCell.metadata ?? {},
        outputs: codeCell.outputs ?? [],
      })
    );
  }
  return result;
};

export const createNotebookFromFileDefinition = (
  file: NotebookFile
): Notebook => {
  const env = cloneEnv(file.notebook.env);
  const cells = cloneCells(file.notebook.cells ?? []);
  const name =
    file.notebook.name ?? file.title ?? file.description ?? "Imported Notebook";
  return ensureNotebookRuntimeVersion(
    createEmptyNotebook({
      name,
      env,
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

const serializeShellCell = (cell: ShellCell): NotebookFileCell => {
  const result: NotebookFileCell = {
    type: "shell",
  };
  if (!isEmptyRecord(cell.metadata)) {
    result.metadata = cell.metadata;
  }
  if (cell.buffer && cell.buffer.length > 0) {
    result.buffer = cell.buffer;
  }
  return result;
};

const serializeCells = (cells: NotebookCell[]): NotebookFileCell[] => {
  return cells.map((cell) => {
    if (cell.type === "markdown") {
      return serializeMarkdownCell(cell);
    }
    if (cell.type === "shell") {
      return serializeShellCell(cell as ShellCell);
    }
    return serializeCodeCell(cell as CodeCell);
  });
};

export const serializeNotebookToFileDefinition = (
  notebook: Notebook
): NotebookFile => {
  const env = serializeEnv(notebook.env);
  const cells = serializeCells(notebook.cells);
  return {
    title: notebook.name,
    notebook: {
      name: notebook.name,
      env,
      cells,
    },
  };
};
