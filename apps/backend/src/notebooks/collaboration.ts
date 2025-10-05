import { WebSocketServer } from "ws";
import type WebSocket from "ws";
import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { customAlphabet } from "nanoid";
import { z } from "zod";
import {
  NotebookSchema,
  ensureNotebookRuntimeVersion,
  type Notebook,
} from "@nodebooks/notebook-schema";
import type {
  NotebookCollaboratorStore,
  NotebookRole,
  NotebookStore,
  SafeUser,
  AuthSession,
} from "../types.js";

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12);

const PresenceSchema = z
  .object({
    cellId: z.string().optional(),
    position: z.number().int().nonnegative().optional(),
  })
  .partial();

type PresencePayload = z.infer<typeof PresenceSchema>;

const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("request-state") }),
  z.object({
    type: z.literal("update"),
    notebook: NotebookSchema,
  }),
  z.object({
    type: z.literal("presence"),
    presence: PresenceSchema.optional(),
  }),
]);

type ClientMessage = z.infer<typeof ClientMessageSchema>;

type ServerMessage =
  | {
      type: "state";
      version: number;
      notebook: Notebook;
    }
  | {
      type: "update";
      version: number;
      notebook: Notebook;
      actorId: string;
    }
  | {
      type: "presence";
      participants: CollaborationParticipant[];
    }
  | { type: "error"; message: string };

export interface CollaborationParticipant {
  userId: string;
  name: string | null;
  color: string;
  presence: PresencePayload | null;
}

interface CollaborationClient {
  id: string;
  socket: WebSocket;
  user: SafeUser;
  role: NotebookRole;
}

interface CollaborationState {
  version: number;
  notebook: Notebook | null;
  clients: Map<string, CollaborationClient>;
  presence: Map<string, PresencePayload | null>;
}

const colorPalette = [
  "#FF6B6B",
  "#4D96FF",
  "#6BCB77",
  "#FFB74D",
  "#9C27B0",
  "#009688",
  "#FF4081",
];

const colorForUser = (userId: string): string => {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash * 31 + userId.charCodeAt(i)) & 0xffffffff;
  }
  const index = Math.abs(hash) % colorPalette.length;
  return colorPalette[index]!;
};

const sanitizeNotebook = (notebook: Notebook): Notebook => {
  return ensureNotebookRuntimeVersion(NotebookSchema.parse(notebook));
};

const serialize = (message: ServerMessage) => JSON.stringify(message);

export type AuthenticateFn = (
  req: IncomingMessage
) => Promise<{ user: SafeUser; session: AuthSession } | null>;

export class NotebookCollaborationService {
  private readonly states = new Map<string, CollaborationState>();

  constructor(
    private readonly store: NotebookStore,
    private readonly collaborators: NotebookCollaboratorStore
  ) {}

  getUpgradeHandler(prefix: string, authenticate: AuthenticateFn) {
    const wss = new WebSocketServer({ noServer: true });
    const base = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
    const pattern = new RegExp(`^${base}/ws/notebooks/([^/?#]+)/collab`);

    return (req: IncomingMessage, socket: Socket, head: Buffer): boolean => {
      const url = req.url || "";
      const match = url.match(pattern);
      if (!match) {
        return false;
      }

      const finalize = async () => {
        const auth = await authenticate(req);
        if (!auth) {
          try {
            socket.write(
              "HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n"
            );
          } catch (err) {
            void err;
          }
          try {
            socket.destroy();
          } catch (err) {
            void err;
          }
          return;
        }

        const notebookId = decodeURIComponent(match[1]!);
        const accessRole = await this.getAccessRole(notebookId, auth.user);
        if (!accessRole) {
          try {
            socket.write(
              "HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"
            );
          } catch (err) {
            void err;
          }
          try {
            socket.destroy();
          } catch (err) {
            void err;
          }
          return;
        }
        try {
          wss.handleUpgrade(req, socket, head, (ws) => {
            void this.handleConnection(
              ws as unknown as WebSocket,
              notebookId,
              auth.user,
              accessRole
            );
          });
        } catch (err) {
          try {
            socket.destroy();
          } catch (destroyError) {
            void destroyError;
          }
          void err;
        }
      };

      void finalize().catch((err) => {
        try {
          socket.destroy();
        } catch (destroyError) {
          void destroyError;
        }
        void err;
      });

      return true;
    };
  }

  private async ensureState(notebookId: string): Promise<CollaborationState> {
    let state = this.states.get(notebookId);
    if (!state) {
      const notebook = await this.store.get(notebookId);
      state = {
        version: Date.now(),
        notebook: notebook ?? null,
        clients: new Map(),
        presence: new Map(),
      };
      this.states.set(notebookId, state);
    }
    return state;
  }

  private async handleConnection(
    socket: WebSocket,
    notebookId: string,
    user: SafeUser,
    role: NotebookRole
  ) {
    const state = await this.ensureState(notebookId);
    const clientId = nanoid();
    const client: CollaborationClient = { id: clientId, socket, user, role };
    state.clients.set(clientId, client);

    const currentNotebook =
      state.notebook ?? (await this.store.get(notebookId)) ?? null;
    const notebook = currentNotebook
      ? sanitizeNotebook(currentNotebook)
      : sanitizeNotebook(
          ensureNotebookRuntimeVersion(
            NotebookSchema.parse({
              id: notebookId,
              name: "Untitled Notebook",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              cells: [],
              env: { runtime: "node", version: "latest" },
            })
          )
        );
    state.notebook = notebook;

    this.send(client, {
      type: "state",
      version: state.version,
      notebook,
    });
    this.broadcastPresence(state);

    socket.on("message", (raw) => {
      let parsed: ClientMessage;
      try {
        parsed = ClientMessageSchema.parse(JSON.parse(raw.toString("utf8")));
      } catch (err) {
        void err;
        this.send(client, { type: "error", message: "Malformed message" });
        return;
      }

      if (parsed.type === "request-state") {
        this.send(client, {
          type: "state",
          version: state.version,
          notebook: state.notebook ?? notebook,
        });
        return;
      }

      if (parsed.type === "update") {
        if (client.role !== "editor") {
          this.send(client, {
            type: "error",
            message: "Notebook access denied",
          });
          return;
        }
        void this.applyUpdate(state, client, parsed.notebook);
        return;
      }

      if (parsed.type === "presence") {
        state.presence.set(user.id, parsed.presence ?? null);
        this.broadcastPresence(state);
      }
    });

    socket.on("close", () => {
      state.clients.delete(clientId);
      state.presence.delete(user.id);
      this.broadcastPresence(state);
    });

    socket.on("error", () => {
      state.clients.delete(clientId);
      state.presence.delete(user.id);
      this.broadcastPresence(state);
    });
  }

  private async applyUpdate(
    state: CollaborationState,
    client: CollaborationClient,
    notebook: Notebook
  ) {
    try {
      const sanitized = sanitizeNotebook({
        ...notebook,
        updatedAt: new Date().toISOString(),
      });
      state.version += 1;
      state.notebook = sanitized;
      await this.store.save(sanitized);
      this.broadcast(state, {
        type: "update",
        version: state.version,
        notebook: sanitized,
        actorId: client.user.id,
      });
    } catch (err) {
      void err;
      this.send(client, {
        type: "error",
        message: "Failed to apply update",
      });
    }
  }

  private send(client: CollaborationClient, message: ServerMessage) {
    try {
      client.socket.send(serialize(message));
    } catch (err) {
      void err;
    }
  }

  private broadcast(state: CollaborationState, message: ServerMessage) {
    const payload = serialize(message);
    for (const { socket } of state.clients.values()) {
      try {
        socket.send(payload);
      } catch (err) {
        void err;
      }
    }
  }

  private broadcastPresence(state: CollaborationState) {
    const participants: CollaborationParticipant[] = [];
    for (const client of state.clients.values()) {
      const presence = state.presence.get(client.user.id) ?? null;
      participants.push({
        userId: client.user.id,
        name: client.user.name ?? client.user.email,
        color: colorForUser(client.user.id),
        presence,
      });
    }
    this.broadcast(state, { type: "presence", participants });
  }

  private async getAccessRole(
    notebookId: string,
    user: SafeUser
  ): Promise<NotebookRole | null> {
    if (user.role === "admin") {
      return "editor";
    }

    const collaborator = await this.collaborators.get(notebookId, user.id);
    if (!collaborator) {
      return null;
    }

    return collaborator.role;
  }
}
