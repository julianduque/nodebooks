import Link from "next/link";
import type { ReactNode } from "react";

import { docsPages } from "@/lib/docs-navigation";

import { SiteFooter } from "@/components/site-footer";
import { ThemeToggle } from "@/components/theme-toggle";
import { DocsSidebar } from "@/components/docs/sidebar";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold text-foreground">
            NodeBooks
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/#features"
              className="hidden text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
            >
              Product
            </Link>
            <Link
              href="/#screenshots"
              className="hidden text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
            >
              Screenshots
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-8 px-6 py-12">
        <nav className="hidden w-64 shrink-0 lg:block">
          <DocsSidebar items={docsPages} />
        </nav>
        <main className="min-w-0 flex-1 pb-16 lg:pb-24">{children}</main>
      </div>
      <SiteFooter />
    </div>
  );
}
