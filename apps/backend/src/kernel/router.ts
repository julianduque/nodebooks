import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import WebSocket, { WebSocketServer, type RawData } from "ws";
import { z } from "zod";
import {
  KernelClientMessageSchema,
  type KernelClientMessage,
  type KernelExecuteRequest,
  type KernelServerMessage,
} from "@nodebooks/notebook-schema";
import type {
  NotebookStore,
  SessionManager,
  NotebookSession,
} from "../types.js";
import { NotebookRuntime } from "./runtime.js";

const runtimes = new Map<string, NotebookRuntime>();

// WebSocket connections at `${prefix}/ws/sessions/:id` using `ws` directly.
export const createKernelUpgradeHandler = (
  prefix: string,
  sessions: SessionManager,
  store: NotebookStore
) => {
  const wss = new WebSocketServer({ noServer: true });
  const base = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  const pattern = new RegExp(`^${base}/ws/sessions/([^/?#]+)`);

  return (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const url = req.url || "";
    const m = url.match(pattern);
    if (!m) return false;
    const id = decodeURIComponent(m[1]!);
    try {
      wss.handleUpgrade(req, socket, head, (ws) => {
        void handleConnection(
          ws as unknown as WebSocket,
          { id },
          sessions,
          store
        );
      });
    } catch (err) {
      try {
        socket.destroy();
      } catch (e) {
        void e;
      }
      void err;
    }
    return true;
  };
};

const handleConnection = async (
  connection: WebSocket,
  params: unknown,
  sessions: SessionManager,
  store: NotebookStore
) => {
  const { id } = z.object({ id: z.string() }).parse(params);
  const allSessions = await sessions.listSessions();
  const session = allSessions.find((item) => item.id === id);
  if (!session) {
    sendMessage(connection, {
      type: "error",
      cellId: "",
      ename: "SessionNotFound",
      evalue: "Session not found",
      traceback: [],
    });
    connection.close(1011, "Session not found");
    return;
  }

  const notebook = await store.get(session.notebookId);
  if (!notebook) {
    sendMessage(connection, {
      type: "error",
      cellId: "",
      ename: "NotebookNotFound",
      evalue: "Notebook not found",
      traceback: [],
    });
    connection.close(1011, "Notebook not found");
    return;
  }

  sendMessage(connection, {
    type: "hello",
    notebookId: notebook.id,
    sessionId: session.id,
  });

  const runtime = ensureRuntime(session.id);

  connection.on("message", async (raw: RawData) => {
    const parsed = parseClientMessage(raw);
    if (!parsed.success) {
      sendMessage(connection, {
        type: "error",
        cellId: "",
        ename: "InvalidMessage",
        evalue: "Received malformed kernel message",
        traceback: parsed.error.issues.map(
          (issue) => issue.message ?? String(issue)
        ),
      });
      return;
    }

    try {
      await handleKernelMessage({
        connection,
        message: parsed.data,
        runtime,
        session,
        store,
      });
    } catch (error) {
      const cellId =
        parsed.data.type === "execute_request" ? parsed.data.cellId : "";
      sendMessage(connection, {
        type: "error",
        cellId,
        ename: "KernelError",
        evalue:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred while handling the kernel message",
        traceback: [],
      });
    }
  });

  connection.on("close", () => {
    runtimes.delete(session.id);
    void sessions.closeSession(session.id);
  });
};

const parseClientMessage = (payload: unknown) => {
  try {
    let raw: string;
    if (typeof payload === "string") {
      raw = payload;
    } else if (payload instanceof Buffer) {
      raw = payload.toString();
    } else if (
      typeof payload === "object" &&
      payload !== null &&
      "toString" in payload
    ) {
      raw = (payload as { toString(): string }).toString();
    } else {
      throw new Error("Unsupported message payload");
    }
    const json = JSON.parse(raw);
    return KernelClientMessageSchema.safeParse(json);
  } catch (error) {
    return {
      success: false as const,
      error: {
        issues: [
          {
            message:
              error instanceof Error
                ? error.message
                : "Unable to parse kernel message",
          },
        ],
      },
    };
  }
};

interface HandleMessageArgs {
  connection: WebSocket;
  message: KernelClientMessage;
  runtime: NotebookRuntime;
  session: NotebookSession;
  store: NotebookStore;
}

const handleKernelMessage = async ({
  connection,
  message,
  runtime,
  session,
  store,
}: HandleMessageArgs) => {
  switch (message.type) {
    case "execute_request":
      await handleExecuteRequest({
        connection,
        message,
        runtime,
        session,
        store,
      });
      break;
    case "interrupt_request":
      sendMessage(connection, { type: "status", state: "idle" });
      break;
  }
};

interface ExecuteArgs {
  connection: WebSocket;
  message: KernelExecuteRequest;
  runtime: NotebookRuntime;
  session: NotebookSession;
  store: NotebookStore;
}

const handleExecuteRequest = async ({
  connection,
  message,
  runtime,
  session,
  store,
}: ExecuteArgs) => {
  const notebook = await store.get(session.notebookId);
  if (!notebook) {
    sendMessage(connection, {
      type: "error",
      cellId: message.cellId,
      ename: "NotebookNotFound",
      evalue: "Notebook not found for execution",
      traceback: [],
    });
    return;
  }

  const cell = notebook.cells.find((item) => item.id === message.cellId);
  if (!cell || cell.type !== "code") {
    sendMessage(connection, {
      type: "error",
      cellId: message.cellId,
      ename: "CellNotRunnable",
      evalue: "Cell is not executable",
      traceback: [],
    });
    return;
  }

  const runnableCell = {
    ...cell,
    language: message.language ?? cell.language,
  };

  sendMessage(connection, { type: "status", state: "busy" });

  const result = await runtime.execute({
    cell: runnableCell,
    code: message.code,
    notebookId: notebook.id,
    env: notebook.env,
    timeoutMs: message.timeoutMs,
    onStream: (stream) => {
      sendMessage(connection, { ...stream, cellId: cell.id });
    },
  });

  for (const output of result.outputs) {
    if (output.type === "stream") {
      continue;
    }
    sendMessage(connection, { ...output, cellId: cell.id });
  }

  sendMessage(connection, {
    type: "execute_reply",
    cellId: cell.id,
    status: result.execution.status,
    execTimeMs: result.execution.ended - result.execution.started,
  });

  sendMessage(connection, { type: "status", state: "idle" });

  await store.save({
    ...notebook,
    cells: notebook.cells.map((item) =>
      item.id === cell.id
        ? {
            ...item,
            source: message.code,
            outputs: result.outputs,
            execution: result.execution,
            language: runnableCell.language,
          }
        : item
    ),
  });
};

const ensureRuntime = (sessionId: string) => {
  let runtime = runtimes.get(sessionId);
  if (!runtime) {
    runtime = new NotebookRuntime();
    runtimes.set(sessionId, runtime);
  }
  return runtime;
};

const sendMessage = (connection: WebSocket, message: KernelServerMessage) => {
  if (connection.readyState === WebSocket.OPEN) {
    connection.send(JSON.stringify(message));
  }
};
