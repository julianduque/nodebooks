import type { MDXComponents } from "mdx/types";

import { cn } from "@/lib/utils";

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: ({ className, ...props }) => (
      <h1
        className={cn(
          "mb-6 text-4xl font-bold tracking-tight text-foreground first:mt-0",
          className,
        )}
        {...props}
      />
    ),
    h2: ({ className, ...props }) => (
      <h2
        className={cn(
          "mt-12 scroll-mt-28 text-3xl font-semibold tracking-tight text-foreground",
          className,
        )}
        {...props}
      />
    ),
    h3: ({ className, ...props }) => (
      <h3
        className={cn("mt-8 text-2xl font-semibold tracking-tight text-foreground", className)}
        {...props}
      />
    ),
    p: ({ className, ...props }) => (
      <p className={cn("mt-4 text-base leading-7 text-muted-foreground", className)} {...props} />
    ),
    ul: ({ className, ...props }) => (
      <ul
        className={cn("mt-4 list-disc space-y-2 pl-6 text-muted-foreground", className)}
        {...props}
      />
    ),
    ol: ({ className, ...props }) => (
      <ol
        className={cn("mt-4 list-decimal space-y-2 pl-6 text-muted-foreground", className)}
        {...props}
      />
    ),
    li: ({ className, ...props }) => (
      <li className={cn("leading-7 text-muted-foreground", className)} {...props} />
    ),
    a: ({ className, children, ...props }) => (
      <a
        className={cn("font-medium text-primary underline-offset-4 hover:underline", className)}
        {...props}
      >
        {children}
      </a>
    ),
    code: ({ className, ...props }) => (
      <code
        className={cn(
          "rounded-lg bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground",
          className,
        )}
        {...props}
      />
    ),
    pre: ({ className, ...props }) => (
      <pre
        className={cn(
          "mt-6 overflow-x-auto rounded-2xl border border-border/60 bg-muted/70 p-5 text-sm leading-6 text-foreground",
          className,
        )}
        {...props}
      />
    ),
    blockquote: ({ className, ...props }) => (
      <blockquote
        className={cn(
          "mt-6 border-l-4 border-primary/60 bg-primary/10 px-6 py-4 text-base italic text-primary-foreground",
          className,
        )}
        {...props}
      />
    ),
    table: ({ className, ...props }) => (
      <div className="mt-6 overflow-hidden rounded-2xl border border-border/60">
        <table className={cn("w-full table-auto text-left text-sm", className)} {...props} />
      </div>
    ),
    th: ({ className, ...props }) => (
      <th
        className={cn(
          "bg-muted px-4 py-2 text-xs font-semibold uppercase tracking-wide",
          className,
        )}
        {...props}
      />
    ),
    td: ({ className, ...props }) => (
      <td className={cn("px-4 py-2 text-sm text-muted-foreground", className)} {...props} />
    ),
    ...components,
  };
}
