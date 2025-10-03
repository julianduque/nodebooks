"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Terminal as XTermTerminal } from "@xterm/xterm";
import type { FitAddon as XTermFitAddon } from "@xterm/addon-fit";
import type { NotebookCell } from "@nodebooks/notebook-schema";
import { clientConfig } from "@nodebooks/config/client";
import { useTheme } from "@/components/theme-context";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/lib/utils";

import "@xterm/xterm/css/xterm.css";

const API_BASE_URL = clientConfig().apiBaseUrl ?? "/api";
const MAX_BUFFER_LENGTH = 1_000_000;

type ShellCell = Extract<NotebookCell, { type: "shell" }>;

interface ShellCellViewProps {
  cell: ShellCell;
  notebookId: string;
  onChange: (
    updater: (cell: NotebookCell) => NotebookCell,
    options?: { persist?: boolean; touch?: boolean }
  ) => void;
}

type TerminalStatus = "connecting" | "ready" | "closed" | "error";

interface TerminalServerMessage {
  type: "ready" | "data" | "exit" | "error";
  buffer?: string;
  data?: string;
  code?: number | null;
  message?: string;
}

const buildWsUrl = (notebookId: string, cellId: string): string | null => {
  const encodedNotebook = encodeURIComponent(notebookId);
  const encodedCell = encodeURIComponent(cellId);
  const path = `/ws/notebooks/${encodedNotebook}/shells/${encodedCell}`;
  if (/^https?:/i.test(API_BASE_URL)) {
    const protocol = API_BASE_URL.startsWith("https") ? "wss" : "ws";
    return `${API_BASE_URL.replace(/^https?/, protocol)}${path}`;
  }
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${window.location.host}${API_BASE_URL}${path}`;
  }
  return null;
};

const ShellCellView = ({ cell, notebookId, onChange }: ShellCellViewProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTermTerminal | null>(null);
  const fitRef = useRef<XTermFitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const bufferRef = useRef<string>(cell.buffer ?? "");
  const dimsRef = useRef<{ cols: number; rows: number }>({
    cols: 80,
    rows: 24,
  });
  const onChangeRef = useRef<ShellCellViewProps["onChange"] | null>(onChange);
  const { theme } = useTheme();
  const [status, setStatus] = useState<TerminalStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const applyBufferUpdate = useCallback(
    (producer: (current: string) => string) => {
      const next = producer(bufferRef.current);
      if (next === bufferRef.current) {
        return;
      }
      bufferRef.current = next.slice(-MAX_BUFFER_LENGTH);
      const update = onChangeRef.current;
      if (!update) {
        return;
      }
      update(
        (current) => {
          if (current.id !== cell.id || current.type !== "shell") {
            return current;
          }
          return { ...current, buffer: bufferRef.current };
        },
        { persist: false, touch: false }
      );
    },
    [cell.id]
  );

  useEffect(() => {
    bufferRef.current = cell.buffer ?? "";
  }, [cell.buffer, cell.id]);

  const themeOptions = useMemo(() => {
    if (theme === "light") {
      return {
        background: "#0f172a",
        foreground: "#e2e8f0",
        cursor: "#38bdf8",
        selectionBackground: "#1e293b",
      };
    }
    return {
      background: "#010409",
      foreground: "#f8fafc",
      cursor: "#38bdf8",
      selectionBackground: "#1f2937",
    };
  }, [theme]);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | null = null;

    const setup = async () => {
      if (!containerRef.current) {
        return;
      }
      try {
        const [{ Terminal }, { FitAddon }] = await Promise.all([
          import("@xterm/xterm"),
          import("@xterm/addon-fit"),
        ]);
        if (disposed || !containerRef.current) {
          return;
        }
        const term = new Terminal({
          convertEol: true,
          cursorBlink: true,
          fontFamily: "Menlo, Monaco, 'Courier New', monospace",
          fontSize: 14,
          theme: themeOptions,
          allowProposedApi: true,
        });
        const fit = new FitAddon();
        term.loadAddon(fit);
        termRef.current = term;
        fitRef.current = fit;
        const container = containerRef.current;
        term.open(container);

        const performFit = () => {
          if (!fitRef.current || !termRef.current) {
            return;
          }
          try {
            fitRef.current.fit();
          } catch (err) {
            void err;
          }
          dimsRef.current = {
            cols: termRef.current.cols,
            rows: termRef.current.rows,
          };
        };

        if (typeof window !== "undefined") {
          window.requestAnimationFrame(() => {
            if (!disposed) {
              performFit();
            }
          });
        } else {
          performFit();
        }

        const observer = new ResizeObserver(() => {
          performFit();
          if (
            socketRef.current?.readyState === WebSocket.OPEN &&
            termRef.current
          ) {
            const payload = {
              type: "resize" as const,
              cols: termRef.current.cols,
              rows: termRef.current.rows,
            };
            try {
              socketRef.current.send(JSON.stringify(payload));
            } catch (err) {
              void err;
            }
          }
        });
        observer.observe(container);
        resizeObserverRef.current = observer;

        term.onData((chunk) => {
          if (socketRef.current?.readyState === WebSocket.OPEN) {
            try {
              socketRef.current.send(
                JSON.stringify({ type: "input", data: chunk })
              );
            } catch (err) {
              void err;
            }
          }
        });

        const handlePointerFocus = () => {
          term.focus();
        };
        container.addEventListener("mousedown", handlePointerFocus);

        cleanup = () => {
          try {
            observer.disconnect();
          } catch (err) {
            void err;
          }
          resizeObserverRef.current = null;
          try {
            container.removeEventListener("mousedown", handlePointerFocus);
          } catch (err) {
            void err;
          }
          try {
            term.dispose();
          } catch (err) {
            void err;
          }
          termRef.current = null;
          fitRef.current = null;
        };
      } catch (err) {
        setError("Failed to load terminal");
        void err;
      }
    };

    setup();

    return () => {
      disposed = true;
      cleanup?.();
      cleanup = null;
    };
  }, [themeOptions]);

  const appendToTerminal = useCallback((text: string) => {
    const term = termRef.current;
    if (!term || text.length === 0) {
      return;
    }
    term.write(text);
  }, []);

  useEffect(() => {
    const url = buildWsUrl(notebookId, cell.id);
    if (!url) {
      setStatus("error");
      setError("Terminal is unavailable in this environment.");
      return;
    }
    const targetUrl = url;

    setStatus("connecting");
    setError(null);
    setExitCode(null);

    let ignoreEvents = false;
    let cleanupSocket: (() => void) | null = null;
    let rafId: number | null = null;
    const retryTimeouts: number[] = [];
    let attempts = 0;

    function scheduleRetry() {
      if (ignoreEvents) {
        return;
      }
      if (attempts >= 3) {
        return;
      }
      if (typeof window === "undefined") {
        connect();
        return;
      }
      const timeout = window.setTimeout(
        () => {
          if (!ignoreEvents) {
            connect();
          }
        },
        500 * (attempts + 1)
      );
      retryTimeouts.push(timeout);
    }

    function connect() {
      if (ignoreEvents) {
        return;
      }
      attempts += 1;
      setStatus("connecting");
      const socket = new WebSocket(targetUrl);
      socketRef.current = socket;

      const safeClose = (code = 1000, reason = "shell cell unmounted") => {
        try {
          socket.close(code, reason);
        } catch (err) {
          void err;
        }
      };

      let sawReady = false;
      let scheduledRetry = false;

      const triggerRetry = (message?: string) => {
        if (scheduledRetry) {
          return;
        }
        scheduledRetry = true;
        if (!ignoreEvents) {
          setStatus("connecting");
          setError(
            message ? `${message} — retrying…` : "Retrying shell connection…"
          );
        }
        scheduleRetry();
      };

      const handleOpen = () => {
        if (ignoreEvents) {
          safeClose();
          return;
        }
        const term = termRef.current;
        if (term && socket.readyState === WebSocket.OPEN) {
          const payload = {
            type: "init" as const,
            cols: term.cols,
            rows: term.rows,
          };
          dimsRef.current = { cols: term.cols, rows: term.rows };
          try {
            socket.send(JSON.stringify(payload));
          } catch (err) {
            void err;
          }
        }
      };

      const handleError = () => {
        if (ignoreEvents) {
          return;
        }
        setStatus("error");
        setError("Terminal connection error");
        triggerRetry("Terminal connection error");
      };

      const handleClose = () => {
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
        if (ignoreEvents) {
          return;
        }
        setStatus((prev) => (prev === "error" ? prev : "closed"));
        if (!sawReady) {
          triggerRetry();
        }
      };

      const handleMessage = (event: MessageEvent) => {
        if (ignoreEvents) {
          return;
        }
        try {
          const message = JSON.parse(event.data) as TerminalServerMessage;
          if (message.type === "ready") {
            sawReady = true;
            setError(null);
            setStatus("ready");
            const initial = message.buffer ?? "";
            if (initial.length > 0) {
              appendToTerminal(initial);
              applyBufferUpdate(() => initial);
            }
            return;
          }
          if (message.type === "data") {
            const chunk = message.data ?? "";
            appendToTerminal(chunk);
            applyBufferUpdate((current) => `${current}${chunk}`);
            return;
          }
          if (message.type === "exit") {
            setExitCode(message.code ?? 0);
            setStatus("closed");
            return;
          }
          if (message.type === "error") {
            setError(message.message ?? "Terminal error");
            setStatus("error");
            const text = message.message ?? "";
            if (text.toLowerCase().includes("shell cell not found")) {
              triggerRetry("Shell cell not found");
            }
          }
        } catch {
          setError("Received malformed terminal data");
          setStatus("error");
          triggerRetry("Malformed terminal data");
        }
      };

      socket.addEventListener("open", handleOpen);
      socket.addEventListener("error", handleError);
      socket.addEventListener("close", handleClose);
      socket.addEventListener("message", handleMessage);

      cleanupSocket = () => {
        socket.removeEventListener("open", handleOpen);
        socket.removeEventListener("error", handleError);
        socket.removeEventListener("close", handleClose);
        socket.removeEventListener("message", handleMessage);
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
        if (socket.readyState === WebSocket.CONNECTING) {
          const closeAfterConnect = () => safeClose();
          socket.addEventListener("open", closeAfterConnect, { once: true });
          socket.addEventListener("error", closeAfterConnect, { once: true });
        } else if (
          socket.readyState === WebSocket.OPEN ||
          socket.readyState === WebSocket.CLOSING
        ) {
          safeClose();
        }
      };
    }
    if (typeof window !== "undefined") {
      rafId = window.requestAnimationFrame(connect);
    } else {
      connect();
    }

    return () => {
      ignoreEvents = true;
      if (typeof window !== "undefined" && rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      cleanupSocket?.();
      cleanupSocket = null;
      if (typeof window !== "undefined") {
        for (const timeout of retryTimeouts) {
          window.clearTimeout(timeout);
        }
      }
    };
  }, [appendToTerminal, applyBufferUpdate, cell.id, notebookId]);

  const statusBadge = useMemo(() => {
    if (status === "ready") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
          Connected
        </span>
      );
    }
    if (status === "connecting") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
          Connecting…
        </span>
      );
    }
    if (status === "error") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-semibold text-rose-200">
          Error
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-700/40 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
        Disconnected
      </span>
    );
  }, [status]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-slate-50 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-2">
        <div className="flex items-center gap-2">
          {statusBadge}
          {exitCode !== null ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-800/70 px-2 py-0.5 text-[10px] font-semibold text-slate-200">
              Exit {exitCode}
            </span>
          ) : null}
        </div>
        <Badge
          variant="secondary"
          className="bg-slate-800/80 text-[10px] uppercase tracking-[0.2em] text-slate-200"
        >
          Shell
        </Badge>
      </div>
      <div className="px-4 pb-4">
        <div
          ref={containerRef}
          className={cn(
            "min-h-[260px] w-full overflow-hidden border border-slate-800/60 bg-slate-950",
            status === "error" ? "opacity-60" : ""
          )}
        />
        {error ? (
          <p className="mt-3 text-[12px] text-rose-300">{error}</p>
        ) : null}
      </div>
    </div>
  );
};

export default ShellCellView;
