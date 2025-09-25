"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "../../components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Trash2, Plus } from "lucide-react";
import ConfirmDialog from "@/components/ui/confirm";
import type { Notebook } from "@nodebooks/notebook-schema";
import { useRouter } from "next/navigation";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

export default function NotebooksPage() {
  const [list, setList] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/notebooks`);
      const payload = await res.json();
      setList(Array.isArray(payload?.data) ? payload.data : []);
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
      await fetch(`${API_BASE_URL}/notebooks/${id}`, { method: "DELETE" });
      void refresh();
    },
    [refresh]
  );
  const handleCreate = useCallback(async () => {
    const res = await fetch(`${API_BASE_URL}/notebooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template: "starter" }),
    });
    const payload = await res.json();
    const created: Notebook | undefined = payload?.data;
    if (created) router.push(`/notebooks/${created.id}`);
  }, [router]);

  const content = useMemo(() => {
    if (loading) {
      return (
        <Card className="max-w-md">
          <CardContent className="py-10 text-center text-slate-600">
            Loading…
          </CardContent>
        </Card>
      );
    }
    if (list.length === 0) {
      return (
        <Card className="max-w-xl">
          <CardContent className="flex items-center justify-between gap-4">
            <p className="text-sm text-slate-500">No notebooks yet.</p>
            <Button
              size="sm"
              variant="default"
              className="gap-2"
              onClick={handleCreate}
            >
              <Plus className="h-4 w-4" /> New notebook
            </Button>
          </CardContent>
        </Card>
      );
    }
    return (
      <div className="mt-8 space-y-3">
        {list.map((n) => (
          <Card
            key={n.id}
            className="flex flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <h3 className="truncate text-lg font-semibold text-slate-900">
                {n.name}
              </h3>
              <p className="text-sm text-slate-500">
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
                className="text-rose-600 hover:text-rose-700"
                onClick={() => {
                  setPendingDeleteId(n.id);
                  setConfirmOpen(true);
                }}
                aria-label={`Delete ${n.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
    );
  }, [loading, list, handleCreate, handleOpen]);

  return (
    <AppShell title="Notebooks" onNewNotebook={handleCreate}>
      <h1 className="text-3xl font-semibold text-slate-900">Notebooks</h1>
      <p className="mt-2 text-slate-500">
        Manage all notebooks in your workspace.
      </p>
      {content}
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
