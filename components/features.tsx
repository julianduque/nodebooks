import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Section } from "@/components/section";
import { features } from "@/lib/content";

export function FeaturesSection() {
  return (
    <Section
      id="features"
      eyebrow="Why NodeBooks"
      title="A full Node.js notebook stack"
      description="Everything you need to prototype, collaborate, and ship interactive notebooks with TypeScript."
    >
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {features.map(({ title, description, icon: Icon }) => (
          <Card
            key={title}
            className="h-full border-border/60 bg-card/80 transition-transform hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
          >
            <CardHeader className="space-y-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </div>
              <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>{description}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
    </Section>
  );
}
