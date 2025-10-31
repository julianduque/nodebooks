import type { FastifyInstance } from "fastify";
import type {
  NotebookStore,
  NotebookCollaboratorStore,
  SessionManager,
} from "@nodebooks/cell-plugin-api";
import type { SettingsService } from "../settings/service.js";
import type { PluginSettingsManager } from "../settings/plugins.js";
import {
  CellPluginRegistry,
  discoverOfficialPlugins,
  discoverThirdPartyPlugins,
  loadPluginFromPath,
} from "@nodebooks/plugin-engine";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";

/**
 * Global plugin registry for the backend.
 * This registry is used by file serialization/deserialization to access plugin cell types.
 */
export const backendPluginRegistry = new CellPluginRegistry();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type AuthenticateFn = (req: IncomingMessage) => Promise<{
  user: { id: string; email: string };
  session: { id: string; userId: string };
} | null>;

export interface PluginContext {
  app: FastifyInstance;
  store: NotebookStore;
  collaborators: NotebookCollaboratorStore;
  kernelSessions?: SessionManager;
  settingsService?: SettingsService;
  pluginSettings?: PluginSettingsManager;
  authenticate?: AuthenticateFn;
  getSessionGlobals?: (
    sessionId: string
  ) => Record<string, unknown> | undefined;
}

export interface LoadedPlugin {
  id: string;
  version: string;
  path: string;
  wsUpgradeHandler?: (
    req: IncomingMessage,
    socket: Socket,
    head: Buffer
  ) => boolean;
}

/**
 * Loads all plugins (official and third-party) and registers their backend routes.
 * Returns an array of loaded plugins with their WebSocket upgrade handlers.
 */
export async function loadPlugins(
  context: PluginContext
): Promise<LoadedPlugin[]> {
  const loadedPlugins: LoadedPlugin[] = [];

  // Discover official plugins from monorepo packages
  // __dirname points to apps/backend/src/plugins, so we go up 4 levels to repo root
  const repoRoot = join(__dirname, "../../../..");
  const packagesPath = join(repoRoot, "packages");
  const officialPluginPaths = await discoverOfficialPlugins(packagesPath);

  context.app.log.debug(
    { paths: officialPluginPaths },
    "Discovered official plugin paths"
  );

  // Discover third-party plugins from node_modules
  const nodeModulesPath = join(repoRoot, "node_modules");
  const installedPlugins = context.pluginSettings
    ? await context.pluginSettings.getInstalledPlugins()
    : [];
  const thirdPartyPluginPaths = await discoverThirdPartyPlugins(
    nodeModulesPath,
    installedPlugins
  );

  // Load all plugins
  const allPluginPaths = [...officialPluginPaths, ...thirdPartyPluginPaths];

  for (const pluginPath of allPluginPaths) {
    try {
      // Load plugin - if it has frontend components, that's fine, we just won't use them
      const distIndexPath = join(pluginPath, "dist/index.js");
      const srcIndexPath = join(pluginPath, "src/index.ts");
      const usingDist = existsSync(distIndexPath);
      const indexPath = usingDist ? distIndexPath : srcIndexPath;

      context.app.log.debug(
        { path: indexPath },
        usingDist ? "Loading plugin build output" : "Loading plugin source"
      );
      const plugin = await loadPluginFromPath(indexPath);

      if (!plugin) {
        context.app.log.warn({ path: pluginPath }, "Failed to load plugin");
        continue;
      }

      context.app.log.info(
        { id: plugin.id, version: plugin.version },
        "Loading plugin"
      );

      // Register plugin in the global registry
      await backendPluginRegistry.register(plugin);

      // Initialize plugin if needed
      if (plugin.init) {
        await plugin.init();
      }

      // Register backend routes for each cell type
      for (const cellDef of plugin.cells) {
        if (!cellDef.backend) {
          continue;
        }

        try {
          // Special handling for plugins that require additional parameters
          // Check the backend function's parameter count to determine which arguments to pass
          let result: unknown;
          const backendFn = cellDef.backend as (...args: unknown[]) => unknown;

          // Try calling with all available parameters (7 parameters)
          if (context.getSessionGlobals && backendFn.length >= 7) {
            result = backendFn(
              context.app,
              context.store,
              context.collaborators,
              context.kernelSessions,
              context.settingsService,
              context.authenticate,
              context.getSessionGlobals
            );
          } else if (context.authenticate && backendFn.length >= 6) {
            // Try calling with authenticate function if available (6 parameters)
            result = backendFn(
              context.app,
              context.store,
              context.collaborators,
              context.kernelSessions,
              context.settingsService,
              context.authenticate
            );
          } else if (context.settingsService && backendFn.length >= 5) {
            // Try calling with settingsService if available (5 parameters)
            result = backendFn(
              context.app,
              context.store,
              context.collaborators,
              context.kernelSessions,
              context.settingsService
            );
          } else {
            // Standard call without additional parameters (4 parameters)
            result = backendFn(
              context.app,
              context.store,
              context.collaborators,
              context.kernelSessions
            );
          }

          // Check if it returned a WebSocket upgrade handler
          if (typeof result === "function") {
            // Check if this plugin is already registered
            const existing = loadedPlugins.find((p) => p.id === plugin.id);
            if (existing) {
              existing.wsUpgradeHandler = result as (
                req: IncomingMessage,
                socket: Socket,
                head: Buffer
              ) => boolean;
            } else {
              loadedPlugins.push({
                id: plugin.id,
                version: plugin.version,
                path: pluginPath,
                wsUpgradeHandler: result as (
                  req: IncomingMessage,
                  socket: Socket,
                  head: Buffer
                ) => boolean,
              });
            }
          } else {
            // Check if this plugin is already registered
            const existing = loadedPlugins.find((p) => p.id === plugin.id);
            if (!existing) {
              loadedPlugins.push({
                id: plugin.id,
                version: plugin.version,
                path: pluginPath,
              });
            }
          }

          context.app.log.info(
            { pluginId: plugin.id, cellType: cellDef.type },
            "Registered backend routes for cell type"
          );
        } catch (error) {
          context.app.log.error(
            { pluginId: plugin.id, cellType: cellDef.type, error },
            "Failed to register backend routes"
          );
        }
      }
    } catch (error) {
      context.app.log.error(
        { path: pluginPath, error },
        "Failed to load plugin"
      );
    }
  }

  return loadedPlugins;
}
