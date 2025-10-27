"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { DocsPage } from "@/lib/docs-navigation";
import { cn } from "@/lib/utils";

interface DocsSidebarProps {
  items: DocsPage[];
}

export function DocsSidebar({ items }: DocsSidebarProps) {
  const pathname = usePathname();

  return (
    <div className="sticky top-28 flex flex-col gap-3 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">
        Documentation
      </p>
      {items.map((item) => {
        const isActive = pathname === item.href;

        return (
          <Link
            key={item.slug}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "group rounded-lg border border-transparent px-3 py-2 text-left transition-colors hover:border-border/80",
              "hover:bg-muted/60",
              isActive && "border-border bg-muted/70",
            )}
          >
            <span className="block text-sm font-semibold text-foreground">
              {item.title}
            </span>
            <span className="text-xs font-normal text-muted-foreground transition-colors group-hover:text-foreground/80">
              {item.description}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
