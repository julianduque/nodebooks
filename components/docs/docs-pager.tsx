import Link from "next/link";

import { ArrowLeft, ArrowRight } from "lucide-react";

import type { DocsPageSlug } from "@/lib/docs-navigation";
import { getAdjacentDocs } from "@/lib/docs-navigation";
import { cn } from "@/lib/utils";

interface DocsPagerProps {
  slug: DocsPageSlug;
}

export function DocsPager({ slug }: DocsPagerProps) {
  const { previous, next } = getAdjacentDocs(slug);

  if (!previous && !next) {
    return null;
  }

  return (
    <div className="mt-16 border-t border-border/60 pt-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
        {previous ? (
          <PagerLink
            direction="previous"
            href={previous.href}
            title={previous.title}
            description={previous.description}
          />
        ) : null}
        {next ? (
          <PagerLink
            direction="next"
            href={next.href}
            title={next.title}
            description={next.description}
            className={cn(!previous && "sm:ml-auto")}
          />
        ) : null}
      </div>
    </div>
  );
}

interface PagerLinkProps {
  direction: "previous" | "next";
  href: string;
  title: string;
  description: string;
  className?: string;
}

function PagerLink({ direction, href, title, description, className }: PagerLinkProps) {
  const isNext = direction === "next";
  const Icon = isNext ? ArrowRight : ArrowLeft;

  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-1 items-center gap-4 rounded-2xl border border-border/60 bg-card/40 p-5 transition hover:border-border",
        "hover:bg-muted/40",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground transition group-hover:border-border group-hover:text-foreground",
          isNext && "order-3",
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className={cn("flex flex-1 flex-col", isNext && "items-end text-right")}>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {isNext ? "Next" : "Previous"}
        </span>
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>
    </Link>
  );
}
