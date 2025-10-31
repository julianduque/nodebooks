import { Globe } from "lucide-react";
import type { CellTypeDefinition } from "@nodebooks/cell-plugin-api";
import type {
  NotebookCell,
  NotebookFileCell,
} from "@nodebooks/notebook-schema";
import {
  HttpCellSchema,
  createHttpCell,
  type HttpCell,
  type NotebookFileHttpCell,
} from "./schema.js";

const isEmptyRecord = (
  value: Record<string, unknown> | undefined | null
): boolean => {
  if (!value) return true;
  return Object.keys(value).length === 0;
};

/**
 * Shared metadata for HTTP cell type.
 * Used by both frontend.ts and index.ts to avoid duplication.
 */
export const httpCellMetadata = {
  type: "http",
  schema: HttpCellSchema as unknown as CellTypeDefinition["schema"],
  metadata: {
    name: "HTTP",
    description: "Make HTTP requests and inspect responses",
    icon: Globe,
  },
  createCell: ((partial?: NotebookCell) =>
    createHttpCell(
      partial as Partial<HttpCell>
    )) as CellTypeDefinition["createCell"],
  serialize: (cell: NotebookCell): NotebookFileCell => {
    const httpCell = cell as HttpCell;
    const result: NotebookFileHttpCell = {
      type: "http",
    };
    if (!isEmptyRecord(httpCell.metadata)) {
      result.metadata = httpCell.metadata;
    }
    if (httpCell.request) {
      result.request = httpCell.request;
    }
    if (httpCell.response) {
      result.response = httpCell.response;
    }
    if (httpCell.assignVariable) {
      result.assignVariable = httpCell.assignVariable;
    }
    if (httpCell.assignBody) {
      result.assignBody = httpCell.assignBody;
    }
    if (httpCell.assignHeaders) {
      result.assignHeaders = httpCell.assignHeaders;
    }
    return result as NotebookFileCell;
  },
  deserialize: (fileCell: NotebookFileCell): NotebookCell => {
    const httpFileCell = fileCell as NotebookFileHttpCell;
    return createHttpCell({
      metadata: httpFileCell.metadata ?? {},
      request: httpFileCell.request,
      response: httpFileCell.response,
      assignVariable: httpFileCell.assignVariable,
      assignBody: httpFileCell.assignBody,
      assignHeaders: httpFileCell.assignHeaders,
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
  id: "@nodebooks/http-cell",
  version: "0.1.0",
  metadata: {
    name: "HTTP Cell",
    description: "Make HTTP requests and inspect responses",
    version: "0.1.0",
  },
};
