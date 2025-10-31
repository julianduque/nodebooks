import type { CellPlugin } from "@nodebooks/cell-plugin-api";
import { TerminalCellView } from "./frontend/terminal-cell-view.js";
import { CommandCellView } from "./frontend/command-cell-view.js";
import { PublicTerminalCell } from "./frontend/public/public-terminal-cell.js";
import { PublicCommandCell } from "./frontend/public/public-command-cell.js";
import { registerBackendRoutes } from "./backend.js";
import {
  pluginMetadata,
  terminalCellMetadata,
  commandCellMetadata,
} from "./metadata.js";

export const terminalCellsPlugin: CellPlugin = {
  ...pluginMetadata,
  cells: [
    {
      ...terminalCellMetadata,
      frontend: {
        Component: TerminalCellView,
        PublicComponent: PublicTerminalCell,
      },
      backend: registerBackendRoutes,
      enabled: () => true,
    },
    {
      ...commandCellMetadata,
      frontend: {
        Component: CommandCellView,
        PublicComponent: PublicCommandCell,
      },
      backend: registerBackendRoutes,
      enabled: () => true,
    },
  ],
  init: async () => {
    // No initialization needed
  },
};

export default terminalCellsPlugin;
