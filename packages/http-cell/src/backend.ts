import type { FastifyInstance } from "fastify";
import type {
  NotebookStore,
  NotebookCollaboratorStore,
  SessionManager,
} from "@nodebooks/cell-plugin-api";
import { registerHttpRoutes } from "./backend/router.js";

/**
 * Backend route registration for http-cell plugin.
 */
export function registerBackendRoutes(
  app: FastifyInstance,
  store: NotebookStore,
  collaborators: NotebookCollaboratorStore,
  kernelSessions?: SessionManager
): void {
  void kernelSessions; // Not used for HTTP cells
  registerHttpRoutes(app, store, collaborators);
}
