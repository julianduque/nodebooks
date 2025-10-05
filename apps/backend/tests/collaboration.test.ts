import { describe, expect, it, vi, beforeEach } from "vitest";

const handleUpgradeSpy = vi.fn();

vi.mock("ws", () => {
  class FakeWebSocket {
    send() {}
    on() {}
    close() {}
  }

  class FakeWebSocketServer {
    handleUpgrade(
      req: unknown,
      socket: unknown,
      head: unknown,
      cb: (ws: unknown) => void
    ) {
      handleUpgradeSpy(req, socket, head);
      cb(new FakeWebSocket());
    }
  }

  return {
    WebSocketServer: FakeWebSocketServer,
  };
});
import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";

import { NotebookCollaborationService } from "../src/notebooks/collaboration.js";
import type {
  AuthSession,
  NotebookCollaborator,
  NotebookCollaboratorStore,
  NotebookRole,
  NotebookStore,
  SafeUser,
} from "../src/types.js";
import type { Notebook } from "@nodebooks/notebook-schema";

const viewerUser: SafeUser = {
  id: "user-viewer",
  email: "viewer@example.com",
  name: "Viewer",
  role: "viewer",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const editorUser: SafeUser = {
  id: "user-editor",
  email: "editor@example.com",
  name: "Editor",
  role: "editor",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const adminSession: AuthSession = {
  id: "session",
  userId: "user",
  tokenHash: "hash",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  expiresAt: new Date().toISOString(),
  revokedAt: null,
};

class FakeSocket extends EventEmitter {
  public sent: string[] = [];

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.emit("close");
  }
}

const baseNotebook: Notebook = {
  id: "nb-1",
  name: "Notebook",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  cells: [],
  env: { runtime: "node", version: "latest" },
};

const createStore = () => {
  return {
    all: vi.fn(),
    get: vi.fn(async () => baseNotebook),
    save: vi.fn(async (input: Notebook) => input),
    remove: vi.fn(),
    listAttachments: vi.fn(),
    getAttachment: vi.fn(),
    saveAttachment: vi.fn(),
    removeAttachment: vi.fn(),
  } satisfies Partial<NotebookStore> as NotebookStore;
};

const createCollaborators = (collaborators: Record<string, NotebookRole>) => {
  return {
    listByNotebook: vi.fn(),
    listNotebookIdsForUser: vi.fn(),
    listForUser: vi.fn(),
    get: vi.fn(async (notebookId: string, userId: string) => {
      const role = collaborators[`${notebookId}:${userId}`];
      if (!role) return undefined;
      const collaborator: NotebookCollaborator = {
        id: `collab-${userId}`,
        notebookId,
        userId,
        role,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      return collaborator;
    }),
    upsert: vi.fn(),
    updateRole: vi.fn(),
    remove: vi.fn(),
  } satisfies Partial<NotebookCollaboratorStore> as NotebookCollaboratorStore;
};

describe("NotebookCollaborationService authorization", () => {
  beforeEach(() => {
    vi.useRealTimers();
    handleUpgradeSpy.mockReset();
  });

  it("denies websocket upgrades when the user lacks access", async () => {
    const store = createStore();
    const collaborators = createCollaborators({});
    const service = new NotebookCollaborationService(store, collaborators);

    const handler = service.getUpgradeHandler("/api", async () => ({
      user: viewerUser,
      session: adminSession,
    }));

    const req = { url: "/api/ws/notebooks/nb-1/collab" } as IncomingMessage;
    const write = vi.fn();
    const destroy = vi.fn();
    const socket = { write, destroy } as unknown as Socket;

    const handled = handler(req, socket, Buffer.alloc(0));
    expect(handled).toBe(true);

    await new Promise((resolve) => setImmediate(resolve));

    expect(collaborators.get).toHaveBeenCalledWith("nb-1", viewerUser.id);
    expect(handleUpgradeSpy).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining("403 Forbidden")
    );
    expect(destroy).toHaveBeenCalled();
  });

  it("rejects updates from viewers even after connection", async () => {
    const store = createStore();
    const collaborators = createCollaborators({ "nb-1:user-viewer": "viewer" });
    const service = new NotebookCollaborationService(store, collaborators);

    const socket = new FakeSocket();
    await (service as unknown as {
      handleConnection(
        socket: FakeSocket,
        notebookId: string,
        user: SafeUser,
        role: NotebookRole
      ): Promise<void>;
    }).handleConnection(socket, "nb-1", viewerUser, "viewer");

    const updatePayload = {
      type: "update" as const,
      notebook: baseNotebook,
    };

    socket.emit("message", Buffer.from(JSON.stringify(updatePayload)));

    await new Promise((resolve) => setImmediate(resolve));

    expect(store.save).not.toHaveBeenCalled();
    const parsedMessages = socket.sent.map((payload) => JSON.parse(payload));
    const errorMessage = parsedMessages.find((msg) => msg.type === "error");
    expect(errorMessage?.message).toContain("Notebook access denied");
  });

  it("allows editors to persist updates", async () => {
    const store = createStore();
    const collaborators = createCollaborators({ "nb-1:user-editor": "editor" });
    const service = new NotebookCollaborationService(store, collaborators);

    const socket = new FakeSocket();
    await (service as unknown as {
      handleConnection(
        socket: FakeSocket,
        notebookId: string,
        user: SafeUser,
        role: NotebookRole
      ): Promise<void>;
    }).handleConnection(socket, "nb-1", editorUser, "editor");

    const updateNotebook = {
      ...baseNotebook,
      name: "Updated",
    } satisfies Notebook;

    socket.emit(
      "message",
      Buffer.from(
        JSON.stringify({ type: "update", notebook: updateNotebook })
      )
    );

    await new Promise((resolve) => setImmediate(resolve));

    expect(store.save).toHaveBeenCalledWith(expect.objectContaining({
      id: "nb-1",
      name: "Updated",
    }));
    const parsedMessages = socket.sent.map((payload) => JSON.parse(payload));
    const updateMessage = parsedMessages.find((msg) => msg.type === "update");
    expect(updateMessage?.notebook?.name).toBe("Updated");
    expect(updateMessage?.actorId).toBe(editorUser.id);
  });
});
