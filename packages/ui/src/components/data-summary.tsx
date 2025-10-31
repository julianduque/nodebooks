"use client";
import React from "react";
import type { UiDataSummary } from "@nodebooks/notebook-schema";
import {
  deriveColumns,
  renderCellValue,
  useComponentThemeMode,
} from "./utils.js";

type DataSummaryProps = Omit<UiDataSummary, "ui"> & {
  className?: string;
  themeMode?: "light" | "dark";
};

export const DataSummary: React.FC<DataSummaryProps> = ({
  title,
  schema,
  stats,
  sample,
  note,
  className,
  themeMode,
}) => {
  const mode = useComponentThemeMode(themeMode);
  const sampleCols = React.useMemo(() => deriveColumns(sample ?? []), [sample]);
  const statEntries = React.useMemo(
    () => (stats ? Object.entries(stats) : []),
    [stats]
  );

  const renderStat = (label: string, value: unknown) => {
    if (typeof value !== "number" && typeof value !== "string") return null;
    return (
      <div className="rounded-lg border border-border bg-card/70 px-3 py-2 text-sm shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </div>
        <div className="text-lg font-semibold text-card-foreground">
          {value}
        </div>
      </div>
    );
  };

  return (
    <div className={`relative ${className ?? ""}`} data-theme-mode={mode}>
      {title ? (
        <h3 className="mb-2 text-lg font-semibold text-card-foreground">
          {title}
        </h3>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border/60 px-3 py-2 text-sm font-semibold text-muted-foreground">
            Schema
          </div>
          <div className="max-h-64 overflow-auto p-2">
            {schema && schema.length > 0 ? (
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-left">Nullable</th>
                  </tr>
                </thead>
                <tbody>
                  {schema.map((f, index) => (
                    <tr
                      key={f.name}
                      className={
                        index % 2 === 0 ? "bg-background" : "bg-muted/40"
                      }
                    >
                      <td className="border border-border/60 px-3 py-2 text-sm text-primary">
                        {f.name}
                      </td>
                      <td className="border border-border/60 px-3 py-2 text-sm text-foreground">
                        {f.type}
                      </td>
                      <td className="border border-border/60 px-3 py-2 text-sm text-muted-foreground">
                        {String(f.nullable ?? true)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                No schema provided
              </div>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border/60 px-3 py-2 text-sm font-semibold text-muted-foreground">
            Field stats
          </div>
          <div className="max-h-64 overflow-auto p-3">
            {statEntries.length > 0 ? (
              <div className="space-y-3">
                {statEntries.map(([key, field]) => (
                  <div
                    key={key}
                    className="rounded-lg border border-border bg-card/60"
                  >
                    <div className="border-b border-border/60 px-3 py-2 text-sm font-semibold text-card-foreground">
                      {key}
                    </div>
                    <div className="grid grid-cols-2 gap-2 p-3 text-xs md:grid-cols-3">
                      {renderStat("count", field.count)}
                      {renderStat("distinct", field.distinct)}
                      {renderStat("nulls", field.nulls)}
                      {renderStat("min", field.min)}
                      {renderStat("max", field.max)}
                      {renderStat("mean", field.mean)}
                      {renderStat("median", field.median)}
                      {renderStat("p25", field.p25)}
                      {renderStat("p75", field.p75)}
                      {renderStat("stddev", field.stddev)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                No stats provided
              </div>
            )}
          </div>
        </div>
      </div>
      {note ? (
        <div className="mt-4 rounded-lg border border-dashed border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {note}
        </div>
      ) : null}
      {sample && sample.length > 0 ? (
        <div className="mt-4 rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border/60 px-3 py-2 text-sm font-semibold text-muted-foreground">
            Sample rows
          </div>
          <div className="max-h-72 overflow-auto p-2">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="bg-muted/60 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {sampleCols.map((col) => (
                    <th key={col.key} className="px-3 py-2">
                      {col.label ?? col.key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sample.map((row, idx) => (
                  <tr
                    key={idx}
                    className={idx % 2 === 0 ? "bg-background" : "bg-muted/40"}
                  >
                    {sampleCols.map((col) => (
                      <td
                        key={col.key}
                        className="border border-border/60 px-3 py-2 text-sm"
                      >
                        {renderCellValue(
                          (row as Record<string, unknown>)[col.key]
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
};
