"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./dialog.js";
export interface MediaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  src: string;
  mimeType: string;
  sizeLabel?: string;
}

export const MediaDialog = ({
  open,
  onOpenChange,
  title,
  src,
  mimeType,
  sizeLabel,
}: MediaDialogProps) => {
  const [broken, setBroken] = useState(false);
  const isImage = mimeType.startsWith("image/") && !broken;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl gap-4 sm:max-w-6xl">
        <DialogHeader className="space-y-1">
          <DialogTitle className="truncate text-base font-medium" title={title}>
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div
            className="relative w-full overflow-hidden rounded-md"
            style={{ minHeight: "480px", maxHeight: "70vh" }}
          >
            {isImage ? (
              <img
                src={src}
                alt={title}
                className="absolute inset-0 h-full w-full object-contain"
                loading="lazy"
                onError={() => setBroken(true)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                Preview not available
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {mimeType}
            {sizeLabel ? ` • ${sizeLabel}` : null}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
