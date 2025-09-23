import React from "react";
import type { UiJson } from "@nodebooks/notebook-schema";

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
    className="select-none rounded border border-slate-300 bg-slate-100 px-1 text-xs text-slate-700 hover:bg-slate-200"
  >
    {open ? "−" : "+"}
  </button>
);

const Key: React.FC<{ name: string }> = ({ name }) => (
  <span className="text-emerald-700">{name}</span>
);

const Value: React.FC<{ value: unknown }> = ({ value }) => {
  const t = typeof value;
  if (value === null) return <span className="text-fuchsia-700">null</span>;
  if (t === "string")
    return <span className="text-amber-700">"{String(value)}"</span>;
  if (t === "number")
    return <span className="text-sky-700">{String(value)}</span>;
  if (t === "boolean")
    return <span className="text-pink-700">{String(value)}</span>;
  if (t === "undefined")
    return <span className="text-slate-500">undefined</span>;
  return <span className="text-slate-700">{String(value)}</span>;
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
            <span className="text-slate-500">[</span>
          ) : (
            <span className="text-slate-500">[...{arr.length}]</span>
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
            <span className="text-slate-500">]</span>
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
          <span className="text-slate-500">{"{"}</span>
        ) : (
          <span className="text-slate-500">{"{…}"}</span>
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
          <span className="text-slate-500">{"}"}</span>
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
