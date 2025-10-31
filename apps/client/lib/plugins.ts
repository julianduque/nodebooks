"use client";

import { CellPluginRegistry } from "@nodebooks/plugin-engine/frontend";
import type {
  CellPlugin,
  CellTypeDefinition,
} from "@nodebooks/cell-plugin-api";

// Import official plugins - frontend-only versions
import terminalCellsPlugin from "@nodebooks/terminal-cells/frontend";
import sqlCellPlugin from "@nodebooks/sql-cell/frontend";
import httpCellPlugin from "@nodebooks/http-cell/frontend";
import plotCellPlugin from "@nodebooks/plot-cell/frontend";
import aiCellPlugin from "@nodebooks/ai-cell/frontend";

/**
 * Frontend plugin registry singleton.
 * Manages all loaded plugins and their cell type definitions.
 */
class FrontendPluginRegistry {
  private registry: CellPluginRegistry;
  private initialized = false;

  constructor() {
    this.registry = new CellPluginRegistry();
    // Register plugins synchronously in constructor for immediate availability
    this.initializeSync();
  }

  /**
   * Synchronously register all official plugins.
   * This ensures plugins are available immediately, even before async init completes.
   */
  private initializeSync(): void {
    if (this.initialized) {
      return;
    }

    // Register official plugins synchronously
    const officialPlugins: CellPlugin[] = [
      terminalCellsPlugin,
      sqlCellPlugin,
      httpCellPlugin,
      plotCellPlugin,
      aiCellPlugin,
    ];

    for (const plugin of officialPlugins) {
      try {
        // Register plugin synchronously (the async init happens later)
        this.registry.registerSync(plugin);
        // Enable by default - will be synced with backend later
        this.registry.setPluginEnabled(plugin.id, true);
      } catch (error) {
        console.error(`Failed to register plugin ${plugin.id}:`, error);
      }
    }

    this.initialized = true;
  }

  /**
   * Initialize the plugin registry by calling init() on all plugins.
   * Plugins are already registered synchronously in the constructor.
   * This should be called once during app initialization.
   */
  async initialize(): Promise<void> {
    // Plugins are already registered in initializeSync()
    // This method now just calls their init() functions
    const officialPlugins: CellPlugin[] = [
      terminalCellsPlugin,
      sqlCellPlugin,
      httpCellPlugin,
      plotCellPlugin,
      aiCellPlugin,
    ];

    for (const plugin of officialPlugins) {
      try {
        // Call plugin init if it exists
        if (plugin.init) {
          await plugin.init();
        }
      } catch (error) {
        console.error(`Failed to initialize plugin ${plugin.id}:`, error);
      }
    }

    // TODO: Load third-party plugins from backend API
  }

  /**
   * Get a cell type definition by type string.
   */
  getCellType(type: string): CellTypeDefinition | undefined {
    return this.registry.getCellType(type);
  }

  /**
   * Get all registered cell types.
   */
  getAllCellTypes(): CellTypeDefinition[] {
    return this.registry.getAllCellTypes();
  }

  /**
   * Get enabled cell types synchronously (for use in hooks/useMemo).
   * This returns cell types that are enabled in the registry's internal state.
   * Note: This may not reflect backend state until syncWithBackend() is called.
   */
  getEnabledCellTypesSync(): CellTypeDefinition[] {
    return this.registry.getEnabledCellTypesSync();
  }

  /**
   * Get all enabled cell types.
   */
  async getEnabledCellTypes(): Promise<CellTypeDefinition[]> {
    return await this.registry.getEnabledCellTypes();
  }

  /**
   * Check if a cell type is enabled synchronously.
   * Does NOT call the cell type's enabled() function.
   */
  isCellTypeEnabledSync(cellType: string): boolean {
    return this.registry.isCellTypeEnabledSync(cellType);
  }

  /**
   * Check if a cell type is enabled.
   */
  async isEnabled(cellType: string): Promise<boolean> {
    return this.registry.isEnabled(cellType);
  }

  /**
   * Get all registered plugins.
   */
  getAllPlugins(): CellPlugin[] {
    return this.registry.getAllPlugins();
  }

  /**
   * Sync plugin state with backend.
   * This fetches the list of plugins from the backend and updates enabled/disabled state.
   */
  async syncWithBackend(): Promise<void> {
    try {
      const response = await fetch("/api/settings/plugins");
      if (!response.ok) {
        console.warn(
          "Failed to fetch plugin state from backend - keeping current state"
        );
        // Keep plugins enabled by default for public views
        return;
      }

      const data = (await response.json()) as {
        data: Array<{
          id: string;
          enabled: boolean;
        }>;
      };

      // Update plugin enabled state based on backend response
      for (const pluginInfo of data.data) {
        const plugin = this.registry.getPlugin(pluginInfo.id);
        if (plugin) {
          this.registry.setPluginEnabled(pluginInfo.id, pluginInfo.enabled);
        }
      }
    } catch (error) {
      console.error("Failed to sync plugin state with backend:", error);
      // Keep current state on error (plugins remain enabled)
    }
  }
}

// Export singleton instance
export const pluginRegistry = new FrontendPluginRegistry();
