import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import WebSocket, { WebSocketServer, type RawData } from "ws";
import { z } from "zod";
import { spawn, type IPty } from "@lydell/node-pty";
import { loadServerConfig } from "@nodebooks/config";
import {
  TerminalCellSchema,
  type Notebook,
  type TerminalCell,
} from "@nodebooks/notebook-schema";
import type { AuthSession, NotebookStore, SafeUser } from "../types.js";

const TerminalClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("init"),
    cols: z.number().int().positive().max(512).optional(),
    rows: z.number().int().positive().max(512).optional(),
  }),
  z.object({
    type: z.literal("input"),
    data: z.string(),
  }),
  z.object({
    type: z.literal("resize"),
    cols: z.number().int().positive().max(512),
    rows: z.number().int().positive().max(512),
  }),
]);

type TerminalClientMessage = z.infer<typeof TerminalClientMessageSchema>;

type TerminalServerMessage =
  | { type: "ready"; buffer: string }
  | { type: "data"; data: string }
  | { type: "exit"; code: number | null }
  | { type: "error"; message: string };

const HEARTBEAT_INTERVAL_MS = (() => {
  const cfg = loadServerConfig();
  const parsed = cfg.kernelWsHeartbeatMs ?? 25_000;
  return Math.min(Math.max(parsed || 25_000, 10_000), 50_000);
})();

const MAX_BUFFER_LENGTH = 1_000_000; // 1MB of terminal history

const TERMINAL_PROMPT = "nodebooks:~$ ";

const terminalSessions = new Map<string, TerminalSession>();

const sessionKeyFor = (notebookId: string, cellId: string): string =>
  `${notebookId}:${cellId}`;

interface TerminalConnectionParams {
  notebookId: string;
  cellId: string;
}

const sendMessage = (connection: WebSocket, message: TerminalServerMessage) => {
  try {
    connection.send(JSON.stringify(message));
  } catch (err) {
    void err;
  }
};

interface TerminalSession {
  key: string;
  notebookId: string;
  cellId: string;
  pty: IPty;
  buffer: string;
  clients: Set<WebSocket>;
  saveTimer: NodeJS.Timeout | null;
  store: NotebookStore;
  notebook: Notebook;
}

const appendToBuffer = (session: TerminalSession, chunk: string) => {
  session.buffer = `${session.buffer}${chunk}`;
  if (session.buffer.length > MAX_BUFFER_LENGTH) {
    session.buffer = session.buffer.slice(
      session.buffer.length - MAX_BUFFER_LENGTH
    );
  }
};

const persistBuffer = async (session: TerminalSession) => {
  const { store, notebookId, cellId } = session;
  const notebook = await store.get(notebookId);
  if (!notebook) {
    return;
  }
  const index = notebook.cells.findIndex((cell) => cell.id === cellId);
  if (index < 0) {
    return;
  }
  const cell = notebook.cells[index];
  const parsed = TerminalCellSchema.safeParse({
    ...cell,
    buffer: session.buffer,
  });
  if (!parsed.success) {
    return;
  }
  const updatedCell: TerminalCell = parsed.data;
  const next: Notebook = {
    ...notebook,
    cells: notebook.cells.map((existing, idx) =>
      idx === index ? { ...existing, ...updatedCell } : existing
    ),
  };
  try {
    session.notebook = await store.save(next);
  } catch (err) {
    void err;
  }
};

const schedulePersist = (session: TerminalSession) => {
  if (session.saveTimer) {
    clearTimeout(session.saveTimer);
  }
  session.saveTimer = setTimeout(() => {
    session.saveTimer = null;
    void persistBuffer(session);
  }, 250);
};

const broadcastToSession = (
  session: TerminalSession,
  message: TerminalServerMessage
) => {
  for (const client of session.clients) {
    sendMessage(client, message);
  }
};

const attachConnectionToSession = (
  session: TerminalSession,
  connection: WebSocket
) => {
  session.clients.add(connection);
  sendMessage(connection, { type: "ready", buffer: session.buffer });

  const ws = connection as WebSocket & { isAlive?: boolean };
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });

  const heartbeat = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) {
      clearInterval(heartbeat);
      return;
    }
    if (ws.isAlive === false) {
      try {
        ws.terminate();
      } catch (err) {
        void err;
      }
      clearInterval(heartbeat);
      return;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch (err) {
      void err;
    }
  }, HEARTBEAT_INTERVAL_MS);

  connection.on("message", (raw: RawData) => {
    let parsed: TerminalClientMessage | null = null;
    try {
      parsed = TerminalClientMessageSchema.parse(JSON.parse(raw.toString()));
    } catch {
      sendMessage(connection, {
        type: "error",
        message: "Invalid terminal message",
      });
      return;
    }
    if (!parsed) {
      return;
    }
    switch (parsed.type) {
      case "init": {
        const cols = parsed.cols ?? session.pty.cols;
        const rows = parsed.rows ?? session.pty.rows;
        try {
          session.pty.resize(cols, rows);
        } catch (err) {
          void err;
        }
        break;
      }
      case "input": {
        try {
          session.pty.write(parsed.data);
        } catch (err) {
          void err;
        }
        break;
      }
      case "resize": {
        try {
          session.pty.resize(parsed.cols, parsed.rows);
        } catch (err) {
          void err;
        }
        break;
      }
      default:
        break;
    }
  });

  connection.on("close", () => {
    session.clients.delete(connection);
    clearInterval(heartbeat);
    if (session.clients.size === 0) {
      if (session.saveTimer) {
        clearTimeout(session.saveTimer);
        session.saveTimer = null;
        void persistBuffer(session);
      }
      try {
        session.pty.kill();
      } catch (err) {
        void err;
      }
      terminalSessions.delete(session.key);
    }
  });

  connection.on("error", () => {
    session.clients.delete(connection);
  });
};

const determineTerminalCommand = (): [string, string[]] => {
  if (process.platform === "win32") {
    return ["powershell.exe", ["-NoLogo"]];
  }
  const shell = process.env.SHELL || "/bin/bash";
  if (shell.endsWith("fish")) {
    return [shell, ["--private"]];
  }
  if (shell.endsWith("zsh")) {
    return [shell, ["--no-rcs"]];
  }
  if (shell.endsWith("bash")) {
    return [shell, ["--noprofile", "--norc"]];
  }
  return [shell, []];
};

interface TerminalUpgradeAuthResult {
  user: SafeUser;
  session: AuthSession;
}

const createTerminalSession = async (
  connection: WebSocket,
  params: TerminalConnectionParams,
  store: NotebookStore,
  _auth: TerminalUpgradeAuthResult | null
) => {
  void _auth;
  const notebook = await store.get(params.notebookId);
  if (!notebook) {
    sendMessage(connection, {
      type: "error",
      message: "Notebook not found",
    });
    connection.close(1011, "Notebook not found");
    return;
  }
  const cell = notebook.cells.find(
    (item): item is TerminalCell =>
      item.id === params.cellId && item.type === "terminal"
  );
  if (!cell) {
    sendMessage(connection, {
      type: "error",
      message: "Terminal cell not found",
    });
    connection.close(1011, "Terminal cell not found");
    return;
  }

  const key = sessionKeyFor(params.notebookId, params.cellId);
  let session = terminalSessions.get(key);

  if (!session) {
    const [command, args] = determineTerminalCommand();
    const env = {
      ...process.env,
      PS1: TERMINAL_PROMPT,
      TERM: "xterm-256color",
    } as NodeJS.ProcessEnv;

    const pty = spawn(command, args, {
      name: "xterm-color",
      cols: 80,
      rows: 24,
      cwd: process.cwd(),
      env,
    });

    session = {
      key,
      notebookId: params.notebookId,
      cellId: params.cellId,
      pty,
      buffer: typeof cell.buffer === "string" ? cell.buffer : "",
      clients: new Set<WebSocket>(),
      saveTimer: null,
      store,
      notebook,
    };

    terminalSessions.set(key, session);

    const activeSession = session;
    pty.onData((chunk) => {
      appendToBuffer(activeSession, chunk);
      broadcastToSession(activeSession, { type: "data", data: chunk });
      schedulePersist(activeSession);
    });

    pty.onExit(({ exitCode }) => {
      broadcastToSession(activeSession, { type: "exit", code: exitCode });
    });
  } else {
    session.store = store;
    session.notebook = notebook;
  }

  attachConnectionToSession(session, connection);
};

interface TerminalUpgradeOptions {
  authenticate?: (
    req: IncomingMessage
  ) => Promise<TerminalUpgradeAuthResult | null>;
}

export const createTerminalUpgradeHandler = (
  prefix: string,
  store: NotebookStore,
  options: TerminalUpgradeOptions = {}
) => {
  const wss = new WebSocketServer({ noServer: true });
  const base = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  const pattern = new RegExp(
    `^${base}/ws/notebooks/([^/?#]+)/(?:terminals|shells)/([^/?#]+)`
  );

  return (req: IncomingMessage, socket: Socket, head: Buffer): boolean => {
    const url = req.url || "";
    const match = url.match(pattern);
    if (!match) {
      return false;
    }

    const finalize = async () => {
      let authResult: TerminalUpgradeAuthResult | null = null;
      if (typeof options.authenticate === "function") {
        try {
          authResult = await options.authenticate(req);
        } catch {
          authResult = null;
        }
        if (!authResult) {
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
      }

      const notebookId = decodeURIComponent(match[1]!);
      const cellId = decodeURIComponent(match[2]!);
      try {
        wss.handleUpgrade(req, socket, head, (ws) => {
          void createTerminalSession(
            ws as unknown as WebSocket,
            { notebookId, cellId },
            store,
            authResult
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
};
