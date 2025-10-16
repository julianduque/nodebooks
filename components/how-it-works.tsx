import { Code } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Section } from "@/components/section";
import { workflow } from "@/lib/content";

export function HowItWorksSection() {
  return (
    <Section
      id="how-it-works"
      eyebrow="Build Flow"
      title="How NodeBooks fits into your workflow"
      description="Grab the CLI, spin up a notebook, and stream rich outputs to collaborators in seconds."
    >
      <div className="grid gap-6 lg:grid-cols-3">
        {workflow.map(({ title, description, icon: Icon, code }) => (
          <Card key={title} className="relative h-full border-border/60 bg-card/90 shadow-sm">
            <CardHeader className="space-y-3">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </div>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            {code ? (
              <CardContent>
                <div className="overflow-hidden rounded-lg border border-border/60 bg-muted/30 text-sm">
                  <div className="flex items-center gap-2 border-b border-border/50 bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Code className="h-3.5 w-3.5" aria-hidden="true" />
                    CLI
                  </div>
                  <pre className="px-3 py-3 text-sm text-foreground">
                    <code>{code}</code>
                  </pre>
                </div>
              </CardContent>
            ) : null}
          </Card>
        ))}
      </div>
    </Section>
  );
}
