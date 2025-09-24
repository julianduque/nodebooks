"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight, NotebookPen, Plus, Trash2 } from "lucide-react";
import ConfirmDialog from "../components/ui/confirm";
import type { Notebook } from "@nodebooks/notebook-schema";
import { useRouter } from "next/navigation";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

export default function HomePage() {
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
        <Card className="mt-8 max-w-xl">
          <CardContent className="flex items-center justify-between gap-4">
            <p className="text-sm text-slate-500">
              Spin up a new notebook with example cells.
            </p>
            <Button className="gap-2" onClick={handleCreate}>
              <Plus className="h-4 w-4" />
              Create notebook
            </Button>
          </CardContent>
        </Card>
      );
    }
    const recent = [...list]
      .sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1))
      .slice(0, 6);
    return (
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {recent.map((item) => (
          <div
            key={item.id}
            className="group relative flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-1 hover:border-brand-200 hover:shadow-lg"
          >
            <button
              type="button"
              onClick={() => handleOpen(item.id)}
              className="text-left"
              aria-label={`Open ${item.name}`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <NotebookPen className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-semibold text-slate-900">
                    {item.name}
                  </h3>
                  <p className="text-sm text-slate-500">
                    Last opened {new Date(item.updatedAt).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm text-brand-600">
                <span>Open notebook</span>
                <ChevronRight className="h-4 w-4" />
              </div>
            </button>
            <div className="absolute right-3 top-3 opacity-0 transition group-hover:opacity-100">
              <Button
                variant="ghost"
                size="icon"
                className="text-rose-600 hover:text-rose-700"
                onClick={() => {
                  setPendingDeleteId(item.id);
                  setConfirmOpen(true);
                }}
                aria-label={`Delete ${item.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    );
  }, [loading, list, handleCreate, handleOpen]);

  return (
    <AppShell title="Home" onNewNotebook={handleCreate}>
      <h1 className="text-3xl font-semibold text-slate-900">Home</h1>
      <p className="mt-2 text-slate-500">
        Pick up your recent notebooks or start something new.
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
