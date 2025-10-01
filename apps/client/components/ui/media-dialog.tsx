"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
export interface MediaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  src: string;
  mimeType: string;
  sizeLabel?: string;
}

const MediaDialog = ({
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
              <Image
                src={src}
                alt={title}
                fill
                unoptimized
                sizes="90vw"
                style={{ objectFit: "contain" }}
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

export default MediaDialog;
