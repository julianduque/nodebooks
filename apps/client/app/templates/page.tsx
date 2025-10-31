"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/app-shell";
import {
  AlertCallout,
  Card,
  CardContent,
  Badge,
  Button,
} from "@nodebooks/client-ui/components/ui";
import { Plus as PlusIcon } from "lucide-react";
import type { Notebook } from "@/types/notebook";
import {
  NotebookTemplateSummarySchema,
  type NotebookTemplateSummary,
} from "@nodebooks/notebook-schema";
import type { NotebookTemplateId } from "@/components/notebook/types";
import { useRouter } from "next/navigation";
import { LoadingOverlay } from "@nodebooks/client-ui/components/ui";

import { clientConfig } from "@nodebooks/config/client";
const API_BASE_URL = clientConfig().apiBaseUrl;

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<NotebookTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetchTemplates = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/templates`, {
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) {
          throw new Error(`Failed to load templates (status ${res.status})`);
        }
        const payload = await res.json();
        const parsed = NotebookTemplateSummarySchema.array().safeParse(
          payload?.data
        );
        if (!parsed.success) {
          throw new Error("Received an invalid template payload");
        }
        if (active) {
          const sorted = [...parsed.data].sort((a, b) => {
            if (a.order === b.order) {
              return a.title.localeCompare(b.title);
            }
            return a.order - b.order;
          });
          setTemplates(sorted);
          setError(null);
        }
      } catch (err) {
        if (active) {
          const message =
            err instanceof Error ? err.message : "Unable to load templates";
          setError(message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void fetchTemplates();
    return () => {
      active = false;
    };
  }, []);

  const createFrom = useCallback(
    async (template: NotebookTemplateId = "blank") => {
      try {
        const res = await fetch(`${API_BASE_URL}/notebooks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template }),
        });
        if (!res.ok) {
          throw new Error(`Failed to create notebook (status ${res.status})`);
        }
        const payload = await res.json();
        const created: Notebook | undefined = payload?.data;
        if (created) router.push(`/notebooks/${created.id}`);
      } catch (err) {
        console.error(err);
      }
    },
    [router]
  );

  const content = useMemo(() => {
    if (loading) {
      return <LoadingOverlay label="Loading templates…" />;
    }

    if (error) {
      return (
        <div className="max-w-md">
          <AlertCallout level="error" text={error} />
        </div>
      );
    }

    if (templates.length === 0) {
      return (
        <Card className="max-w-xl">
          <CardContent className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              No templates available yet. Check back soon!
            </p>
            <Button size="sm" className="gap-2" onClick={() => createFrom()}>
              <PlusIcon className="h-4 w-4" />
              New notebook
            </Button>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => {
          const badgeTone = template.badge.tone ?? "slate";
          return (
            <Card
              key={template.id}
              className="border-border bg-card text-card-foreground shadow-sm"
            >
              <CardContent className="space-y-4 px-6 py-5">
                <Badge
                  className="template-tone-badge w-fit"
                  data-template-tone={badgeTone}
                >
                  {template.badge.text}
                </Badge>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-card-foreground">
                    {template.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {template.description}
                  </p>
                  {template.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {template.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className="uppercase tracking-wide text-[10px]"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="default"
                  className="gap-2"
                  onClick={() => createFrom(template.id)}
                >
                  <PlusIcon className="h-4 w-4" />
                  Use template
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }, [loading, error, templates, createFrom]);

  return (
    <AppShell title="Templates" onNewNotebook={() => createFrom("blank")}>
      <h1 className="text-3xl font-semibold text-foreground">
        Template Gallery
      </h1>
      <p className="mt-2 text-muted-foreground">
        Jump into curated setups for common workflows.
      </p>
      {content}
    </AppShell>
  );
}
