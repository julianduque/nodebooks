import { Sparkles } from "lucide-react";
import type { CellTypeDefinition } from "@nodebooks/cell-plugin-api";
import type {
  NotebookCell,
  NotebookFileCell,
} from "@nodebooks/notebook-schema";
import {
  AiCellSchema,
  createAiCell,
  type AiCell,
  type NotebookFileAiCell,
} from "./schema.js";

const isEmptyRecord = (
  value: Record<string, unknown> | undefined | null
): boolean => {
  if (!value) return true;
  return Object.keys(value).length === 0;
};

export const aiCellMetadata = {
  type: "ai",
  schema: AiCellSchema as unknown as CellTypeDefinition["schema"],
  metadata: {
    name: "AI",
    description: "Interact with AI assistants",
    icon: Sparkles,
  },
  createCell: ((partial?: NotebookCell) =>
    createAiCell(
      partial as Partial<AiCell>
    )) as CellTypeDefinition["createCell"],
  serialize: (cell: NotebookCell): NotebookFileCell => {
    const aiCell = cell as AiCell;
    const result: NotebookFileAiCell = {
      type: "ai",
    };
    if (!isEmptyRecord(aiCell.metadata)) {
      result.metadata = aiCell.metadata;
    }
    if (aiCell.messages && aiCell.messages.length > 0) {
      result.messages = aiCell.messages;
    }
    if (aiCell.prompt && aiCell.prompt.length > 0) {
      result.prompt = aiCell.prompt;
    }
    if (aiCell.system && aiCell.system.length > 0) {
      result.system = aiCell.system;
    }
    if (aiCell.model) {
      result.model = aiCell.model;
    }
    if (aiCell.temperature !== undefined) {
      result.temperature = aiCell.temperature;
    }
    if (aiCell.maxTokens !== undefined) {
      result.maxTokens = aiCell.maxTokens;
    }
    if (aiCell.topP !== undefined) {
      result.topP = aiCell.topP;
    }
    if (aiCell.frequencyPenalty !== undefined) {
      result.frequencyPenalty = aiCell.frequencyPenalty;
    }
    if (aiCell.presencePenalty !== undefined) {
      result.presencePenalty = aiCell.presencePenalty;
    }
    if (aiCell.response) {
      result.response = aiCell.response;
    }
    return result as NotebookFileCell;
  },
  deserialize: (fileCell: NotebookFileCell): NotebookCell => {
    const aiFileCell = fileCell as NotebookFileAiCell;
    return createAiCell({
      metadata: aiFileCell.metadata ?? {},
      messages: aiFileCell.messages ?? [],
      prompt: aiFileCell.prompt ?? "",
      system: aiFileCell.system ?? "",
      model: aiFileCell.model,
      temperature: aiFileCell.temperature,
      maxTokens: aiFileCell.maxTokens,
      topP: aiFileCell.topP,
      frequencyPenalty: aiFileCell.frequencyPenalty,
      presencePenalty: aiFileCell.presencePenalty,
      response: aiFileCell.response,
    }) as NotebookCell;
  },
} satisfies Pick<
  CellTypeDefinition,
  "type" | "schema" | "metadata" | "createCell" | "serialize" | "deserialize"
>;

export const pluginMetadata = {
  id: "@nodebooks/ai-cell",
  version: "0.1.0",
  metadata: {
    name: "AI Cell",
    description: "Interact with AI assistants using prompts",
    version: "0.1.0",
  },
};
