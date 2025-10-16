import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

interface SiteFooterProps {
  className?: string;
}

export function SiteFooter({ className }: SiteFooterProps) {
  return (
    <footer className={cn("border-t border-border/60 bg-background/95 backdrop-blur", className)}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="space-y-2 text-sm text-muted-foreground">
          <p className="text-foreground font-medium">
            Made with 💚 by{" "}
            <Link
              href="https://julianduque.co"
              target="_blank"
              rel="noreferrer"
              className="hover:text-primary"
            >
              Julián Duque
            </Link>
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="https://github.com/julianduque/nodebooks"
              target="_blank"
              rel="noreferrer"
              className="hover:text-primary"
            >
              GitHub
            </Link>
            <span aria-hidden="true">•</span>
            <Link href="https://github.com/julianduque/nodebooks/blob/main/LICENSE" target="_blank">
              MIT License
            </Link>
            <span aria-hidden="true">•</span>
            <span>© {new Date().getFullYear()} NodeBooks and contributors</span>
          </div>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Theme</p>
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}
