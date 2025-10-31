"use client";
import React from "react";
import type { UiJson } from "@nodebooks/notebook-schema";
import { ChevronRight } from "lucide-react";
import { CodeBlock } from "./code-block.js";
import { useComponentThemeMode } from "./utils.js";
import clsx from "clsx";

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
    className={`inline-flex items-center justify-center rounded border px-0.5 py-0.5 transition-colors ${
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

const Key: React.FC<{ name: string }> = ({ name }) => (
  <span className="text-primary">{name}</span>
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
            <Key name={k} />: <Value value={v} mode={mode} />
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
              <Key name={k} />:{" "}
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
            <Key name={k} />:{" "}
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
  collapsed = false,
  maxDepth,
  className,
  themeMode,
}) => {
  const mode = useComponentThemeMode(themeMode);
  const [forceOpen, setForceOpen] = React.useState<null | boolean>(true);
  const [version, setVersion] = React.useState(0);
  const [allOpen, setAllOpen] = React.useState(true);
  const [showRaw, setShowRaw] = React.useState(false);
  const rawJson = React.useMemo(() => JSON.stringify(json, null, 2), [json]);
  const controlButton =
    "inline-flex items-center gap-1 rounded-full border border-border/80 bg-background/80 px-3 py-1 text-xs font-medium text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-muted/60";

  // Helper to broadcast expand/collapse to all entries
  const broadcast = (open: boolean) => {
    setForceOpen(open);
    setVersion((v) => v + 1);
  };
  return (
    <div
      data-theme-mode={mode}
      className={clsx(
        "relative rounded-xl border border-border bg-card p-4 font-mono text-[13px] leading-6 text-card-foreground shadow-sm",
        className
      )}
    >
      <div className="mb-3 flex items-center justify-end gap-2">
        {!showRaw && (
          <button
            type="button"
            onClick={() => {
              const next = !allOpen;
              setAllOpen(next);
              broadcast(next);
            }}
            disabled={showRaw}
            className={clsx(
              controlButton,
              "gap-1",
              allOpen ? "bg-muted/60" : "bg-background"
            )}
            aria-pressed={allOpen}
          >
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowRaw((s) => !s)}
          className={clsx(
            controlButton,
            showRaw ? "bg-muted/60" : "bg-background"
          )}
          aria-pressed={showRaw}
        >
          {!showRaw ? "Raw" : "Viewer"}
        </button>
      </div>
      {showRaw ? (
        <CodeBlock
          code={rawJson}
          language="json"
          themeMode={mode}
          className="max-h-80"
          contentClassName="max-h-80"
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
