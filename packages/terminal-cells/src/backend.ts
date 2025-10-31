import type { FastifyInstance } from "fastify";
import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import type {
  NotebookStore,
  NotebookCollaboratorStore,
  SessionManager,
} from "@nodebooks/cell-plugin-api";
import {
  createTerminalUpgradeHandler,
  type TerminalUpgradeAuthResult,
} from "./backend/router.js";

type TerminalAuthenticateFn = (
  req: IncomingMessage
) => Promise<TerminalUpgradeAuthResult | null>;

/**
 * Backend route registration for terminal-cells plugin.
 * Returns the WebSocket upgrade handler function that should be called
 * from the server's upgrade handler.
 *
 * @param app - Fastify instance
 * @param store - Notebook store
 * @param collaborators - Collaborator store
 * @param kernelSessions - Optional kernel sessions manager
 * @param authenticate - Optional authentication function for WebSocket upgrades
 */
export function registerBackendRoutes(
  app: FastifyInstance,
  store: NotebookStore,
  collaborators: NotebookCollaboratorStore,
  kernelSessions?: SessionManager,
  authenticate?: TerminalAuthenticateFn
): (req: IncomingMessage, socket: Socket, head: Buffer) => boolean {
  void kernelSessions; // Not used for terminal cells
  void collaborators; // Not used for terminal cells

  // Create and return the upgrade handler
  // The server will call this in its upgrade handler
  return createTerminalUpgradeHandler("/api", store, {
    authenticate: authenticate ?? (async () => null),
  });
}
