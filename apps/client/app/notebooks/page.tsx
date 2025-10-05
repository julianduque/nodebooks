"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import AppShell from "../../components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Trash2, Download, Upload, Loader2 } from "lucide-react";
import ConfirmDialog from "@/components/ui/confirm";
import type { NotebookWithAccess } from "@/components/notebook/types";
import { useCurrentUser } from "@/components/notebook/hooks/useCurrentUser";
import { useRouter } from "next/navigation";
import LoadingOverlay from "@/components/ui/loading-overlay";
import NewNotebookCallout from "@/components/notebook/new-notebook-callout";

import { clientConfig } from "@nodebooks/config/client";
const API_BASE_URL = clientConfig().apiBaseUrl;

export default function NotebooksPage() {
  const { isAdmin } = useCurrentUser();
  const [list, setList] = useState<NotebookWithAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/notebooks`);
      const payload = await res.json();
      setList(
        Array.isArray(payload?.data)
          ? (payload.data as NotebookWithAccess[])
          : []
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleOpen = useCallback(
    (id: string) => router.push(`/notebooks/${id}`),
    [router]
  );
  const handleDelete = useCallback(
    async (id: string) => {
      if (!isAdmin) {
        setActionError("Only workspace admins can delete notebooks.");
        return;
      }
      await fetch(`${API_BASE_URL}/notebooks/${id}`, { method: "DELETE" });
      void refresh();
    },
    [isAdmin, refresh]
  );
  const handleCreate = useCallback(async () => {
    if (!isAdmin) {
      setActionError("Only workspace admins can create notebooks.");
      return;
    }
    const res = await fetch(`${API_BASE_URL}/notebooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template: "blank" }),
    });
    const payload = await res.json();
    const created: NotebookWithAccess | undefined = payload?.data;
    if (created) router.push(`/notebooks/${created.id}`);
  }, [isAdmin, router]);

  const handleImportClick = useCallback(() => {
    setActionError(null);
    if (!isAdmin) {
      setActionError("Only workspace admins can import notebooks.");
      return;
    }
    fileInputRef.current?.click();
  }, [isAdmin]);

  const handleImportFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      if (!isAdmin) {
        setImporting(false);
        setActionError("Only workspace admins can import notebooks.");
        event.target.value = "";
        return;
      }
      setImporting(true);
      setActionError(null);
      try {
        const contents = await file.text();
        const res = await fetch(`${API_BASE_URL}/notebooks/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents }),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          const message =
            typeof payload?.error === "string"
              ? payload.error
              : "Failed to import notebook";
          throw new Error(message);
        }
        const created: NotebookWithAccess | undefined = payload?.data;
        if (created) {
          router.push(`/notebooks/${created.id}`);
        } else {
          setActionError("Imported notebook but missing response data.");
          void refresh();
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to import notebook";
        setActionError(message);
      } finally {
        setImporting(false);
        event.target.value = "";
      }
    },
    [isAdmin, router, refresh]
  );

  const slugify = useCallback((value: string) => {
    return (
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64) || "notebook"
    );
  }, []);

  const handleExport = useCallback(
    async (notebook: NotebookWithAccess) => {
      setExportingId(notebook.id);
      setActionError(null);
      try {
        const res = await fetch(
          `${API_BASE_URL}/notebooks/${notebook.id}/export`
        );
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          const message =
            typeof payload?.error === "string"
              ? payload.error
              : "Failed to export notebook";
          throw new Error(message);
        }
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        const filename = `${slugify(notebook.name)}.nbdm`;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to export notebook";
        setActionError(message);
      } finally {
        setExportingId(null);
      }
    },
    [slugify]
  );

  return (
    <AppShell
      title="Notebooks"
      onNewNotebook={isAdmin ? handleCreate : undefined}
      headerRight={
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".nbdm,.yaml,.yml"
            className="hidden"
            onChange={handleImportFile}
          />
          <Button
            variant="secondary"
            size="sm"
            className="gap-2"
            onClick={handleImportClick}
            disabled={importing || !isAdmin}
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {importing ? "Importing…" : "Import"}
          </Button>
        </div>
      }
    >
      <h1 className="text-3xl font-semibold text-foreground">Notebooks</h1>
      <p className="mt-2 text-muted-foreground">
        Manage all notebooks in your workspace.
      </p>
      {actionError ? (
        <p className="mt-4 text-sm text-rose-600">{actionError}</p>
      ) : null}
      {loading ? (
        <LoadingOverlay label="Loading notebooks…" />
      ) : list.length === 0 ? (
        isAdmin ? (
          <NewNotebookCallout onCreate={handleCreate} />
        ) : (
          <p className="mt-8 text-sm text-muted-foreground">
            You don’t have any notebooks yet. Ask an admin to share one with
            you.
          </p>
        )
      ) : (
        <div className="mt-8 space-y-3">
          {list.map((n) => (
            <Card
              key={n.id}
              className="flex flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <h3 className="truncate text-lg font-semibold text-card-foreground">
                  {n.name}
                </h3>
                <p className="text-sm text-muted-foreground">
                  Updated {new Date(n.updatedAt).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="default"
                  size="sm"
                  className="gap-2"
                  onClick={() => handleOpen(n.id)}
                >
                  <Play className="h-4 w-4" />
                  Open
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleExport(n)}
                  disabled={exportingId === n.id}
                  aria-label={`Export ${n.name}`}
                  title="Export notebook"
                >
                  {exportingId === n.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </Button>
                {isAdmin ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-rose-600 hover:text-rose-700"
                    onClick={() => {
                      setPendingDeleteId(n.id);
                      setConfirmOpen(true);
                    }}
                    aria-label={`Delete ${n.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={confirmOpen}
        title="Delete notebook?"
        description="This action cannot be undone. The notebook will be permanently removed."
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirmOpen(false)}
        onConfirm={async () => {
          if (pendingDeleteId) await handleDelete(pendingDeleteId);
          setConfirmOpen(false);
          setPendingDeleteId(null);
        }}
      />
    </AppShell>
  );
}
