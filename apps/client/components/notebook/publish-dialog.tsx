"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nodebooks/client-ui/components/ui";
import { Input, Button } from "@nodebooks/client-ui/components/ui";

interface PublishDialogProps {
  open: boolean;
  kind: "notebook" | "project";
  defaultSlug?: string | null;
  suggestedSlug?: string | null;
  submitting?: boolean;
  error?: string | null;
  onOpenChange(open: boolean): void;
  onSubmit(slug: string | null): Promise<void> | void;
}

const kindLabels = {
  notebook: {
    title: "Publish notebook",
    confirm: "Publish",
    description:
      "Make this notebook publicly accessible. You can share the generated URL with anyone.",
  },
  project: {
    title: "Publish project",
    confirm: "Publish",
    description:
      "Publish all notebooks for this project. Only notebooks marked as published will appear in the public navigation.",
  },
} as const;

const normalizeValue = (value: string) => value.trim();

const PublishDialog = ({
  open,
  kind,
  defaultSlug,
  suggestedSlug,
  submitting,
  error,
  onOpenChange,
  onSubmit,
}: PublishDialogProps) => {
  const labels = useMemo(() => kindLabels[kind], [kind]);
  const [value, setValue] = useState("");

  useEffect(() => {
    if (open) {
      const fallback = defaultSlug ?? suggestedSlug ?? "";
      setValue(fallback);
    }
  }, [open, defaultSlug, suggestedSlug]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeValue(value);
    await onSubmit(normalized.length > 0 ? normalized : null);
  };

  const handleUseSuggestion = () => {
    if (suggestedSlug) {
      setValue(suggestedSlug);
    }
  };

  const showSuggestionButton = Boolean(
    suggestedSlug && normalizeValue(value) !== normalizeValue(suggestedSlug)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <DialogHeader>
            <DialogTitle>{labels.title}</DialogTitle>
            <DialogDescription>{labels.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="publish-slug"
            >
              Public slug
            </label>
            <Input
              id="publish-slug"
              placeholder="auto-generate"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to generate a slug automatically. Only lowercase
              letters, numbers, and hyphens will be used.
            </p>
            {showSuggestionButton ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-1 h-7 px-2 text-xs"
                onClick={handleUseSuggestion}
              >
                {suggestedSlug
                  ? `Use suggested slug “${suggestedSlug}”`
                  : "Use suggested slug"}
              </Button>
            ) : null}
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Publishing…" : labels.confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default PublishDialog;
