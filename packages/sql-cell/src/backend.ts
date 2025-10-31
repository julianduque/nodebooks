import type { FastifyInstance } from "fastify";
import type {
  NotebookStore,
  NotebookCollaboratorStore,
  SessionManager,
} from "@nodebooks/cell-plugin-api";
import { registerSqlRoutes } from "./backend/router.js";

/**
 * Backend route registration for sql-cell plugin.
 */
export function registerBackendRoutes(
  app: FastifyInstance,
  store: NotebookStore,
  collaborators: NotebookCollaboratorStore,
  kernelSessions?: SessionManager
): void {
  void kernelSessions; // Not used for SQL cells
  registerSqlRoutes(app, store, collaborators);
}
