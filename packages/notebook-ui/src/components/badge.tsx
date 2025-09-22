import React from "react";
import type { UiBadge } from "@nodebooks/notebook-schema";

type BadgeProps = UiBadge & { className?: string };
const badgeColor = (c?: UiBadge["color"]) => {
  switch (c) {
    case "info":
      return "bg-sky-100 text-sky-800 border-sky-300";
    case "success":
      return "bg-emerald-100 text-emerald-800 border-emerald-300";
    case "warn":
      return "bg-amber-100 text-amber-900 border-amber-300";
    case "error":
      return "bg-rose-100 text-rose-800 border-rose-300";
    case "brand":
      return "bg-brand-100 text-brand-800 border-brand-300";
    default:
      return "bg-slate-100 text-slate-800 border-slate-300";
  }
};

export const BadgeTag: React.FC<BadgeProps> = ({ text, color, className }) => {
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold ${badgeColor(
        color
      )} ${className ?? ""}`}
    >
      {text}
    </span>
  );
};
