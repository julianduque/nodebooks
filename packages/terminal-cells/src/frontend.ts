// Frontend-only exports for terminal-cells plugin
// This file excludes backend code to avoid Node.js dependencies in client bundle

import type { CellPlugin } from "@nodebooks/cell-plugin-api";
import { TerminalCellView } from "./frontend/terminal-cell-view.js";
import { CommandCellView } from "./frontend/command-cell-view.js";
import { PublicTerminalCell } from "./frontend/public/public-terminal-cell.js";
import { PublicCommandCell } from "./frontend/public/public-command-cell.js";
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
      // Backend is only loaded on server side
      backend: undefined,
      enabled: () => true,
    },
    {
      ...commandCellMetadata,
      frontend: {
        Component: CommandCellView,
        PublicComponent: PublicCommandCell,
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

export default terminalCellsPlugin;
