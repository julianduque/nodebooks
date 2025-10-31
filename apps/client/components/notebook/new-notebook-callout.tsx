"use client";

import { Card, CardContent, Button } from "@nodebooks/client-ui/components/ui";
import { Plus as PlusIcon } from "lucide-react";
import { cn } from "@nodebooks/client-ui/lib/utils";

interface NewNotebookCalloutProps {
  onCreate: () => void;
  className?: string;
}

const NewNotebookCallout = ({
  onCreate,
  className,
}: NewNotebookCalloutProps) => {
  return (
    <div className={cn("mt-12 flex justify-center", className)}>
      <Card className="w-full max-w-xl text-center">
        <CardContent className="flex flex-col items-center gap-4 py-10">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-foreground">
              Create your first notebook
            </h2>
            <p className="text-sm text-muted-foreground">
              Start from a blank canvas and add code, markdown, or special
              cells.
            </p>
          </div>
          <Button className="gap-2" onClick={onCreate}>
            <PlusIcon className="h-4 w-4" />
            New notebook
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default NewNotebookCallout;
