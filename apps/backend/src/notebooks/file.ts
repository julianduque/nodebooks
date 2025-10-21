import {
  createCodeCell,
  createEmptyNotebook,
  createMarkdownCell,
  createTerminalCell,
  createCommandCell,
  createHttpCell,
  ensureNotebookRuntimeVersion,
  NotebookEnvSchema,
  type CodeCell,
  type CommandCell,
  type HttpCell,
  type MarkdownCell,
  type TerminalCell,
  type Notebook,
  type NotebookCell,
  type NotebookEnv,
  type NotebookFile,
  type NotebookFileCell,
  type NotebookFileCodeCell,
  type NotebookFileCommandCell,
  type NotebookFileHttpCell,
  type NotebookFileLegacyShellCell,
  type NotebookFileNotebook,
  type NotebookFileTerminalCell,
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
    if (cell.type === "terminal") {
      const terminalCell = cell as NotebookFileTerminalCell;
      const terminal = createTerminalCell({
        metadata: terminalCell.metadata ?? {},
        buffer: terminalCell.buffer ?? "",
      });
      result.push(terminal);
      continue;
    }
    if (cell.type === "shell") {
      const legacy = cell as NotebookFileLegacyShellCell;
      const terminal = createTerminalCell({
        metadata: legacy.metadata ?? {},
        buffer: legacy.buffer ?? "",
      });
      result.push(terminal);
      continue;
    }
    if (cell.type === "command") {
      const commandCell = cell as NotebookFileCommandCell;
      const command = createCommandCell({
        metadata: commandCell.metadata ?? {},
        command: commandCell.command ?? "",
        notes: commandCell.notes ?? "",
      });
      result.push(command);
      continue;
    }
    if (cell.type === "http") {
      const httpCell = cell as NotebookFileHttpCell;
      const http = createHttpCell({
        metadata: httpCell.metadata ?? {},
        request: httpCell.request ?? {},
        response: httpCell.response,
      });
      result.push(http);
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

const serializeTerminalCell = (cell: TerminalCell): NotebookFileCell => {
  const result: NotebookFileCell = {
    type: "terminal",
  };
  if (!isEmptyRecord(cell.metadata)) {
    result.metadata = cell.metadata;
  }
  if (cell.buffer && cell.buffer.length > 0) {
    result.buffer = cell.buffer;
  }
  return result;
};

const serializeCommandCell = (cell: CommandCell): NotebookFileCell => {
  const result: NotebookFileCell = {
    type: "command",
  };
  if (!isEmptyRecord(cell.metadata)) {
    result.metadata = cell.metadata;
  }
  if (cell.command && cell.command.length > 0) {
    result.command = cell.command;
  }
  if (cell.notes && cell.notes.length > 0) {
    result.notes = cell.notes;
  }
  return result;
};

const serializeHttpCell = (cell: HttpCell): NotebookFileCell => {
  const result: NotebookFileCell = {
    type: "http",
  };
  if (!isEmptyRecord(cell.metadata)) {
    result.metadata = cell.metadata;
  }
  if (cell.request) {
    result.request = cell.request;
  }
  if (cell.response) {
    result.response = cell.response;
  }
  return result;
};

const serializeCells = (cells: NotebookCell[]): NotebookFileCell[] => {
  return cells.map((cell) => {
    if (cell.type === "markdown") {
      return serializeMarkdownCell(cell);
    }
    if (cell.type === "terminal") {
      return serializeTerminalCell(cell as TerminalCell);
    }
    if (cell.type === "command") {
      return serializeCommandCell(cell as CommandCell);
    }
    if (cell.type === "http") {
      return serializeHttpCell(cell as HttpCell);
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
