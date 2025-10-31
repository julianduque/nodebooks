// Frontend-only exports for plot-cell plugin
import type { CellPlugin } from "@nodebooks/cell-plugin-api";
import { LineChart } from "lucide-react";
import PlotCellView from "./frontend/plot-cell-view.js";
import PublicPlotCell from "./frontend/public/public-plot-cell.js";
import { pluginMetadata, plotCellMetadata } from "./metadata.js";

export const plotCellPlugin: CellPlugin = {
  ...pluginMetadata,
  cells: [
    {
      ...plotCellMetadata,
      // Override metadata with frontend-specific icon
      metadata: {
        ...plotCellMetadata.metadata,
        icon: LineChart,
      },
      frontend: {
        Component: PlotCellView,
        PublicComponent: PublicPlotCell,
      },
      // Backend is only loaded on server side
      backend: undefined,
      enabled: () => true,
    },
  ],
  init: async () => {
    // No initialization needed
  },
};

export default plotCellPlugin;
