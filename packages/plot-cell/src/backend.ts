import type { FastifyInstance } from "fastify";
import type {
  NotebookStore,
  NotebookCollaboratorStore,
  SessionManager,
} from "@nodebooks/cell-plugin-api";
import { registerPlotCellRoutes } from "./backend/router.js";

/**
 * Backend route registration for plot-cell plugin.
 */
export function registerBackendRoutes(
  app: FastifyInstance,
  store: NotebookStore,
  collaborators: NotebookCollaboratorStore,
  kernelSessions?: SessionManager,
  _settingsService?: unknown,
  _authenticate?: unknown,
  getSessionGlobals?: (sessionId: string) => Record<string, unknown> | undefined
): void {
  registerPlotCellRoutes(
    app,
    store,
    collaborators,
    kernelSessions,
    getSessionGlobals
  );
}
