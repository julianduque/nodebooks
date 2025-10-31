import type { FastifyInstance } from "fastify";
import type { ZodTypeAny } from "zod";
import type {
  NotebookCell,
  Notebook,
  NotebookFileCell,
} from "@nodebooks/notebook-schema";
import type { ComponentType } from "react";

/**
 * Backend store interfaces required by plugins.
 * These match the interfaces defined in apps/backend/src/types.ts
 */

/**
 * Notebook attachment interface.
 */
export interface NotebookAttachment {
  id: string;
  notebookId: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Notebook attachment with content.
 */
export interface NotebookAttachmentContent extends NotebookAttachment {
  content: Uint8Array;
}

/**
 * Store interface for notebook persistence.
 */
export interface NotebookStore {
  all(): Promise<Notebook[]>;
  get(id: string): Promise<Notebook | undefined>;
  getByPublicSlug(slug: string): Promise<Notebook | undefined>;
  save(notebook: Notebook): Promise<Notebook>;
  remove(id: string): Promise<Notebook | undefined>;
  listAttachments(notebookId: string): Promise<NotebookAttachment[]>;
  getAttachment(
    notebookId: string,
    attachmentId: string
  ): Promise<NotebookAttachmentContent | undefined>;
  saveAttachment(
    notebookId: string,
    input: {
      filename: string;
      mimeType: string;
      content: Uint8Array;
    }
  ): Promise<NotebookAttachment>;
  removeAttachment(notebookId: string, attachmentId: string): Promise<boolean>;
}

/**
 * Store interface for notebook collaboration.
 */
export interface NotebookCollaboratorStore {
  listByNotebook(notebookId: string): Promise<NotebookCollaborator[]>;
  listNotebookIdsForUser(userId: string): Promise<string[]>;
  listForUser(userId: string): Promise<NotebookCollaborator[]>;
  get(
    notebookId: string,
    userId: string
  ): Promise<NotebookCollaborator | undefined>;
  upsert(input: {
    notebookId: string;
    userId: string;
    role: NotebookRole;
  }): Promise<NotebookCollaborator>;
  updateRole(
    notebookId: string,
    userId: string,
    role: NotebookRole
  ): Promise<NotebookCollaborator | undefined>;
  remove(notebookId: string, userId: string): Promise<boolean>;
}

/**
 * Notebook collaborator interface.
 */
export interface NotebookCollaborator {
  notebookId: string;
  userId: string;
  role: NotebookRole;
}

/**
 * Notebook role type.
 */
export type NotebookRole = "owner" | "editor" | "viewer";

/**
 * Session manager interface for kernel sessions.
 */
export interface SessionManager {
  createSession(notebookId: string): Promise<NotebookSession>;
  closeSession(sessionId: string): Promise<NotebookSession | undefined>;
  listSessions(notebookId?: string): Promise<NotebookSession[]>;
}

/**
 * Notebook session interface.
 */
export interface NotebookSession {
  id: string;
  notebookId: string;
  status: "open" | "closed";
}

/**
 * Frontend component exports for a cell type.
 */
export interface CellFrontendComponents {
  /**
   * Main cell editor component used in the notebook editor.
   * Props: { cell, onChange, path?, notebookId }
   */
  Component: ComponentType<CellComponentProps>;

  /**
   * Optional public view component for published notebooks.
   * Props: { cell }
   */
  PublicComponent?: ComponentType<PublicCellComponentProps>;
}

/**
 * Props passed to the main cell editor component.
 */
export interface CellComponentProps {
  cell: NotebookCell;
  onChange: (
    updater: (cell: NotebookCell) => NotebookCell,
    options?: { persist?: boolean; touch?: boolean }
  ) => void;
  path?: string;
  notebookId: string;
  onRun?: () => void;
  readOnly?: boolean;
  pendingPersist?: boolean;
}

/**
 * Props passed to the public cell component.
 */
export interface PublicCellComponentProps {
  cell: NotebookCell;
  userAvatarUrl?: string | null;
}

import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";

/**
 * Backend route registration function signature.
 * Can return a WebSocket upgrade handler function that will be called from the server's upgrade handler.
 */
export type BackendRouteRegistrar = (
  app: FastifyInstance,
  store: NotebookStore,
  collaborators: NotebookCollaboratorStore,
  kernelSessions?: SessionManager
) => void | ((req: IncomingMessage, socket: Socket, head: Buffer) => boolean);

/**
 * Factory function to create a new cell of this type.
 */
export type CellFactory = () => NotebookCell;

/**
 * Optional function to check if a cell type should be enabled.
 * Returns true if the cell type should be available, false otherwise.
 */
export type CellEnabledChecker = () => boolean | Promise<boolean>;

/**
 * Definition for a single cell type within a plugin.
 */
export interface CellTypeDefinition {
  /**
   * Unique cell type identifier (e.g., "sql", "http", "plot", "terminal").
   * Must match the cell type in the notebook schema.
   */
  type: string;

  /**
   * Zod schema for validating cell data.
   * Should match the schema for this cell type in @nodebooks/notebook-schema.
   */
  schema: ZodTypeAny;

  /**
   * Cell metadata displayed in the UI.
   */
  metadata: {
    name: string;
    description: string;
    icon?: ComponentType<{ className?: string }>;
  };

  /**
   * Frontend React components for this cell type.
   */
  frontend: CellFrontendComponents;

  /**
   * Optional backend route registration function.
   * Called during plugin initialization to register API routes.
   */
  backend?: BackendRouteRegistrar;

  /**
   * Factory function to create a new cell of this type.
   */
  createCell: CellFactory;

  /**
   * Optional function to check if this cell type should be enabled.
   * Can be used to gate cell types behind feature flags or settings.
   */
  enabled?: CellEnabledChecker;

  /**
   * Serialize a runtime cell to file format.
   * Converts from the runtime cell format (with id, full metadata) to the
   * file format (without id, optional fields omitted for compactness).
   * This is called when saving notebooks to disk.
   */
  serialize?: (cell: NotebookCell) => NotebookFileCell;

  /**
   * Deserialize a file cell to runtime format.
   * Converts from the file format to the runtime format by generating
   * an id and applying default values for optional fields.
   * This is called when loading notebooks from disk.
   */
  deserialize?: (fileCell: NotebookFileCell) => NotebookCell;
}

/**
 * Plugin metadata displayed in the UI.
 */
export interface PluginMetadata {
  name: string;
  description: string;
  author?: string;
  homepage?: string;
  version: string;
}

/**
 * Plugin initialization function signature.
 * Called once when the plugin is loaded.
 */
export type PluginInitFunction = () => void | Promise<void>;

/**
 * Main plugin interface that all cell plugins must export.
 */
export interface CellPlugin {
  /**
   * Unique plugin identifier (e.g., "@nodebooks/sql-cell", "my-org/custom-cell").
   * Should match the npm package name for third-party plugins.
   */
  id: string;

  /**
   * Plugin version (semver).
   */
  version: string;

  /**
   * Plugin metadata for display in UI.
   */
  metadata: PluginMetadata;

  /**
   * Array of cell type definitions this plugin provides.
   * A plugin can register multiple cell types (e.g., terminal-cells plugin
   * registers both "terminal" and "command" cell types).
   */
  cells: CellTypeDefinition[];

  /**
   * Optional initialization function called once when the plugin is loaded.
   * Use this for one-time setup or side effects.
   */
  init?: PluginInitFunction;
}
