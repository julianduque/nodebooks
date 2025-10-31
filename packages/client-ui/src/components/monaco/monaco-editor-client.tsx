"use client";

import { useEffect, useState, type ComponentType } from "react";
import type { EditorProps } from "@monaco-editor/react";

type MonacoEditorComponent = ComponentType<EditorProps>;

const createFallback = (): MonacoEditorComponent => {
  return () => null;
};

const MonacoEditor = (props: EditorProps) => {
  const [Editor, setEditor] = useState<MonacoEditorComponent | null>(null);

  useEffect(() => {
    let mounted = true;
    void import("@monaco-editor/react")
      .then((mod) => {
        if (mounted && mod?.default) {
          setEditor(() => mod.default as MonacoEditorComponent);
        }
      })
      .catch(() => {
        if (mounted) {
          setEditor(() => createFallback());
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const ResolvedEditor = Editor;
  if (!ResolvedEditor) {
    return null;
  }
  return <ResolvedEditor {...props} />;
};

export default MonacoEditor;
