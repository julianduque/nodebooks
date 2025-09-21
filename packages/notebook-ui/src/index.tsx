"use client";

import React from "react";
import type {
  UiDisplay,
  UiImage,
  UiMarkdown,
  UiHtml,
  UiJson,
  UiCode,
} from "@nodebooks/notebook-schema";
import DOMPurify from "dompurify";
import { marked } from "marked";

// Image component
type ImageProps = UiImage & { className?: string };
const toSize = (v?: number | string) => (typeof v === "number" ? `${v}px` : v);

export const Image: React.FC<ImageProps> = ({
  src,
  mimeType,
  alt,
  width,
  height,
  fit = "contain",
  borderRadius,
  className,
}) => {
  let resolvedSrc = src;
  const isDataUrl = typeof src === "string" && src.startsWith("data:");
  const isHttp = typeof src === "string" && /^(https?:)?\/\//.test(src);

  if (!isDataUrl && !isHttp && typeof src === "string") {
    const mt = mimeType ?? "image/png";
    resolvedSrc = `data:${mt};base64,${src}`;
  }

  const style: React.CSSProperties = {
    objectFit: fit,
    borderRadius,
    maxWidth: "100%",
    height: toSize(height),
    width: toSize(width),
    display: "block",
  };

  return (
    <img
      src={resolvedSrc}
      alt={alt ?? ""}
      style={style}
      className={className}
    />
  );
};

// UI Renderer
export interface UiRendererProps {
  display: UiDisplay;
  className?: string;
}

export const UiRenderer: React.FC<UiRendererProps> = ({
  display,
  className,
}) => {
  switch (display.ui) {
    case "image":
      return <Image {...display} className={className} />;
    case "markdown":
      return <Markdown {...display} className={className} />;
    case "html":
      return <HtmlBlock {...display} className={className} />;
    case "json":
      return <JsonViewer {...display} className={className} />;
    case "code":
      return <CodeBlock {...display} className={className} />;
    default:
      return null;
  }
};

export default UiRenderer;

// Markdown component
type MarkdownProps = UiMarkdown & { className?: string };
export const Markdown: React.FC<MarkdownProps> = ({ markdown, className }) => {
  const html = marked.parse(markdown ?? "");
  const safe = DOMPurify.sanitize(String(html), { ADD_ATTR: ["style"] });
  return (
    <div className={className} dangerouslySetInnerHTML={{ __html: safe }} />
  );
};

// HTML component
type HtmlProps = UiHtml & { className?: string };
export const HtmlBlock: React.FC<HtmlProps> = ({ html, className }) => {
  const safe = DOMPurify.sanitize(html ?? "", { ADD_ATTR: ["style"] });
  return (
    <div className={className} dangerouslySetInnerHTML={{ __html: safe }} />
  );
};

// JSON Viewer (collapsible)
type JsonViewerProps = UiJson & { className?: string };
const isObject = (v: unknown) => v !== null && typeof v === "object";
const isArray = Array.isArray;

const Toggle: React.FC<{ open: boolean; onClick: () => void }> = ({
  open,
  onClick,
}) => (
  <button
    onClick={onClick}
    type="button"
    className="select-none rounded border border-slate-600 bg-slate-700 px-1 text-xs text-slate-100 hover:bg-slate-600"
  >
    {open ? "−" : "+"}
  </button>
);

const Key: React.FC<{ name: string }> = ({ name }) => (
  <span className="text-emerald-300">{name}</span>
);

const Value: React.FC<{ value: unknown }> = ({ value }) => {
  const t = typeof value;
  if (value === null) return <span className="text-fuchsia-300">null</span>;
  if (t === "string")
    return <span className="text-amber-200">"{String(value)}"</span>;
  if (t === "number")
    return <span className="text-sky-300">{String(value)}</span>;
  if (t === "boolean")
    return <span className="text-pink-300">{String(value)}</span>;
  if (t === "undefined")
    return <span className="text-slate-400">undefined</span>;
  return <span className="text-slate-200">{String(value)}</span>;
};

const Entry: React.FC<{
  k: string | null;
  v: unknown;
  depth: number;
  maxDepth?: number;
  collapsed?: boolean;
}> = ({ k, v, depth, maxDepth = 6, collapsed = false }) => {
  const [open, setOpen] = React.useState(!collapsed && depth < maxDepth);
  const indentStyle: React.CSSProperties = { marginLeft: depth * 16 };

  if (!isObject(v)) {
    return (
      <div className="leading-6" style={indentStyle}>
        {k !== null ? (
          <>
            <Key name={k} />: <Value value={v} />
          </>
        ) : (
          <Value value={v} />
        )}
      </div>
    );
  }

  if (isArray(v)) {
    const arr = v as unknown[];
    return (
      <>
        <div className="leading-6" style={indentStyle}>
          {k !== null && (
            <>
              <Key name={k} />:{" "}
            </>
          )}
          <Toggle open={open} onClick={() => setOpen((s) => !s)} />{" "}
          {open ? (
            <span className="text-slate-300">[</span>
          ) : (
            <span className="text-slate-400">[...{arr.length}]</span>
          )}
        </div>
        {open &&
          arr.map((item, idx) => (
            <Entry
              key={idx}
              k={null}
              v={item}
              depth={depth + 1}
              maxDepth={maxDepth}
              collapsed={collapsed}
            />
          ))}
        {open && (
          <div className="leading-6" style={indentStyle}>
            <span className="text-slate-300">]</span>
          </div>
        )}
      </>
    );
  }

  const entries = Object.entries(v as Record<string, unknown>);
  return (
    <>
      <div className="leading-6" style={indentStyle}>
        {k !== null && (
          <>
            <Key name={k} />:{" "}
          </>
        )}
        <Toggle open={open} onClick={() => setOpen((s) => !s)} />{" "}
        {open ? (
          <span className="text-slate-300">{"{"}</span>
        ) : (
          <span className="text-slate-400">{"{…}"}</span>
        )}
      </div>
      {open &&
        entries.map(([key, val]) => (
          <Entry
            key={key}
            k={key}
            v={val}
            depth={depth + 1}
            maxDepth={maxDepth}
            collapsed={collapsed}
          />
        ))}
      {open && (
        <div className="leading-6" style={indentStyle}>
          <span className="text-slate-300">{"}"}</span>
        </div>
      )}
    </>
  );
};

export const JsonViewer: React.FC<JsonViewerProps> = ({
  json,
  collapsed,
  maxDepth,
  className,
}) => {
  return (
    <div className={className}>
      <Entry
        k={null}
        v={json}
        depth={0}
        maxDepth={maxDepth}
        collapsed={collapsed}
      />
    </div>
  );
};

// Code Block
type CodeBlockProps = UiCode & { className?: string };
export const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  language,
  wrap,
  className,
}) => {
  return (
    <pre
      className={
        className +
        " whitespace-pre bg-slate-900 text-slate-100 rounded p-3 overflow-auto"
      }
      style={{ whiteSpace: wrap ? "pre-wrap" : "pre" }}
    >
      <code className={language ? `language-${language}` : undefined}>
        {code}
      </code>
    </pre>
  );
};
