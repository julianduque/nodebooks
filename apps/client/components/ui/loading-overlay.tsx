"use client";

import { LoaderCircle } from "lucide-react";
import React from "react";

interface LoadingOverlayProps {
  label?: string;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  label = "Loading…",
}) => {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/60 backdrop-blur-sm">
      <div className="rounded-xl border border-border bg-card px-6 py-5 text-card-foreground shadow-lg">
        <div className="flex items-center gap-3">
          <LoaderCircle className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{label}</span>
        </div>
      </div>
    </div>
  );
};

export default LoadingOverlay;
