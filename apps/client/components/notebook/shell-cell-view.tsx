"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NotebookCell } from "@nodebooks/notebook-schema";
import { Badge } from "@/components/ui/badge";
import OutputView from "@/components/notebook/output-view";
import { Loader2, Zap } from "lucide-react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import "xterm/css/xterm.css";

interface ShellCellViewProps {
  cell: Extract<NotebookCell, { type: "shell" }>;
  onChange: (
    updater: (cell: NotebookCell) => NotebookCell,
    options?: { persist?: boolean; touch?: boolean }
  ) => void;
  onRun: () => void;
  isRunning: boolean;
  queued?: boolean;
  editorKey: string;
}

const ShellCellView = ({
  cell,
  onChange,
  onRun,
  isRunning,
  queued,
  editorKey,
}: ShellCellViewProps) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [terminalReady, setTerminalReady] = useState(false);

  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.max(72, textarea.scrollHeight)}px`;
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [adjustTextareaHeight, cell.source]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      convertEol: true,
      disableStdin: true,
      fontFamily:
        'Menlo, Monaco, "SFMono-Regular", "Fira Code", "Fira Mono", monospace',
      fontSize: 13,
      theme: {
        background: "#020617",
        foreground: "#e2e8f0",
      },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    fitAddon.fit();

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;
    setTerminalReady(true);

    const observer = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch (err) {
        void err;
      }
    });
    observer.observe(container);
    resizeObserverRef.current = observer;

    return () => {
      setTerminalReady(false);
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      try {
        term.dispose();
      } catch (err) {
        void err;
      }
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [editorKey]);

  const renderTerminal = useCallback(() => {
    const term = terminalRef.current;
    if (!term) return;
    try {
      term.reset();
      const command = cell.source.trim();
      if (command.length > 0) {
        term.writeln(`$ ${command}`);
        term.writeln("");
      }
      for (const output of cell.outputs) {
        if (output.type === "stream") {
          const text = output.text.replace(/\r?\n/g, "\r\n");
          if (output.name === "stderr") {
            term.write("\u001b[91m");
            term.write(text);
            term.write("\u001b[0m");
          } else {
            term.write(text);
          }
          continue;
        }
        if (output.type === "error") {
          term.write("\r\n\u001b[91m");
          term.writeln(`${output.ename}: ${output.evalue}`);
          for (const line of output.traceback ?? []) {
            term.writeln(line);
          }
          term.write("\u001b[0m");
          continue;
        }
        // Display data is rendered below in OutputView; emit a placeholder line
        term.write("\r\n");
      }
      term.scrollToBottom();
    } catch (err) {
      void err;
    }
  }, [cell.outputs, cell.source]);

  useEffect(() => {
    if (!terminalReady) return;
    renderTerminal();
  }, [terminalReady, renderTerminal]);

  const supplementalOutputs = useMemo(
    () =>
      cell.outputs.filter((output) =>
        output.type === "display_data" ||
        output.type === "execute_result" ||
        output.type === "update_display_data"
      ),
    [cell.outputs]
  );

  const execCount = useMemo(() => {
    const display = (cell.metadata as { display?: { execCount?: number } })
      ?.display;
    return typeof display?.execCount === "number" ? display.execCount : null;
  }, [cell.metadata]);

  const handleTextareaChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = event.target.value;
      onChange(() => ({ ...cell, source: value }));
    },
    [cell, onChange]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && (event.shiftKey || event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onRun();
      }
    },
    [onRun]
  );

  useEffect(() => {
    adjustTextareaHeight();
  }, [adjustTextareaHeight, isRunning]);

  return (
    <div className="rounded-2xl bg-slate-900 text-slate-100 shadow-lg ring-1 ring-slate-900/60">
      <div className="relative">
        <div className="absolute left-2 top-2 z-10 flex items-center gap-2 text-[10px] font-semibold">
          {isRunning ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-2 py-0.5 text-amber-200">
              <Loader2 className="h-3 w-3 animate-spin" /> Running
            </span>
          ) : execCount !== null ? (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-slate-800/70 px-2 py-0.5 text-slate-200"
              title={`Last run #${execCount}`}
            >
              <Zap className="h-3 w-3 text-emerald-400" /> {execCount}
            </span>
          ) : null}
          {!isRunning && queued ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/20 px-2 py-0.5 text-indigo-200">
              <span className="h-2 w-2 rounded-full bg-indigo-400" /> Queued
            </span>
          ) : null}
        </div>
        <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
          <Badge variant="default" className="px-2 py-0.5 text-[10px] tracking-wide">
            Shell
          </Badge>
        </div>
        <div className="space-y-3 p-4">
          <textarea
            ref={textareaRef}
            key={editorKey}
            className="w-full resize-none rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="Enter a shell command, e.g. ls -la"
            value={cell.source}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
          />
          <div
            ref={containerRef}
            className="h-56 w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950"
          />
          {supplementalOutputs.length > 0 ? (
            <div className="space-y-2">
              {supplementalOutputs.map((output, index) => (
                <OutputView key={index} output={output} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default ShellCellView;
