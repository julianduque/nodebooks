import type { CellPlugin } from "@nodebooks/cell-plugin-api";
import PlotCellView from "./frontend/plot-cell-view.js";
import PublicPlotCell from "./frontend/public/public-plot-cell.js";
import { registerBackendRoutes } from "./backend.js";
import { pluginMetadata, plotCellMetadata } from "./metadata.js";

export const plotCellPlugin: CellPlugin = {
  ...pluginMetadata,
  cells: [
    {
      ...plotCellMetadata,
      frontend: {
        Component: PlotCellView,
        PublicComponent: PublicPlotCell,
      },
      backend: registerBackendRoutes,
      enabled: () => true,
    },
  ],
  init: async () => {
    // No initialization needed
  },
};

export default plotCellPlugin;
