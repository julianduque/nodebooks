import type {
  CellPlugin,
  CellTypeDefinition,
} from "@nodebooks/cell-plugin-api";

/**
 * Plugin registry that manages loaded plugins and their cell types.
 */
export class CellPluginRegistry {
  private plugins = new Map<string, CellPlugin>();
  private cellTypes = new Map<string, CellTypeDefinition>();
  private pluginIdByCellType = new Map<string, string>();
  private enabledPlugins = new Set<string>();
  private enabledCellTypes = new Set<string>();

  /**
   * Register a plugin and all its cell types synchronously.
   * Does not call plugin.init() - use initializePlugin() for that.
   */
  registerSync(plugin: CellPlugin): void {
    // Validate plugin ID uniqueness
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin with ID "${plugin.id}" is already registered`);
    }

    // Validate cell type uniqueness
    for (const cellDef of plugin.cells) {
      if (this.cellTypes.has(cellDef.type)) {
        const existingPluginId = this.pluginIdByCellType.get(cellDef.type);
        throw new Error(
          `Cell type "${cellDef.type}" is already registered by plugin "${existingPluginId}"`
        );
      }
    }

    // Register plugin
    this.plugins.set(plugin.id, plugin);
    this.enabledPlugins.add(plugin.id);

    // Register all cell types
    for (const cellDef of plugin.cells) {
      this.cellTypes.set(cellDef.type, cellDef);
      this.pluginIdByCellType.set(cellDef.type, plugin.id);
      this.enabledCellTypes.add(cellDef.type);
    }
  }

  /**
   * Register a plugin and all its cell types (async version that calls init).
   */
  async register(plugin: CellPlugin): Promise<void> {
    // Register synchronously first
    this.registerSync(plugin);

    // Call plugin init if provided
    if (plugin.init) {
      await plugin.init();
    }
  }

  /**
   * Get a plugin by its ID.
   */
  getPlugin(id: string): CellPlugin | undefined {
    return this.plugins.get(id);
  }

  /**
   * Get a cell type definition by its type string.
   */
  getCellType(type: string): CellTypeDefinition | undefined {
    return this.cellTypes.get(type);
  }

  /**
   * Get all registered plugins.
   */
  getAllPlugins(): CellPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get all registered cell types.
   */
  getAllCellTypes(): CellTypeDefinition[] {
    return Array.from(this.cellTypes.values());
  }

  /**
   * Get enabled cell types synchronously (for use in hooks/useMemo).
   * This checks the internal enabled state without async calls.
   */
  getEnabledCellTypesSync(): CellTypeDefinition[] {
    const enabled: CellTypeDefinition[] = [];
    for (const cellDef of this.cellTypes.values()) {
      const pluginId = this.pluginIdByCellType.get(cellDef.type);
      if (!pluginId) continue;

      // Check if plugin is enabled
      if (!this.enabledPlugins.has(pluginId)) continue;

      // Check if cell type is enabled
      if (!this.enabledCellTypes.has(cellDef.type)) continue;

      enabled.push(cellDef);
    }
    return enabled;
  }

  /**
   * Get all enabled cell types (filtered by enabled status).
   */
  async getEnabledCellTypes(): Promise<CellTypeDefinition[]> {
    const enabled: CellTypeDefinition[] = [];

    for (const cellDef of this.cellTypes.values()) {
      if (await this.isEnabled(cellDef.type)) {
        enabled.push(cellDef);
      }
    }

    return enabled;
  }

  /**
   * Check if a cell type is enabled synchronously.
   * Checks both plugin and cell type enabled status.
   * Does NOT call the cell type's enabled() function.
   */
  isCellTypeEnabledSync(cellType: string): boolean {
    const cellDef = this.cellTypes.get(cellType);
    if (!cellDef) {
      return false;
    }

    const pluginId = this.pluginIdByCellType.get(cellType);
    if (!pluginId) {
      return false;
    }

    // Check plugin enabled status
    if (!this.enabledPlugins.has(pluginId)) {
      return false;
    }

    // Check cell type enabled status
    if (!this.enabledCellTypes.has(cellType)) {
      return false;
    }

    return true;
  }

  /**
   * Check if a cell type is enabled.
   * Checks both plugin and cell type enabled status, and calls the cell type's enabled() function if provided.
   */
  async isEnabled(cellType: string): Promise<boolean> {
    const cellDef = this.cellTypes.get(cellType);
    if (!cellDef) {
      return false;
    }

    const pluginId = this.pluginIdByCellType.get(cellType);
    if (!pluginId) {
      return false;
    }

    // Check plugin enabled status
    if (!this.enabledPlugins.has(pluginId)) {
      return false;
    }

    // Check cell type enabled status
    if (!this.enabledCellTypes.has(cellType)) {
      return false;
    }

    // Call cell type's enabled() function if provided
    if (cellDef.enabled) {
      return await cellDef.enabled();
    }

    return true;
  }

  /**
   * Enable or disable a plugin.
   */
  setPluginEnabled(pluginId: string, enabled: boolean): void {
    if (!this.plugins.has(pluginId)) {
      throw new Error(`Plugin "${pluginId}" is not registered`);
    }

    if (enabled) {
      this.enabledPlugins.add(pluginId);
      // Enable all cell types for this plugin
      const plugin = this.plugins.get(pluginId)!;
      for (const cellDef of plugin.cells) {
        this.enabledCellTypes.add(cellDef.type);
      }
    } else {
      this.enabledPlugins.delete(pluginId);
      // Disable all cell types for this plugin
      const plugin = this.plugins.get(pluginId)!;
      for (const cellDef of plugin.cells) {
        this.enabledCellTypes.delete(cellDef.type);
      }
    }
  }

  /**
   * Enable or disable a specific cell type.
   */
  setCellTypeEnabled(cellType: string, enabled: boolean): void {
    if (!this.cellTypes.has(cellType)) {
      throw new Error(`Cell type "${cellType}" is not registered`);
    }

    if (enabled) {
      this.enabledCellTypes.add(cellType);
    } else {
      this.enabledCellTypes.delete(cellType);
    }
  }

  /**
   * Unregister a plugin and all its cell types.
   */
  unregister(pluginId: string): void {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      return;
    }

    // Remove all cell types
    for (const cellDef of plugin.cells) {
      this.cellTypes.delete(cellDef.type);
      this.pluginIdByCellType.delete(cellDef.type);
      this.enabledCellTypes.delete(cellDef.type);
    }

    // Remove plugin
    this.plugins.delete(pluginId);
    this.enabledPlugins.delete(pluginId);
  }

  /**
   * Clear all registered plugins.
   */
  clear(): void {
    this.plugins.clear();
    this.cellTypes.clear();
    this.pluginIdByCellType.clear();
    this.enabledPlugins.clear();
    this.enabledCellTypes.clear();
  }
}
