import { cn } from "@/lib/utils";
import type { FeatureItem } from "@/lib/content";

interface FeatureListProps {
  items: FeatureItem[];
  className?: string;
}

export function FeatureList({ items, className }: FeatureListProps) {
  return (
    <ul className={cn("grid gap-4 sm:grid-cols-2", className)}>
      {items.map(({ title, description, icon: Icon }) => (
        <li
          key={title}
          className="flex gap-4 rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm transition-colors hover:border-primary/50"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="space-y-1">
            <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
