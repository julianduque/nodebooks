import { LineChart } from "lucide-react";
import type { CellTypeDefinition } from "@nodebooks/cell-plugin-api";
import type {
  NotebookCell,
  NotebookFileCell,
} from "@nodebooks/notebook-schema";
import {
  PlotCellSchema,
  createPlotCell,
  type PlotCell,
  type NotebookFilePlotCell,
} from "./schema.js";

const isEmptyRecord = (
  value: Record<string, unknown> | undefined | null
): boolean => {
  if (!value) return true;
  return Object.keys(value).length === 0;
};

/**
 * Shared metadata for Plot cell type.
 * Used by both frontend.ts and index.ts to avoid duplication.
 */
export const plotCellMetadata = {
  type: "plot",
  schema: PlotCellSchema as unknown as CellTypeDefinition["schema"],
  metadata: {
    name: "Plot",
    description: "Create interactive charts and visualizations",
    icon: LineChart,
  },
  createCell: ((partial?: NotebookCell) =>
    createPlotCell(
      partial as Partial<PlotCell>
    )) as CellTypeDefinition["createCell"],
  serialize: (cell: NotebookCell): NotebookFileCell => {
    const plotCell = cell as PlotCell;
    const result: NotebookFilePlotCell = {
      type: "plot",
      chartType: plotCell.chartType,
    };
    if (!isEmptyRecord(plotCell.metadata)) {
      result.metadata = plotCell.metadata;
    }
    if (plotCell.dataSource) {
      result.dataSource = plotCell.dataSource;
    }
    if (plotCell.bindings) {
      result.bindings = plotCell.bindings;
    }
    if (plotCell.layout && Object.keys(plotCell.layout).length > 0) {
      result.layout = plotCell.layout;
    }
    if (plotCell.result) {
      result.result = plotCell.result;
    }
    if (plotCell.snapshot) {
      result.snapshot = plotCell.snapshot;
    }
    return result as NotebookFileCell;
  },
  deserialize: (fileCell: NotebookFileCell): NotebookCell => {
    const plotFileCell = fileCell as NotebookFilePlotCell;
    return createPlotCell({
      metadata: plotFileCell.metadata ?? {},
      chartType: plotFileCell.chartType,
      dataSource: plotFileCell.dataSource,
      bindings: plotFileCell.bindings,
      layout: plotFileCell.layout,
      result: plotFileCell.result,
      snapshot: plotFileCell.snapshot,
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
  id: "@nodebooks/plot-cell",
  version: "0.1.0",
  metadata: {
    name: "Plot Cell",
    description: "Create interactive charts and visualizations",
    version: "0.1.0",
  },
};
