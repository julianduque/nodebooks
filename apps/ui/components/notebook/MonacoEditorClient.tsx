"use client";

import dynamic from "next/dynamic";

const MonacoEditor = dynamic(
  async () => {
    const mod = await import("@monaco-editor/react");
    return mod.default;
  },
  { ssr: false }
);

export default MonacoEditor;
