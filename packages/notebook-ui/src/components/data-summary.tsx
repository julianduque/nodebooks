"use client";
import React from "react";
import { UiThemeContext } from "./theme";
import type { UiDataSummary } from "@nodebooks/notebook-schema";
import { deriveColumns, renderCellValue } from "./utils";

type DataSummaryProps = Omit<UiDataSummary, "ui"> & {
  className?: string;
  themeMode?: "light" | "dark";
};

// stat renderer moved inside component to honor theme

export const DataSummary: React.FC<DataSummaryProps> = ({
  title,
  schema,
  stats,
  sample,
  note,
  className,
  themeMode,
}) => {
  const ctx = React.useContext(UiThemeContext);
  const mode = themeMode ?? ctx ?? "light";
  const renderStat = (label: string, value: unknown) => {
    if (typeof value === "number" || typeof value === "string") {
      return (
        <div
          className={`rounded border px-2 py-1 ${
            mode === "light" ? "border-slate-200 bg-slate-100" : "bg-slate-800"
          }`}
          style={
            mode === "light" ? undefined : { borderColor: "var(--border)" }
          }
        >
          <div
            className={mode === "light" ? "text-slate-500" : "text-slate-400"}
          >
            {label}
          </div>
          <div className={mode === "light" ? "text-sky-700" : "text-slate-100"}>
            {value}
          </div>
        </div>
      );
    }
    return null;
  };
  const sampleCols = React.useMemo(() => deriveColumns(sample ?? []), [sample]);
  return (
    <div className={`relative ${className ?? ""}`}>
      {title && (
        <h3
          className={`mb-2 text-lg font-semibold ${mode === "light" ? "text-slate-800" : "text-slate-100"}`}
        >
          {title}
        </h3>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <div
          className={`rounded border ${mode === "light" ? "border-slate-200 bg-slate-100" : "border-slate-800 bg-slate-900"}`}
        >
          <div
            className={`border-b px-3 py-2 text-sm font-semibold ${mode === "light" ? "border-slate-200 text-slate-700" : "border-slate-700 text-slate-200"}`}
          >
            Schema
          </div>
          <div className="max-h-64 overflow-auto p-2">
            {schema && schema.length > 0 ? (
              <table className="min-w-full border-collapse">
                <thead>
                  <tr style={{ background: "var(--muted)" }}>
                    <th
                      className={`px-3 py-2 text-left text-xs font-semibold border ${mode === "light" ? "text-slate-700" : "text-slate-100"}`}
                      style={{ borderColor: "var(--border)" }}
                    >
                      Name
                    </th>
                    <th
                      className={`px-3 py-2 text-left text-xs font-semibold border ${mode === "light" ? "text-slate-700" : "text-slate-100"}`}
                      style={{ borderColor: "var(--border)" }}
                    >
                      Type
                    </th>
                    <th
                      className={`px-3 py-2 text-left text-xs font-semibold border ${mode === "light" ? "text-slate-700" : "text-slate-100"}`}
                      style={{ borderColor: "var(--border)" }}
                    >
                      Nullable
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {schema.map((f) => (
                    <tr
                      key={f.name}
                      className={
                        mode === "light"
                          ? "odd:bg-slate-50"
                          : "odd:bg-slate-800/60"
                      }
                    >
                      <td
                        className={`px-3 py-2 text-sm border ${
                          mode === "light"
                            ? "text-emerald-700"
                            : "text-slate-100 font-medium"
                        }`}
                        style={{ borderColor: "var(--border)" }}
                      >
                        {f.name}
                      </td>
                      <td
                        className={`px-3 py-2 text-sm border ${
                          mode === "light"
                            ? "text-sky-700"
                            : "text-slate-100 font-medium"
                        }`}
                        style={{ borderColor: "var(--border)" }}
                      >
                        {f.type}
                      </td>
                      <td
                        className={`px-3 py-2 text-sm border ${mode === "light" ? "text-slate-700" : "text-slate-200"}`}
                        style={{ borderColor: "var(--border)" }}
                      >
                        {String(f.nullable ?? true)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div
                className={`px-3 py-2 text-sm ${mode === "light" ? "text-slate-500" : "text-slate-400"}`}
              >
                No schema provided
              </div>
            )}
          </div>
        </div>

        <div
          className={`rounded border ${mode === "light" ? "border-slate-200 bg-slate-100" : "border-slate-800 bg-slate-900"}`}
        >
          <div
            className={`border-b px-3 py-2 text-sm font-semibold ${mode === "light" ? "border-slate-200 text-slate-700" : "border-slate-700 text-slate-200"}`}
          >
            Field Stats
          </div>
          <div className="max-h-64 overflow-auto p-2">
            {stats && Object.keys(stats).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(stats).map(([name, s]) => (
                  <div
                    key={name}
                    className={`rounded border ${mode === "light" ? "border-slate-200 bg-slate-100" : "border-slate-700 bg-slate-800"}`}
                  >
                    <div
                      className={`border-b px-3 py-1 text-sm font-semibold ${mode === "light" ? "border-slate-200 text-slate-700" : "border-slate-700 text-slate-200"}`}
                    >
                      {name}
                    </div>
                    <div
                      className={`grid grid-cols-2 gap-2 p-2 text-xs md:grid-cols-3 ${mode === "light" ? "text-slate-700" : "text-slate-300"}`}
                    >
                      {renderStat("count", s.count)}
                      {renderStat("distinct", s.distinct)}
                      {renderStat("nulls", s.nulls)}
                      {renderStat("min", s.min)}
                      {renderStat("max", s.max)}
                      {renderStat("mean", s.mean)}
                      {renderStat("median", s.median)}
                      {renderStat("p25", s.p25)}
                      {renderStat("p75", s.p75)}
                      {renderStat("stddev", s.stddev)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                className={`px-3 py-2 text-sm ${mode === "light" ? "text-slate-500" : "text-slate-400"}`}
              >
                No stats provided
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className={`mt-4 rounded border ${mode === "light" ? "border-slate-200 bg-slate-100" : "border-slate-800 bg-slate-900"}`}
      >
        <div
          className={`border-b px-3 py-2 text-sm font-semibold ${mode === "light" ? "border-slate-200 text-slate-700" : "border-slate-700 text-slate-200"}`}
        >
          Sample Rows
        </div>
        <div className="max-h-64 overflow-auto">
          {sample && sample.length > 0 ? (
            <table className="min-w-full border-collapse">
              <thead style={{ background: "var(--muted)" }}>
                <tr>
                  {sampleCols.map(
                    (c: {
                      key: string;
                      label?: string;
                      align?: "left" | "center" | "right";
                    }) => (
                      <th
                        key={c.key}
                        className={`px-3 py-2 text-left text-xs font-semibold border ${mode === "light" ? "text-slate-700" : "text-slate-100"}`}
                        style={{ borderColor: "var(--border)" }}
                      >
                        {c.label ?? c.key}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {sample.map((r, i) => (
                  <tr
                    key={i}
                    className={
                      mode === "light"
                        ? "odd:bg-slate-50"
                        : "odd:bg-slate-800/60"
                    }
                  >
                    {sampleCols.map(
                      (c: {
                        key: string;
                        label?: string;
                        align?: "left" | "center" | "right";
                      }) => (
                        <td
                          key={c.key}
                          className={`px-3 py-2 text-sm border ${mode === "light" ? "text-slate-700" : "text-slate-200"}`}
                          style={{ borderColor: "var(--border)" }}
                        >
                          {renderCellValue(
                            (r as Record<string, unknown>)[c.key],
                            mode
                          )}
                        </td>
                      )
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div
              className={`px-3 py-2 text-sm ${mode === "light" ? "text-slate-500" : "text-slate-400"}`}
            >
              No sample rows
            </div>
          )}
        </div>
      </div>

      {note && (
        <p
          className={`mt-3 text-sm ${mode === "light" ? "text-slate-600" : "text-slate-300"}`}
        >
          <span
            className={
              mode === "light"
                ? "font-semibold text-slate-800"
                : "font-semibold text-slate-100"
            }
          >
            Note:
          </span>{" "}
          {note}
        </p>
      )}
    </div>
  );
};
