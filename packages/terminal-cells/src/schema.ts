import { z } from "zod";

/**
 * Terminal cell schema - Interactive terminal session.
 */
export const TerminalCellSchema = z.object({
  id: z.string(),
  type: z.literal("terminal"),
  metadata: z.record(z.string(), z.unknown()).default({}),
  buffer: z.string().default(""),
});

export type TerminalCell = z.infer<typeof TerminalCellSchema>;

/**
 * Command cell schema - Run a shell command.
 */
export const CommandCellSchema = z.object({
  id: z.string(),
  type: z.literal("command"),
  metadata: z.record(z.string(), z.unknown()).default({}),
  command: z.string().default(""),
  notes: z.string().default(""),
});

export type CommandCell = z.infer<typeof CommandCellSchema>;

const createId = (): string => {
  if (
    typeof globalThis.crypto !== "undefined" &&
    "randomUUID" in globalThis.crypto
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `nb_${Math.random().toString(36).slice(2, 10)}`;
};

/**
 * Factory function to create a new terminal cell.
 */
export const createTerminalCell = (
  partial?: Partial<TerminalCell>
): TerminalCell => {
  return TerminalCellSchema.parse({
    id: partial?.id ?? createId(),
    type: "terminal",
    metadata: partial?.metadata ?? {},
    buffer: partial?.buffer ?? "",
  });
};

/**
 * Factory function to create a new command cell.
 */
export const createCommandCell = (
  partial?: Partial<CommandCell>
): CommandCell => {
  return CommandCellSchema.parse({
    id: partial?.id ?? createId(),
    type: "command",
    metadata: partial?.metadata ?? {},
    command: partial?.command ?? "",
    notes: partial?.notes ?? "",
  });
};

/**
 * Terminal cell file schema - For notebook file serialization.
 */
export const NotebookFileTerminalCellSchema = z.object({
  type: z.literal("terminal"),
  metadata: z.record(z.string(), z.unknown()).optional(),
  buffer: z.string().optional(),
});
export type NotebookFileTerminalCell = z.infer<
  typeof NotebookFileTerminalCellSchema
>;

/**
 * Command cell file schema - For notebook file serialization.
 */
export const NotebookFileCommandCellSchema = z.object({
  type: z.literal("command"),
  metadata: z.record(z.string(), z.unknown()).optional(),
  command: z.string().optional(),
  notes: z.string().optional(),
});
export type NotebookFileCommandCell = z.infer<
  typeof NotebookFileCommandCellSchema
>;
