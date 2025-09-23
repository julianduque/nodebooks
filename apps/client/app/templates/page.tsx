"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "../../components/AppShell";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Plus } from "lucide-react";
import type { Notebook } from "@nodebooks/notebook-schema";
import {
  NotebookTemplateSummarySchema,
  type NotebookTemplateSummary,
  type TemplateBadgeTone,
} from "@nodebooks/notebook-schema";
import type { NotebookTemplateId } from "../../components/notebook/types";
import { useRouter } from "next/navigation";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

const BADGE_TONE_CLASSES: Record<TemplateBadgeTone, string> = {
  slate: "border border-slate-300 bg-slate-200 text-slate-800",
  emerald: "border border-emerald-300 bg-emerald-200 text-emerald-900",
  sky: "border border-sky-300 bg-sky-200 text-sky-900",
  purple: "border border-purple-300 bg-purple-200 text-purple-900",
  amber: "border border-amber-300 bg-amber-200 text-amber-900",
};

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
    async (template: NotebookTemplateId = "starter") => {
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
      return (
        <Card className="max-w-md">
          <CardContent className="py-10 text-center text-slate-600">
            Loading templates…
          </CardContent>
        </Card>
      );
    }

    if (error) {
      return (
        <Card className="max-w-md border-amber-300 bg-amber-50/80">
          <CardContent className="py-6 text-center text-amber-700">
            {error}
          </CardContent>
        </Card>
      );
    }

    if (templates.length === 0) {
      return (
        <Card className="max-w-xl">
          <CardContent className="flex items-center justify-between gap-4">
            <p className="text-sm text-slate-500">
              No templates available yet. Check back soon!
            </p>
            <Button size="sm" className="gap-2" onClick={() => createFrom()}>
              <Plus className="h-4 w-4" />
              New notebook
            </Button>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => {
          const badgeClass =
            BADGE_TONE_CLASSES[template.badge.tone] ??
            BADGE_TONE_CLASSES.slate;
          return (
            <Card
              key={template.id}
              className="border-slate-200 bg-white/90 shadow-sm"
            >
              <CardContent className="space-y-4 px-6 py-5">
                <Badge className={`w-fit ${badgeClass}`}>
                  {template.badge.text}
                </Badge>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-slate-900">
                    {template.title}
                  </h3>
                  <p className="text-sm text-slate-500">
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
                  variant="secondary"
                  className="gap-2"
                  onClick={() => createFrom(template.id)}
                >
                  <Plus className="h-4 w-4" />
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
    <AppShell title="Templates" onNewNotebook={() => createFrom("starter")}> 
      <h1 className="text-3xl font-semibold text-slate-900">Template Gallery</h1>
      <p className="mt-2 text-slate-500">
        Jump into curated setups for common workflows.
      </p>
      {content}
    </AppShell>
  );
}
