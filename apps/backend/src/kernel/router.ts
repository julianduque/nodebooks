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
import { NotebookRuntime } from "@nodebooks/runtime-node";
import {
  PASSWORD_COOKIE_NAME,
  isTokenValid,
  parseCookieHeader,
} from "../auth/password.js";

const runtimes = new Map<string, NotebookRuntime>();

// Heartbeat interval in ms to keep WebSocket connections alive behind proxies
// like Heroku's router (55s idle timeout). Default to 25s, overridable via env.
const HEARTBEAT_INTERVAL_MS = (() => {
  const raw = process.env.KERNEL_WS_HEARTBEAT_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : 25_000;
  // Clamp to a reasonable minimum (10s) and maximum (50s)
  return Math.min(Math.max(parsed || 25_000, 10_000), 50_000);
})();

// WebSocket connections at `${prefix}/ws/sessions/:id` using `ws` directly.
interface KernelUpgradeOptions {
  passwordToken?: string | null;
}

export const createKernelUpgradeHandler = (
  prefix: string,
  sessions: SessionManager,
  store: NotebookStore,
  options: KernelUpgradeOptions = {}
) => {
  const wss = new WebSocketServer({ noServer: true });
  const base = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  const pattern = new RegExp(`^${base}/ws/sessions/([^/?#]+)`);
  const { passwordToken } = options;

  return (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const url = req.url || "";
    const m = url.match(pattern);
    if (!m) return false;
    if (passwordToken) {
      const cookies = parseCookieHeader(req.headers.cookie);
      if (!isTokenValid(cookies[PASSWORD_COOKIE_NAME], passwordToken)) {
        try {
          socket.write(
            "HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n"
          );
        } catch (writeError) {
          void writeError;
        }
        try {
          socket.destroy();
        } catch (destroyError) {
          void destroyError;
        }
        return true;
      }
    }
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

  // --- WebSocket heartbeat (server -> client ping, client -> server pong) ---
  // Browsers automatically reply to ping frames with a pong. This maintains
  // activity on the connection so intermediaries (e.g., Heroku router) do not
  // close it for idleness.
  const ws = connection as WebSocket & { isAlive?: boolean };
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });
  const hb = setInterval(() => {
    // Stop if the socket is no longer open
    if (ws.readyState !== WebSocket.OPEN) {
      clearInterval(hb);
      return;
    }
    // If we didn't get a pong since last ping, terminate
    if (ws.isAlive === false) {
      try {
        ws.terminate();
      } catch (err) {
        void err;
      }
      clearInterval(hb);
      return;
    }
    // Mark as pending and send ping
    ws.isAlive = false;
    try {
      ws.ping();
    } catch (err) {
      void err;
    }
  }, HEARTBEAT_INTERVAL_MS);

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
    clearInterval(hb);
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
    onDisplay: (display) => {
      // Stream UI displays as they are emitted
      sendMessage(connection, { ...display, cellId: cell.id });
    },
  });

  for (const output of result.outputs) {
    // Streams and streamed displays are already sent live; skip here
    if (output.type === "stream") {
      continue;
    }
    if (output.type === "display_data") {
      const streamedFlag = output.metadata?.["streamed"];
      if (typeof streamedFlag === "boolean" && streamedFlag) {
        continue;
      }
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
