"use client";

import { useMemo, useState } from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Trash2 } from "lucide-react";
import type { Notebook } from "@nodebooks/notebook-schema";

interface SetupPanelProps {
  env: Notebook["env"];
  onRemoveDependency: (name: string) => Promise<void> | void;
  onAddDependencies: (raw: string) => Promise<void> | void;
  depBusy?: boolean;
  onAddVariable: (name: string, value: string) => Promise<void> | void;
  onRemoveVariable: (name: string) => Promise<void> | void;
}

const SetupPanel = ({
  env,
  onRemoveDependency,
  onAddDependencies,
  depBusy = false,
  onAddVariable,
  onRemoveVariable,
}: SetupPanelProps) => {
  const [draft, setDraft] = useState("");
  const [varKey, setVarKey] = useState("");
  const [varValue, setVarValue] = useState("");
  const dependencies = useMemo(
    () =>
      Object.entries(env.packages ?? {})
        .filter(([name]) => name.trim().length > 0)
        .map(([name, version]) => ({ name, version: String(version ?? "") })),
    [env.packages]
  );
  const variables = useMemo(
    () =>
      Object.entries(env.variables ?? {})
        .filter(([name]) => name.trim().length > 0)
        .map(([name, value]) => ({ name, value: String(value ?? "") })),
    [env.variables]
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
          Runtime
        </p>
        <div className="mt-1">
          <Badge variant="secondary" className="uppercase tracking-[0.2em]">
            {env.runtime.toUpperCase()} {env.version}
          </Badge>
        </div>
      </div>
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
        Dependencies
      </p>
      <div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!depBusy && draft.trim().length > 0) {
              void onAddDependencies(draft.trim());
              setDraft("");
            }
          }}
          className="relative"
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="package or package@version"
            className="w-full rounded-md border border-slate-300 px-2 py-1 pr-16 text-[13px] text-slate-700 focus:border-brand-500 focus:outline-none"
            aria-label="Add dependency"
          />
          <Button
            type="submit"
            size="sm"
            className="absolute right-1 top-1/2 h-7 -translate-y-1/2 px-2 text-[11px]"
            disabled={depBusy}
          >
            {depBusy ? "Adding…" : "Add"}
          </Button>
        </form>
        <p className="mt-1 text-[11px] text-slate-400">
          Use name@version; multiple allowed with commas.
        </p>
      </div>
      <div>
        {dependencies.length === 0 ? (
          <p className="text-xs text-slate-500">No dependencies added yet.</p>
        ) : (
          <ul className="space-y-1">
            {dependencies.map((d) => (
              <DependencyRow
                key={d.name}
                name={d.name}
                version={d.version}
                onRemove={() => void onRemoveDependency(d.name)}
              />
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
          Environment Variables
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const key = varKey.trim();
            if (!key) return;
            void onAddVariable(key, varValue);
            setVarKey("");
            setVarValue("");
          }}
          className="mt-2 grid grid-cols-[1fr_1fr_auto] items-center gap-2"
        >
          <input
            type="text"
            value={varKey}
            onChange={(e) => setVarKey(e.target.value)}
            placeholder="NAME"
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-[13px] text-slate-700 focus:border-brand-500 focus:outline-none"
            aria-label="Variable name"
          />
          <input
            type="text"
            value={varValue}
            onChange={(e) => setVarValue(e.target.value)}
            placeholder="value"
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-[13px] text-slate-700 focus:border-brand-500 focus:outline-none"
            aria-label="Variable value"
          />
          <Button type="submit" size="sm" className="px-3 text-[11px]">
            Add
          </Button>
        </form>
        <p className="mt-1 text-[11px] text-slate-400">
          Available via <span className="font-mono">process.env.NAME</span> in
          code.
        </p>
        <div className="mt-2">
          {variables.length === 0 ? (
            <p className="text-xs text-slate-500">No variables set.</p>
          ) : (
            <ul className="space-y-1">
              {variables.map((v) => (
                <VariableRow
                  key={v.name}
                  name={v.name}
                  value={v.value}
                  onRemove={() => void onRemoveVariable(v.name)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

interface DependencyRowProps {
  name: string;
  version?: string;
  onRemove: () => void;
}

const DependencyRow = ({ name, version, onRemove }: DependencyRowProps) => {
  return (
    <li className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1">
      <div className="flex-1 truncate text-sm text-slate-700" title={name}>
        {name}
      </div>
      <Badge variant="secondary" className="font-mono text-[11px]">
        {version || "latest"}
      </Badge>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-rose-600 hover:text-rose-700"
        onClick={onRemove}
        aria-label={`Remove ${name}`}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
};

export default SetupPanel;

interface VariableRowProps {
  name: string;
  value?: string;
  onRemove: () => void;
}

const VariableRow = ({ name, value, onRemove }: VariableRowProps) => {
  return (
    <li className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1">
      <div className="flex-1 truncate text-sm text-slate-700" title={name}>
        <span className="font-mono text-[12px] text-slate-600">{name}</span>
      </div>
      <Badge variant="secondary" className="font-mono text-[11px]">
        {value || ""}
      </Badge>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-rose-600 hover:text-rose-700"
        onClick={onRemove}
        aria-label={`Remove variable ${name}`}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
};
