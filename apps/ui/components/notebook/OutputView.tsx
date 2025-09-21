"use client";

import type { NotebookOutput } from "@nodebooks/notebook-schema";

const OutputView = ({ output }: { output: NotebookOutput }) => {
  if (output.type === "stream") {
    return (
      <pre className="whitespace-pre-wrap font-mono text-emerald-100">
        <span className="text-emerald-300">[{output.name}]</span> {output.text}
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
