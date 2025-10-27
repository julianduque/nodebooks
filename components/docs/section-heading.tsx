import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

interface SectionHeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  id: string;
  children: ReactNode;
}

export function SectionHeading({ id, className, children, ...props }: SectionHeadingProps) {
  return (
    <h2
      id={id}
      className={cn(
        "scroll-mt-28 text-3xl font-semibold tracking-tight text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </h2>
  );
}
