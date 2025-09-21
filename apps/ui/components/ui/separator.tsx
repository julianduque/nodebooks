import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

interface SeparatorProps extends HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
}

const Separator = ({
  className,
  orientation = "horizontal",
  ...props
}: SeparatorProps) => (
  <div
    className={cn(
      "bg-slate-200",
      orientation === "vertical" ? "h-6 w-px" : "h-px w-full",
      className
    )}
    {...props}
  />
);

export { Separator };
