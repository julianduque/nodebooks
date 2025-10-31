import { createElement } from "react";
import type { SVGProps } from "react";
import type { CellTypeDefinition } from "@nodebooks/cell-plugin-api";
import type {
  NotebookCell,
  NotebookFileCell,
} from "@nodebooks/notebook-schema";
import {
  TerminalCellSchema,
  CommandCellSchema,
  createTerminalCell,
  createCommandCell,
  type TerminalCell,
  type CommandCell,
  type NotebookFileTerminalCell,
  type NotebookFileCommandCell,
} from "./schema.js";

const TerminalIcon = (props: SVGProps<SVGSVGElement>) =>
  createElement(
    "svg",
    {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      ...props,
    },
    createElement("path", { d: "m4 17 6-6-6-6" }),
    createElement("path", { d: "M12 19h8" })
  );

const isEmptyRecord = (
  value: Record<string, unknown> | undefined | null
): boolean => {
  if (!value) return true;
  return Object.keys(value).length === 0;
};

/**
 * Shared metadata for terminal cell type.
 * Used by both frontend.ts and index.ts to avoid duplication.
 */
export const terminalCellMetadata = {
  type: "terminal",
  schema: TerminalCellSchema as unknown as CellTypeDefinition["schema"],
  metadata: {
    name: "Terminal",
    description: "Interactive terminal session",
    icon: TerminalIcon,
  },
  createCell: ((partial?: NotebookCell) =>
    createTerminalCell(
      partial as Partial<TerminalCell>
    )) as CellTypeDefinition["createCell"],
  serialize: (cell: NotebookCell): NotebookFileCell => {
    const terminalCell = cell as TerminalCell;
    const result: NotebookFileTerminalCell = {
      type: "terminal",
    };
    if (!isEmptyRecord(terminalCell.metadata)) {
      result.metadata = terminalCell.metadata;
    }
    if (terminalCell.buffer && terminalCell.buffer.length > 0) {
      result.buffer = terminalCell.buffer;
    }
    return result as NotebookFileCell;
  },
  deserialize: (fileCell: NotebookFileCell): NotebookCell => {
    const terminalFileCell = fileCell as NotebookFileTerminalCell;
    return createTerminalCell({
      metadata: terminalFileCell.metadata ?? {},
      buffer: terminalFileCell.buffer ?? "",
    }) as NotebookCell;
  },
} satisfies Pick<
  CellTypeDefinition,
  "type" | "schema" | "metadata" | "createCell" | "serialize" | "deserialize"
>;

/**
 * Shared metadata for command cell type.
 * Used by both frontend.ts and index.ts to avoid duplication.
 */
export const commandCellMetadata = {
  type: "command",
  schema: CommandCellSchema as unknown as CellTypeDefinition["schema"],
  metadata: {
    name: "Command",
    description: "Run a shell command",
    icon: TerminalIcon,
  },
  createCell: ((partial?: NotebookCell) =>
    createCommandCell(
      partial as Partial<CommandCell>
    )) as CellTypeDefinition["createCell"],
  serialize: (cell: NotebookCell): NotebookFileCell => {
    const commandCell = cell as CommandCell;
    const result: NotebookFileCommandCell = {
      type: "command",
    };
    if (!isEmptyRecord(commandCell.metadata)) {
      result.metadata = commandCell.metadata;
    }
    if (commandCell.command && commandCell.command.length > 0) {
      result.command = commandCell.command;
    }
    if (commandCell.notes && commandCell.notes.length > 0) {
      result.notes = commandCell.notes;
    }
    return result as NotebookFileCell;
  },
  deserialize: (fileCell: NotebookFileCell): NotebookCell => {
    const commandFileCell = fileCell as NotebookFileCommandCell;
    return createCommandCell({
      metadata: commandFileCell.metadata ?? {},
      command: commandFileCell.command ?? "",
      notes: commandFileCell.notes ?? "",
    }) as NotebookCell;
  },
} satisfies Pick<
  CellTypeDefinition,
  "type" | "schema" | "metadata" | "createCell" | "serialize" | "deserialize"
>;

/**
 * Shared plugin metadata.
 */
export const pluginMetadata = {
  id: "@nodebooks/terminal-cells",
  version: "0.1.0",
  metadata: {
    name: "Terminal Cells",
    description: "Terminal and Command cell types for running shell commands",
    author: "Julián Duque",
    version: "0.1.0",
  },
};
