"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, NotebookPen, Trash2 } from "lucide-react";
import ConfirmDialog from "@/components/ui/confirm";
import type { Notebook } from "@nodebooks/notebook-schema";
import { useRouter } from "next/navigation";
import LoadingOverlay from "@/components/ui/loading-overlay";
import NewNotebookCallout from "@/components/notebook/new-notebook-callout";

import { clientConfig } from "@nodebooks/config/client";
const API_BASE_URL = clientConfig().apiBaseUrl;

export default function HomePage() {
  const [list, setList] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/notebooks`);
      const payload = await res.json();
      const notebooks: Notebook[] = Array.isArray(payload?.data)
        ? payload.data
        : [];
      setList(notebooks);

      const projectIds = Array.from(
        new Set(
          notebooks
            .map((nb) => nb.projectId)
            .filter(
              (id): id is string => typeof id === "string" && id.length > 0
            )
        )
      );
      if (projectIds.length > 0) {
        try {
          const projectsResponse = await fetch(`${API_BASE_URL}/projects`);
          if (projectsResponse.ok) {
            const projectsPayload = (await projectsResponse
              .json()
              .catch(() => ({}))) as {
              data?: {
                projects?: {
                  project: { id: string; name: string };
                }[];
              };
            };
            const mapped = new Map<string, string>();
            for (const entry of projectsPayload?.data?.projects ?? []) {
              if (entry?.project?.id) {
                mapped.set(entry.project.id, entry.project.name);
              }
            }
            setProjectNames(Object.fromEntries(mapped.entries()));
          } else {
            setProjectNames({});
          }
        } catch {
          setProjectNames({});
        }
      } else {
        setProjectNames({});
      }
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
      body: JSON.stringify({ template: "blank" }),
    });
    const payload = await res.json();
    const created: Notebook | undefined = payload?.data;
    if (created) router.push(`/notebooks/${created.id}`);
  }, [router]);

  const content = useMemo(() => {
    if (loading) {
      return <LoadingOverlay label="Loading notebooks…" />;
    }
    if (list.length === 0) {
      return <NewNotebookCallout onCreate={handleCreate} />;
    }
    const recent = [...list]
      .sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1))
      .slice(0, 6);
    return (
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {recent.map((item) => (
          <div
            key={item.id}
            className="group relative flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-left text-card-foreground shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
          >
            <button
              type="button"
              onClick={() => handleOpen(item.id)}
              className="text-left"
              aria-label={`Open ${item.name}`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg">
                  <NotebookPen className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-semibold text-card-foreground">
                    {item.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Last opened {new Date(item.updatedAt).toLocaleString()}
                  </p>
                  {item.projectId ? (
                    <Badge variant="outline" className="mt-2 w-fit">
                      {projectNames[item.projectId] ?? "Project"}
                    </Badge>
                  ) : null}
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm">
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
  }, [loading, list, handleCreate, handleOpen, projectNames]);

  return (
    <AppShell title="Home" onNewNotebook={handleCreate}>
      <h1 className="text-3xl font-semibold text-foreground">Home</h1>
      <p className="mt-2 text-muted-foreground">
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
