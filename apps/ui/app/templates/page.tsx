"use client";

import AppShell from "../../components/AppShell";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Plus } from "lucide-react";
import { useCallback } from "react";
import type { Notebook } from "@nodebooks/notebook-schema";
import { useRouter } from "next/navigation";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

const TEMPLATES = [
  {
    id: "api-testing",
    title: "API Testing",
    description: "Preconfigured requests and helpers for REST endpoints.",
    templateId: "starter",
    badge: "Template",
    badgeClass: "bg-emerald-100 text-emerald-700",
  },
  {
    id: "data-viz",
    title: "Data Visualization",
    description: "Plot data with TypeScript and popular charting libs.",
    templateId: "typescript",
    badge: "Template",
    badgeClass: "bg-sky-100 text-sky-700",
  },
  {
    id: "llm-agents",
    title: "LLM Agents",
    description: "Start orchestrating AI prompts and tool invocations.",
    templateId: "typescript",
    badge: "Template",
    badgeClass: "bg-purple-100 text-purple-700",
  },
  {
    id: "web-scraping",
    title: "Web Scraping",
    description: "Kick off scraping flows with Puppeteer snippets.",
    templateId: "blank",
    badge: "Template",
    badgeClass: "bg-amber-100 text-amber-700",
  },
];

export default function TemplatesPage() {
  const router = useRouter();
  const createFrom = useCallback(
    async (template: string) => {
      const res = await fetch(`${API_BASE_URL}/notebooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template }),
      });
      const payload = await res.json();
      const created: Notebook | undefined = payload?.data;
      if (created) router.push(`/notebooks/${created.id}`);
    },
    [router]
  );

  return (
    <AppShell title="Templates" onNewNotebook={() => createFrom("starter")}>
      <h1 className="text-3xl font-semibold text-slate-900">
        Template Gallery
      </h1>
      <p className="mt-2 text-slate-500">
        Jump into curated setups for common workflows.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {TEMPLATES.map((t) => (
          <Card key={t.id} className="border-slate-200 bg-white/90 shadow-sm">
            <CardContent className="space-y-4 px-6 py-5">
              <Badge className={`w-fit ${t.badgeClass}`}>{t.badge}</Badge>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-slate-900">
                  {t.title}
                </h3>
                <p className="text-sm text-slate-500">{t.description}</p>
              </div>
              <Button
                size="sm"
                className="gap-2"
                onClick={() => createFrom(t.templateId)}
              >
                <Plus className="h-4 w-4" />
                Use template
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
