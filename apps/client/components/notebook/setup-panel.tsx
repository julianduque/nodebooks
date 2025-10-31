"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Input,
  Textarea,
  InputGroup,
  InputGroupInput,
  InputGroupButton,
} from "@nodebooks/client-ui/components/ui";
import {
  Database,
  Pencil,
  Trash2,
  Plus as PlusIcon,
  Loader2,
} from "lucide-react";
import type { Notebook, SqlConnection } from "@nodebooks/notebook-schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nodebooks/client-ui/components/ui";
import { Separator } from "@nodebooks/client-ui/components/ui";

interface SetupPanelProps {
  env: Notebook["env"];
  sql: Notebook["sql"];
  onRemoveDependency: (name: string) => Promise<void> | void;
  onAddDependencies: (raw: string) => Promise<void> | void;
  depBusy?: boolean;
  onAddVariable: (name: string, value: string) => Promise<void> | void;
  onRemoveVariable: (name: string) => Promise<void> | void;
  onAddSqlConnection: (input: {
    driver: SqlConnection["driver"];
    name: string;
    connectionString: string;
  }) => Promise<void> | void;
  onUpdateSqlConnection: (
    id: string,
    updates: { name?: string; connectionString?: string }
  ) => Promise<void> | void;
  onRemoveSqlConnection: (id: string) => Promise<void> | void;
  canEdit: boolean;
  openConnectionTrigger?: number;
}

const SetupPanel = ({
  env,
  sql,
  onRemoveDependency,
  onAddDependencies,
  depBusy = false,
  onAddVariable,
  onRemoveVariable,
  onAddSqlConnection,
  onUpdateSqlConnection,
  onRemoveSqlConnection,
  canEdit,
  openConnectionTrigger = 0,
}: SetupPanelProps) => {
  const [draft, setDraft] = useState("");
  // Variable modal state
  const [varModalOpen, setVarModalOpen] = useState(false);
  const [editOriginalName, setEditOriginalName] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formValue, setFormValue] = useState("");
  const [connectionModalOpen, setConnectionModalOpen] = useState(false);
  const [editingConnectionId, setEditingConnectionId] = useState<string | null>(
    null
  );
  const [connectionName, setConnectionName] = useState("");
  const [connectionDriver, setConnectionDriver] =
    useState<SqlConnection["driver"]>("postgres");
  const [connectionString, setConnectionString] = useState("");
  const [connectionError, setConnectionError] = useState<string | null>(null);
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
  const connections = useMemo(
    () => (sql.connections ?? []).map((conn) => conn),
    [sql.connections]
  );
  const describeDriver = (driver: SqlConnection["driver"]) => {
    switch (driver) {
      case "postgres":
        return "PostgreSQL";
      default:
        return driver;
    }
  };

  const openConnectionModal = useCallback(
    (connection?: SqlConnection) => {
      if (!canEdit) {
        return;
      }
      if (connection) {
        setEditingConnectionId(connection.id);
        setConnectionName(connection.name ?? "");
        setConnectionDriver(connection.driver);
        setConnectionString(connection.config?.connectionString ?? "");
      } else {
        setEditingConnectionId(null);
        setConnectionName("");
        setConnectionDriver("postgres");
        setConnectionString("");
      }
      setConnectionError(null);
      setConnectionModalOpen(true);
    },
    [canEdit]
  );

  useEffect(() => {
    if (!canEdit) {
      return;
    }
    if (!openConnectionTrigger) {
      return;
    }
    openConnectionModal();
  }, [canEdit, openConnectionModal, openConnectionTrigger]);
  return (
    <div className="flex h-full flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
        Dependencies
      </p>
      <div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!canEdit || depBusy) {
              return;
            }
            if (draft.trim().length > 0) {
              void onAddDependencies(draft.trim());
              setDraft("");
            }
          }}
        >
          <InputGroup data-disabled={!canEdit}>
            <InputGroupInput
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="package or package@version"
              className="text-sm"
              aria-label="Add dependency"
              disabled={!canEdit}
            />
            <InputGroupButton
              type="submit"
              size="icon-sm"
              variant="ghost"
              aria-label="Add dependency"
              disabled={depBusy || !canEdit}
            >
              {depBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PlusIcon className="h-4 w-4" />
              )}
            </InputGroupButton>
          </InputGroup>
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
                canEdit={canEdit}
              />
            ))}
          </ul>
        )}
      </div>
      <Separator className="my-2" />
      <div className="mt-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
          Environment Variables
        </p>
        <div className="mt-2 flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            Available via <span className="font-mono">process.env.NAME</span> in
            code.
          </p>
          {canEdit ? (
            <Button
              type="button"
              variant="default"
              size="sm"
              className="flex items-center gap-1 px-3 text-[11px]"
              onClick={() => {
                setEditOriginalName(null);
                setFormName("");
                setFormValue("");
                setVarModalOpen(true);
              }}
            >
              <PlusIcon className="h-3.5 w-3.5" /> Add Variable
            </Button>
          ) : null}
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
                  canEdit={canEdit}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
      <Separator className="my-2" />
      <div className="mt-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
          Database Connections
        </p>
        <div className="mt-2 flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            Share connection details across SQL cells.
          </p>
          {canEdit ? (
            <Button
              type="button"
              variant="default"
              size="sm"
              className="flex items-center gap-1 px-3 text-[11px]"
              onClick={() => openConnectionModal()}
            >
              <PlusIcon className="h-3.5 w-3.5" /> Add Connection
            </Button>
          ) : null}
        </div>
        <div className="mt-2">
          {connections.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No connections configured.
            </p>
          ) : (
            <ul className="space-y-2">
              {connections.map((connection) => (
                <li
                  key={connection.id}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-3 shadow-sm sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="flex flex-1 flex-col gap-2 text-sm min-w-0">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border/60 bg-background/70 text-muted-foreground">
                        <Database className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold text-foreground">
                            {connection.name?.trim().length
                              ? connection.name
                              : "Untitled Connection"}
                          </span>
                          <Badge
                            variant="secondary"
                            className="text-[10px] uppercase tracking-wide"
                          >
                            {describeDriver(connection.driver)}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Available to SQL cells via connection picker.
                        </p>
                      </div>
                    </div>
                  </div>
                  {canEdit ? (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => openConnectionModal(connection)}
                        aria-label="Edit connection"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive/90"
                        onClick={() =>
                          void onRemoveSqlConnection(connection.id)
                        }
                        aria-label="Remove connection"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : null}
                </li>
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
          if (!canEdit) {
            return;
          }
          const key = formName.trim();
          await onAddVariable(key, formValue);
          if (editOriginalName && editOriginalName !== key) {
            await onRemoveVariable(editOriginalName);
          }
          setVarModalOpen(false);
        }}
        readOnly={!canEdit}
      />
      <ConnectionDialog
        open={connectionModalOpen}
        mode={editingConnectionId ? "edit" : "create"}
        name={connectionName}
        driver={connectionDriver}
        connectionString={connectionString}
        error={connectionError}
        onNameChange={setConnectionName}
        onDriverChange={setConnectionDriver}
        onConnectionStringChange={setConnectionString}
        onCancel={() => {
          setConnectionModalOpen(false);
          setConnectionError(null);
        }}
        onSubmit={async () => {
          if (!canEdit) {
            return;
          }
          const trimmedString = connectionString.trim();
          if (!trimmedString) {
            setConnectionError("Connection string is required");
            return;
          }
          const trimmedName = connectionName.trim();
          try {
            if (editingConnectionId) {
              await onUpdateSqlConnection(editingConnectionId, {
                name: trimmedName,
                connectionString: trimmedString,
              });
            } else {
              await onAddSqlConnection({
                driver: connectionDriver,
                name: trimmedName,
                connectionString: trimmedString,
              });
            }
            setConnectionModalOpen(false);
            setConnectionError(null);
          } catch (err) {
            setConnectionError(
              err instanceof Error ? err.message : "Failed to save connection"
            );
          }
        }}
        readOnly={!canEdit}
      />
    </div>
  );
};

interface DependencyRowProps {
  name: string;
  version?: string;
  onRemove: () => void;
  canEdit: boolean;
}

const DependencyRow = ({
  name,
  version,
  onRemove,
  canEdit,
}: DependencyRowProps) => {
  return (
    <li className="flex items-center gap-1 rounded-md border border-border px-2 py-1">
      <div className="flex-1 truncate text-sm text-foreground" title={name}>
        {name}
      </div>
      <Badge variant="secondary" className="font-mono text-[11px]">
        {version || "latest"}
      </Badge>
      {canEdit ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive/80"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      ) : null}
    </li>
  );
};

export default SetupPanel;

interface VariableRowProps {
  name: string;
  onEdit: () => void;
  onRemove: () => void;
  canEdit: boolean;
}

const VariableRow = ({ name, onEdit, onRemove, canEdit }: VariableRowProps) => {
  return (
    <li className="flex items-center gap-1 rounded-md border border-border px-2 py-1">
      <div className="flex-1 truncate text-sm text-foreground" title={name}>
        <span className="font-mono text-[12px] text-muted-foreground">
          {name}
        </span>
      </div>
      {canEdit ? (
        <>
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
            className="text-destructive hover:text-destructive/90"
            onClick={onRemove}
            aria-label={`Remove variable ${name}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      ) : null}
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
  readOnly: boolean;
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
  readOnly,
}: VariableDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={(val) => (!val ? onCancel() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {title.includes("Edit")
              ? "Update the environment variable details."
              : "Create a new environment variable for this notebook."}
          </DialogDescription>
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
            <Input
              type="text"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="NAME"
              className="mt-1 text-sm"
              disabled={readOnly}
            />
          </label>
          <label className="block text-xs font-medium text-muted-foreground">
            Value
            <Input
              type="text"
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              placeholder="value"
              className="mt-1 text-sm"
              disabled={readOnly}
            />
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" variant="default" disabled={readOnly}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

interface ConnectionDialogProps {
  open: boolean;
  mode: "create" | "edit";
  name: string;
  driver: SqlConnection["driver"];
  connectionString: string;
  error: string | null;
  onNameChange: (value: string) => void;
  onDriverChange: (driver: SqlConnection["driver"]) => void;
  onConnectionStringChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  readOnly: boolean;
}

const ConnectionDialog = ({
  open,
  mode,
  name,
  driver,
  connectionString,
  error,
  onNameChange,
  onDriverChange,
  onConnectionStringChange,
  onCancel,
  onSubmit,
  readOnly,
}: ConnectionDialogProps) => {
  const title = mode === "edit" ? "Edit Connection" : "Add Connection";
  return (
    <Dialog open={open} onOpenChange={(val) => (!val ? onCancel() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "Update the database connection details."
              : "Create a new database connection for SQL cells."}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-1 space-y-3">
          <label className="block text-xs font-medium text-muted-foreground">
            Name
            <Input
              type="text"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Production database"
              className="mt-1 text-sm"
              disabled={readOnly}
            />
          </label>
          <label className="block text-xs font-medium text-muted-foreground">
            Driver
            <select
              value={driver}
              onChange={(e) =>
                onDriverChange(e.target.value as SqlConnection["driver"])
              }
              className="mt-1 flex h-9 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm transition focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
              disabled
            >
              <option value="postgres">PostgreSQL</option>
            </select>
            <span className="mt-1 block text-[11px] text-muted-foreground">
              Additional drivers will be supported in future releases.
            </span>
          </label>
          <label className="block text-xs font-medium text-muted-foreground">
            Connection string
            <Textarea
              value={connectionString}
              onChange={(e) => onConnectionStringChange(e.target.value)}
              placeholder="postgres://user:password@host:5432/database"
              className="mt-1 text-sm"
              rows={3}
              disabled={readOnly}
            />
          </label>
          {error ? <p className="text-xs text-rose-500">{error}</p> : null}
        </div>
        <DialogFooter className="mt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={onSubmit} disabled={readOnly}>
            {mode === "edit" ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
