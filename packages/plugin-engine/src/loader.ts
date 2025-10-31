import type { CellPlugin } from "@nodebooks/cell-plugin-api";

/**
 * Plugin loader that discovers and loads plugins from various sources.
 */

/**
 * Options for loading plugins.
 */
export interface PluginLoaderOptions {
  /**
   * Path to the monorepo packages directory (for official plugins).
   */
  packagesPath?: string;

  /**
   * Path to node_modules (for third-party plugins).
   */
  nodeModulesPath?: string;

  /**
   * List of installed third-party plugin package names.
   */
  installedPlugins?: string[];
}

/**
 * Validates that a loaded module matches the CellPlugin interface.
 */
export function validatePlugin(plugin: unknown): plugin is CellPlugin {
  if (!plugin || typeof plugin !== "object") {
    return false;
  }

  const p = plugin as Record<string, unknown>;

  // Check required fields
  if (typeof p.id !== "string" || !p.id) {
    return false;
  }
  if (typeof p.version !== "string" || !p.version) {
    return false;
  }
  if (!p.metadata || typeof p.metadata !== "object") {
    return false;
  }
  if (!Array.isArray(p.cells)) {
    return false;
  }

  // Validate metadata
  const metadata = p.metadata as Record<string, unknown>;
  if (typeof metadata.name !== "string" || !metadata.name) {
    return false;
  }
  if (typeof metadata.description !== "string") {
    return false;
  }

  // Validate cells array
  if (p.cells.length === 0) {
    return false;
  }

  for (const cell of p.cells as unknown[]) {
    if (!validateCellTypeDefinition(cell)) {
      return false;
    }
  }

  return true;
}

/**
 * Validates a cell type definition.
 */
function validateCellTypeDefinition(cell: unknown): boolean {
  if (!cell || typeof cell !== "object") {
    return false;
  }

  const c = cell as Record<string, unknown>;

  // Check required fields
  if (typeof c.type !== "string" || !c.type) {
    return false;
  }
  if (!c.schema) {
    return false;
  }
  if (!c.metadata || typeof c.metadata !== "object") {
    return false;
  }
  if (!c.frontend || typeof c.frontend !== "object") {
    return false;
  }
  if (typeof c.createCell !== "function") {
    return false;
  }

  // Validate metadata
  const metadata = c.metadata as Record<string, unknown>;
  if (typeof metadata.name !== "string" || !metadata.name) {
    return false;
  }
  if (typeof metadata.description !== "string") {
    return false;
  }

  // Validate frontend
  const frontend = c.frontend as Record<string, unknown>;
  if (
    typeof frontend.Component !== "function" &&
    typeof frontend.Component !== "object"
  ) {
    return false;
  }

  return true;
}

/**
 * Discovers official plugins from the monorepo packages directory.
 * Looks for packages matching the pattern: packages/*-cell* or packages/*-cells
 */
export async function discoverOfficialPlugins(
  packagesPath: string
): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const { join } = await import("node:path");

  try {
    const entries = await readdir(packagesPath, { withFileTypes: true });
    const pluginDirs: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const name = entry.name;
      // Match patterns: *-cell, *-cells, sql-cell, terminal-cells, etc.
      if (name.includes("-cell")) {
        pluginDirs.push(join(packagesPath, name));
      }
    }

    return pluginDirs;
  } catch (error) {
    // If packages directory doesn't exist, return empty array
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

/**
 * Discovers third-party plugins from node_modules.
 * Looks for packages matching: @nodebooks/*-cell* or @nodebooks/*-cells
 */
export async function discoverThirdPartyPlugins(
  nodeModulesPath: string,
  installedPlugins: string[] = []
): Promise<string[]> {
  const { join } = await import("node:path");
  const { existsSync } = await import("node:fs");

  const pluginPaths: string[] = [];

  for (const pkgName of installedPlugins) {
    // Only process @nodebooks scoped packages
    if (!pkgName.startsWith("@nodebooks/")) {
      continue;
    }

    // Check if it matches plugin naming pattern
    if (!pkgName.includes("-cell")) {
      continue;
    }

    const pluginPath = join(nodeModulesPath, pkgName);
    if (existsSync(pluginPath)) {
      pluginPaths.push(pluginPath);
    }
  }

  return pluginPaths;
}

/**
 * Loads a plugin from a file path.
 * Supports both ES modules and CommonJS.
 */
export async function loadPluginFromPath(
  pluginPath: string
): Promise<CellPlugin | null> {
  try {
    // Try to load as ES module first
    let pluginModule:
      | { default?: CellPlugin; plugin?: CellPlugin }
      | CellPlugin;

    try {
      pluginModule = await import(pluginPath);
    } catch (_error) {
      // If ES module import fails, try CommonJS
      const { createRequire } = await import("node:module");
      const require = createRequire(import.meta.url);
      pluginModule = require(pluginPath);
    }

    // Handle different export formats
    let plugin: unknown;
    if (typeof pluginModule === "object" && pluginModule !== null) {
      // ES module with default export
      if ("default" in pluginModule && pluginModule.default) {
        plugin = pluginModule.default;
      }
      // ES module with named export
      else if ("plugin" in pluginModule && pluginModule.plugin) {
        plugin = pluginModule.plugin;
      }
      // CommonJS module
      else {
        plugin = pluginModule;
      }
    } else {
      plugin = pluginModule;
    }

    if (!validatePlugin(plugin)) {
      return null;
    }

    return plugin;
  } catch (error) {
    // Log error but don't throw - allow other plugins to load
    console.error(`Failed to load plugin from ${pluginPath}:`, error);
    return null;
  }
}
