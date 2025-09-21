import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const Card = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "rounded-2xl border border-slate-200 bg-white shadow-sm",
      className
    )}
    {...props}
  />
);

const CardHeader = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("border-b border-slate-200 px-6 py-4", className)}
    {...props}
  />
);

const CardContent = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("px-6 py-4", className)} {...props} />
);

const CardFooter = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("border-t border-slate-200 px-6 py-4", className)}
    {...props}
  />
);

export { Card, CardHeader, CardContent, CardFooter };
