"use client";

import { useMemo } from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Trash2 } from "lucide-react";
import type { Notebook } from "@nodebooks/notebook-schema";

interface SetupPanelProps {
  env: Notebook["env"];
  onRemoveDependency: (name: string) => Promise<void> | void;
}

const SetupPanel = ({ env, onRemoveDependency }: SetupPanelProps) => {
  const dependencies = useMemo(
    () =>
      Object.entries(env.packages ?? {})
        .filter(([name]) => name.trim().length > 0)
        .map(([name, version]) => ({ name, version: String(version ?? "") })),
    [env.packages]
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
          Environment
        </p>
        <div className="mt-1">
          <Badge variant="secondary" className="uppercase tracking-[0.2em]">
            {env.runtime.toUpperCase()} {env.version}
          </Badge>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {dependencies.length === 0 ? (
          <p className="text-xs text-slate-500">No dependencies added yet.</p>
        ) : (
          <ul className="space-y-2">
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
    <li className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
      <div className="flex-1 truncate text-sm text-slate-700">{name}</div>
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
