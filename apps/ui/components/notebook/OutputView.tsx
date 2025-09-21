"use client";

import { useMemo } from "react";
import type { NotebookOutput } from "@nodebooks/notebook-schema";
import AnsiToHtml from "ansi-to-html";
import DOMPurify from "dompurify";

const OutputView = ({ output }: { output: NotebookOutput }) => {
  const ansiConverter = useMemo(
    () =>
      new AnsiToHtml({
        // Terminal-like defaults: light text on dark bg
        fg: "#f1f5f9", // slate-100
        bg: "#0f172a", // slate-900
        escapeXML: true,
        newline: true,
        stream: true,
      }),
    []
  );
  const html = useMemo(() => {
    if (output.type !== "stream") return "";
    try {
      const raw = ansiConverter.toHtml(output.text);
      return DOMPurify.sanitize(raw, { ADD_ATTR: ["style"] });
    } catch {
      return DOMPurify.sanitize(output.text, { ADD_ATTR: ["style"] });
    }
  }, [ansiConverter, output]);

  if (output.type === "stream") {
    return (
      <pre className="whitespace-pre-wrap font-mono text-slate-100">
        <span className="text-slate-400">[{output.name}]</span>{" "}
        <span dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    );
  }

  if (output.type === "error") {
    return (
      <div className="rounded-lg border border-rose-400 bg-rose-100/80 p-3 font-mono text-sm text-rose-700">
        <strong>{output.ename}:</strong> {output.evalue}
        {output.traceback.length > 0 && (
          <pre className="mt-2 whitespace-pre-wrap text-xs">
            {output.traceback.join("\n")}
          </pre>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/90 p-3">
      <pre className="whitespace-pre-wrap text-xs text-slate-100">
        {JSON.stringify(output.data, null, 2)}
      </pre>
    </div>
  );
};

export default OutputView;
