import * as React from "react";

import { cn } from "../../lib/utils.js";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex w-full min-h-20 resize-y rounded-md border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 placeholder:text-muted-foreground aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
