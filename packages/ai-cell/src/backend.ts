import type { FastifyInstance } from "fastify";
import type {
  NotebookStore,
  NotebookCollaboratorStore,
  SessionManager,
} from "@nodebooks/cell-plugin-api";
import { registerAiCellRoutes } from "./backend/router.js";

// Settings service interface - will be provided by backend
interface SettingsService {
  getSettings(): Record<string, unknown>;
}

/**
 * Backend route registration for ai-cell plugin.
 * Note: This plugin requires a SettingsService which should be provided
 * by the backend when registering the plugin.
 */
export function registerBackendRoutes(
  app: FastifyInstance,
  store: NotebookStore,
  collaborators: NotebookCollaboratorStore,
  kernelSessions?: SessionManager,
  settingsService?: SettingsService
): void {
  void kernelSessions; // Not used for AI cells
  void store; // Not directly used - routes handle their own notebook access
  void collaborators; // Not directly used - routes handle their own access checks

  if (!settingsService) {
    // If no settings service provided, skip registration
    // The backend should provide this when loading plugins
    return;
  }
  void registerAiCellRoutes(app, { settings: settingsService });
}
