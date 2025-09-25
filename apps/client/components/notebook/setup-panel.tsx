"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import type { Notebook } from "@nodebooks/notebook-schema";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  // Variable modal state
  const [varModalOpen, setVarModalOpen] = useState(false);
  const [editOriginalName, setEditOriginalName] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formValue, setFormValue] = useState("");
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
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
          Runtime
        </p>
        <div className="mt-1">
          <Badge variant="secondary" className="uppercase tracking-[0.2em]">
            {env.runtime.toUpperCase()} {env.version}
          </Badge>
        </div>
      </div>
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
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
            className="w-full rounded-md border border-input bg-background px-2 py-2 pr-16 text-[13px] text-foreground focus:outline-none"
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
        <p className="mt-1 text-[11px] text-muted-foreground">
          Use name@version; multiple allowed with commas.
        </p>
      </div>
      <div>
        {dependencies.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No dependencies added yet.
          </p>
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
        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
          Environment Variables
        </p>
        <div className="mt-2 flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            Available via <span className="font-mono">process.env.NAME</span> in
            code.
          </p>
          <Button
            type="button"
            variant="default"
            size="sm"
            className="px-3 text-[11px]"
            onClick={() => {
              setEditOriginalName(null);
              setFormName("");
              setFormValue("");
              setVarModalOpen(true);
            }}
          >
            Add Variable
          </Button>
        </div>
        <div className="mt-2">
          {variables.length === 0 ? (
            <p className="text-xs text-muted-foreground">No variables set.</p>
          ) : (
            <ul className="space-y-1">
              {variables.map((v) => (
                <VariableRow
                  key={v.name}
                  name={v.name}
                  onEdit={() => {
                    setEditOriginalName(v.name);
                    setFormName(v.name);
                    setFormValue(v.value ?? "");
                    setVarModalOpen(true);
                  }}
                  onRemove={() => void onRemoveVariable(v.name)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      <VariableDialog
        open={varModalOpen}
        title={editOriginalName ? "Edit Variable" : "Add Variable"}
        name={formName}
        value={formValue}
        onNameChange={setFormName}
        onValueChange={setFormValue}
        onCancel={() => setVarModalOpen(false)}
        onSubmit={async () => {
          const key = formName.trim();
          await onAddVariable(key, formValue);
          if (editOriginalName && editOriginalName !== key) {
            await onRemoveVariable(editOriginalName);
          }
          setVarModalOpen(false);
        }}
      />
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
    <li className="flex items-center gap-1 rounded-md border border-border px-2 py-1">
      <div className="flex-1 truncate text-sm text-foreground" title={name}>
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
  onEdit: () => void;
  onRemove: () => void;
}

const VariableRow = ({ name, onEdit, onRemove }: VariableRowProps) => {
  return (
    <li className="flex items-center gap-1 rounded-md border border-border px-2 py-1">
      <div className="flex-1 truncate text-sm text-foreground" title={name}>
        <span className="font-mono text-[12px] text-muted-foreground">
          {name}
        </span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-foreground"
        onClick={onEdit}
        aria-label={`Edit variable ${name}`}
      >
        <Pencil className="h-4 w-4" />
      </Button>
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

interface VariableDialogProps {
  title: string;
  name: string;
  value: string;
  onNameChange: (v: string) => void;
  onValueChange: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void | Promise<void>;
  open: boolean;
}

const VariableDialog = ({
  title,
  name,
  value,
  onNameChange,
  onValueChange,
  onCancel,
  onSubmit,
  open,
}: VariableDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={(val) => (!val ? onCancel() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          className="mt-1 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            void onSubmit();
          }}
        >
          <label className="block text-xs font-medium text-muted-foreground">
            Name
            <input
              type="text"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="NAME"
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-[13px] text-foreground focus:outline-none"
            />
          </label>
          <label className="block text-xs font-medium text-muted-foreground">
            Value
            <input
              type="text"
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              placeholder="value"
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-[13px] text-foreground focus:outline-none"
            />
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              className="px-3 text-[11px]"
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
