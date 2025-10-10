"use client";

import { useMemo } from "react";
import type { NotebookOutput } from "@nodebooks/notebook-schema";
import { UiDisplaySchema, NODEBOOKS_UI_MIME } from "@nodebooks/notebook-schema";
import { UiRenderer } from "@nodebooks/notebook-ui";
import type { UiJson } from "@nodebooks/notebook-schema";
import AnsiToHtml from "ansi-to-html";
import { sanitizeHtmlSnippet } from "@/components/notebook/markdown-preview-utils";

const OutputView = ({ output }: { output: NotebookOutput }) => {
  const ansiConverter = useMemo(
    () =>
      new AnsiToHtml({
        // Terminal-like defaults: light text on dark bg
        fg: "#f1f5f9", // slate-100
        bg: "#0f172a", // slate-900
        escapeXML: true,
        // Keep newlines as raw \n; <pre> will render them.
        newline: false,
        stream: true,
      }),
    []
  );
  const { html, blank } = useMemo(() => {
    if (output.type !== "stream") return { html: "", blank: false };
    let text =
      typeof output.text === "string" ? output.text : String(output.text ?? "");

    // Helper to strip ANSI for blank detection
    const STRIP_ANSI = /\u001B\[[0-?]*[ -\/]*[@-~]/g;
    const isBlank = text.replace(STRIP_ANSI, "").trim().length === 0;

    // Remove leading newlines even if preceded by ANSI escape codes
    // Capture leading ANSI codes and keep them while dropping only CR/LF
    // Case 1: codes then newline(s)
    text = text.replace(/^((?:\u001B\[[0-?]*[ -\/]*[@-~])*)(?:[\r\n]+)/, "$1");
    // Case 2: newline(s) at very start
    const normalized = text.replace(/^[\r\n]+/, "");
    try {
      const raw = ansiConverter.toHtml(isBlank ? text : normalized);
      // When newline:false, converter no longer injects <br/>. Keep as-is.
      return {
        html: sanitizeHtmlSnippet(raw),
        blank: isBlank,
      };
    } catch {
      const fallback = (isBlank ? text : normalized).replace(/^[\r\n]+/, "");
      return {
        html: sanitizeHtmlSnippet(fallback),
        blank: isBlank,
      };
    }
  }, [ansiConverter, output]);

  if (output.type === "stream") {
    return (
      <pre className="whitespace-pre-wrap rounded-md border border-slate-900/60 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 shadow-sm">
        {blank ? null : (
          <>
            <span className="text-slate-400">[{output.name}]</span>{" "}
          </>
        )}
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

  // Non-stream, non-error: attempt to render structured UI first
  if (
    output.type === "display_data" ||
    output.type === "execute_result" ||
    output.type === "update_display_data"
  ) {
    const rawVendor = output.data?.[NODEBOOKS_UI_MIME as string];
    const parsedVendor = UiDisplaySchema.safeParse(rawVendor);
    if (parsedVendor.success) {
      return <UiRenderer display={parsedVendor.data} />;
    }
    // Secondary fallback: some runtimes may put the UI object under application/json
    const rawJson = output.data?.["application/json" as string];
    const parsedJson = UiDisplaySchema.safeParse(rawJson);
    if (parsedJson.success) {
      return <UiRenderer display={parsedJson.data} />;
    }
    // Final fallback to raw data
    const fallback: UiJson = { ui: "json", json: output.data };
    return <UiRenderer display={fallback} />;
  }

  // Should be unreachable, but keep a tiny fallback
  return null;
};

export default OutputView;
