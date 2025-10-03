import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import WebSocket, { WebSocketServer, type RawData } from "ws";
import { z } from "zod";
import { spawn, type IPty } from "node-pty";
import { loadServerConfig } from "@nodebooks/config";
import {
  ShellCellSchema,
  type Notebook,
  type ShellCell,
} from "@nodebooks/notebook-schema";
import type { NotebookStore } from "../types.js";
import {
  PASSWORD_COOKIE_NAME,
  isTokenValid,
  parseCookieHeader,
} from "../auth/password.js";

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

const SHELL_PROMPT = "nodebooks:~$ ";

interface ShellConnectionParams {
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

interface ShellSession {
  notebookId: string;
  cellId: string;
  pty: IPty;
  buffer: string;
  clients: Set<WebSocket>;
  saveTimer: NodeJS.Timeout | null;
  store: NotebookStore;
  notebook: Notebook;
}

const appendToBuffer = (session: ShellSession, chunk: string) => {
  session.buffer = `${session.buffer}${chunk}`;
  if (session.buffer.length > MAX_BUFFER_LENGTH) {
    session.buffer = session.buffer.slice(
      session.buffer.length - MAX_BUFFER_LENGTH
    );
  }
};

const persistBuffer = async (session: ShellSession) => {
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
  const parsed = ShellCellSchema.safeParse({
    ...cell,
    buffer: session.buffer,
  });
  if (!parsed.success) {
    return;
  }
  const updatedCell: ShellCell = parsed.data;
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

const schedulePersist = (session: ShellSession) => {
  if (session.saveTimer) {
    clearTimeout(session.saveTimer);
  }
  session.saveTimer = setTimeout(() => {
    session.saveTimer = null;
    void persistBuffer(session);
  }, 250);
};

const determineShellCommand = (): [string, string[]] => {
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

const createShellSession = async (
  connection: WebSocket,
  params: ShellConnectionParams,
  store: NotebookStore
) => {
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
    (item) => item.id === params.cellId && item.type === "shell"
  );
  if (!cell) {
    sendMessage(connection, {
      type: "error",
      message: "Shell cell not found",
    });
    connection.close(1011, "Shell cell not found");
    return;
  }

  const [command, args] = determineShellCommand();
  const env = {
    ...process.env,
    PS1: SHELL_PROMPT,
    TERM: "xterm-256color",
  } as NodeJS.ProcessEnv;

  const pty = spawn(command, args, {
    name: "xterm-color",
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env,
  });

  const session: ShellSession = {
    notebookId: params.notebookId,
    cellId: params.cellId,
    pty,
    buffer: typeof (cell as ShellCell).buffer === "string" ? cell.buffer : "",
    clients: new Set([connection]),
    saveTimer: null,
    store,
    notebook,
  };

  sendMessage(connection, { type: "ready", buffer: session.buffer });

  const broadcast = (message: TerminalServerMessage) => {
    for (const client of session.clients) {
      sendMessage(client, message);
    }
  };

  pty.onData((chunk) => {
    appendToBuffer(session, chunk);
    broadcast({ type: "data", data: chunk });
    schedulePersist(session);
  });

  pty.onExit(({ exitCode }) => {
    broadcast({ type: "exit", code: exitCode });
  });

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
      parsed = TerminalClientMessageSchema.parse(
        JSON.parse(raw.toString())
      );
    } catch (error) {
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
      clearInterval(heartbeat);
    }
  });

  connection.on("error", () => {
    session.clients.delete(connection);
  });
};

interface ShellUpgradeOptions {
  passwordToken?: string | null;
  getPasswordToken?: () => string | null;
}

export const createShellUpgradeHandler = (
  prefix: string,
  store: NotebookStore,
  options: ShellUpgradeOptions = {}
) => {
  const wss = new WebSocketServer({ noServer: true });
  const base = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  const pattern = new RegExp(
    `^${base}/ws/notebooks/([^/?#]+)/shells/([^/?#]+)`
  );
  const resolvePasswordToken =
    typeof options.getPasswordToken === "function"
      ? options.getPasswordToken
      : () => options.passwordToken ?? null;

  return (
    req: IncomingMessage,
    socket: Socket,
    head: Buffer
  ): boolean => {
    const url = req.url || "";
    const match = url.match(pattern);
    if (!match) {
      return false;
    }

    const activeToken = resolvePasswordToken();
    if (activeToken) {
      const cookies = parseCookieHeader(req.headers.cookie);
      if (!isTokenValid(cookies[PASSWORD_COOKIE_NAME], activeToken)) {
        try {
          socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
        } catch (err) {
          void err;
        }
        try {
          socket.destroy();
        } catch (err) {
          void err;
        }
        return true;
      }
    }

    const notebookId = decodeURIComponent(match[1]!);
    const cellId = decodeURIComponent(match[2]!);
    try {
      wss.handleUpgrade(req, socket, head, (ws) => {
        void createShellSession(
          ws as unknown as WebSocket,
          { notebookId, cellId },
          store
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

    return true;
  };
};
