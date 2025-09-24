"use client";
import React from "react";
import { UiThemeContext } from "./theme";
import type { UiJson } from "@nodebooks/notebook-schema";
import { ChevronRight } from "lucide-react";
import { CodeBlock } from "./codeBlock";

type JsonViewerProps = Omit<UiJson, "ui"> & {
  className?: string;
  themeMode?: "light" | "dark";
};
const isObject = (v: unknown) => v !== null && typeof v === "object";
const isArray = Array.isArray;

const Toggle: React.FC<{
  open: boolean;
  onClick: () => void;
  mode: "light" | "dark";
}> = ({ open, onClick, mode }) => (
  <button
    onClick={onClick}
    type="button"
    className={`inline-flex items-center justify-center rounded border px-1.5 py-0.5 transition-colors ${
      mode === "light"
        ? "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200"
        : "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
    }`}
    aria-label={open ? "Collapse" : "Expand"}
  >
    <ChevronRight
      size={14}
      className={
        open ? "rotate-90 transition-transform" : "transition-transform"
      }
    />
  </button>
);

const Key: React.FC<{ name: string; mode: "light" | "dark" }> = ({
  name,
  mode,
}) => (
  <span className={mode === "light" ? "text-emerald-700" : "text-emerald-300"}>
    {name}
  </span>
);

const Value: React.FC<{ value: unknown; mode: "light" | "dark" }> = ({
  value,
  mode,
}) => {
  const t = typeof value;
  if (value === null)
    return (
      <span
        className={mode === "light" ? "text-fuchsia-700" : "text-fuchsia-300"}
      >
        null
      </span>
    );
  if (t === "string")
    return (
      <span className={mode === "light" ? "text-amber-700" : "text-amber-200"}>
        "{String(value)}"
      </span>
    );
  if (t === "number")
    return (
      <span className={mode === "light" ? "text-sky-700" : "text-sky-300"}>
        {String(value)}
      </span>
    );
  if (t === "boolean")
    return (
      <span className={mode === "light" ? "text-pink-700" : "text-pink-300"}>
        {String(value)}
      </span>
    );
  if (t === "undefined")
    return (
      <span className={mode === "light" ? "text-slate-500" : "text-slate-400"}>
        undefined
      </span>
    );
  return (
    <span className={mode === "light" ? "text-slate-700" : "text-slate-200"}>
      {String(value)}
    </span>
  );
};

// Context to signal expand/collapse-all to nested items
const JsonControlContext = React.createContext<{
  forceOpen: boolean | null;
  version: number;
}>({
  forceOpen: null,
  version: 0,
});

const Entry: React.FC<{
  k: string | null;
  v: unknown;
  depth: number;
  maxDepth?: number;
  collapsed?: boolean;
  mode: "light" | "dark";
}> = ({ k, v, depth, maxDepth = 6, collapsed = false, mode }) => {
  const ctrl = React.useContext(JsonControlContext);
  const [open, setOpen] = React.useState(!collapsed && depth < maxDepth);
  // Respond to expand/collapse-all requests
  React.useEffect(() => {
    if (ctrl.forceOpen !== null) setOpen(ctrl.forceOpen);
  }, [ctrl.version]);
  const indentStyle: React.CSSProperties = { marginLeft: depth * 16 };

  if (!isObject(v)) {
    return (
      <div className="leading-6" style={indentStyle}>
        {k !== null ? (
          <>
            <Key name={k} mode={mode} />: <Value value={v} mode={mode} />
          </>
        ) : (
          <Value value={v} mode={mode} />
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
              <Key name={k} mode={mode} />:{" "}
            </>
          )}
          <Toggle open={open} onClick={() => setOpen((s) => !s)} mode={mode} />{" "}
          {open ? (
            <span
              className={mode === "light" ? "text-slate-500" : "text-slate-400"}
            >
              [
            </span>
          ) : (
            <span
              className={mode === "light" ? "text-slate-500" : "text-slate-400"}
            >
              [...{arr.length}]
            </span>
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
              mode={mode}
            />
          ))}
        {open && (
          <div className="leading-6" style={indentStyle}>
            <span
              className={mode === "light" ? "text-slate-500" : "text-slate-400"}
            >
              ]
            </span>
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
            <Key name={k} mode={mode} />:{" "}
          </>
        )}
        <Toggle open={open} onClick={() => setOpen((s) => !s)} mode={mode} />{" "}
        {open ? (
          <span
            className={mode === "light" ? "text-slate-500" : "text-slate-400"}
          >
            {"{"}
          </span>
        ) : (
          <span
            className={mode === "light" ? "text-slate-500" : "text-slate-400"}
          >
            {"{…}"}
          </span>
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
            mode={mode}
          />
        ))}
      {open && (
        <div className="leading-6" style={indentStyle}>
          <span
            className={mode === "light" ? "text-slate-500" : "text-slate-400"}
          >
            {"}"}
          </span>
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
  themeMode,
}) => {
  const ctx = React.useContext(UiThemeContext);
  const mode = themeMode ?? ctx ?? "light";
  const [forceOpen, setForceOpen] = React.useState<null | boolean>(null);
  const [version, setVersion] = React.useState(0);
  const [allOpen, setAllOpen] = React.useState(false);
  const [showRaw, setShowRaw] = React.useState(false);

  // Helper to broadcast expand/collapse to all entries
  const broadcast = (open: boolean) => {
    setForceOpen(open);
    setVersion((v) => v + 1);
  };
  return (
    <div
      className={`relative rounded-md border p-3 pr-9 font-mono text-[13px] leading-6 ${
        mode === "light"
          ? "bg-slate-50 border-slate-200 text-slate-800"
          : "bg-slate-900 border-slate-800 text-slate-200"
      } ${className ?? ""}`}
      style={
        mode === "dark"
          ? ({
              "--foreground": "#e5e7eb",
              "--muted": "#1f2937",
              "--border": "#334155",
            } as React.CSSProperties & Record<`--${string}`, string>)
          : undefined
      }
    >
      <div className="mb-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            const next = !allOpen;
            setAllOpen(next);
            broadcast(next);
          }}
          disabled={showRaw}
          className={`inline-flex items-center rounded border px-2 py-1 text-xs ${
            mode === "light"
              ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              : "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-50"
          }`}
          aria-pressed={allOpen}
        >
          {allOpen ? "Collapse all" : "Expand all"}
        </button>
        <button
          type="button"
          onClick={() => setShowRaw((s) => !s)}
          className={`inline-flex items-center rounded border px-2 py-1 text-xs ${
            mode === "light"
              ? showRaw
                ? "border-slate-400 bg-slate-100 text-slate-800"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              : showRaw
                ? "border-slate-600 bg-slate-800 text-slate-200"
                : "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
          }`}
          aria-pressed={showRaw}
        >
          Raw
        </button>
      </div>
      {showRaw ? (
        <CodeBlock
          code={JSON.stringify(json, null, 2)}
          language="json"
          themeMode={mode}
        />
      ) : (
        <JsonControlContext.Provider value={{ forceOpen, version }}>
          <Entry
            k={null}
            v={json}
            depth={0}
            maxDepth={maxDepth}
            collapsed={collapsed}
            mode={mode}
          />
        </JsonControlContext.Provider>
      )}
    </div>
  );
};

// end
