import React from "react";
import type { UiDataSummary } from "@nodebooks/notebook-schema";
import { deriveColumns, renderCellValue } from "./utils";

type DataSummaryProps = UiDataSummary & { className?: string };

const renderStat = (label: string, value: unknown) => {
  if (typeof value === "number") {
    return (
      <div className="rounded border border-slate-200 bg-white px-2 py-1">
        <div className="text-slate-500">{label}</div>
        <div className="text-sky-700">{value}</div>
      </div>
    );
  }
  if (typeof value === "string") {
    return (
      <div className="rounded border border-slate-200 bg-white px-2 py-1">
        <div className="text-slate-500">{label}</div>
        <div className="text-slate-700">{value}</div>
      </div>
    );
  }
  return null;
};

export const DataSummary: React.FC<DataSummaryProps> = ({
  title,
  schema,
  stats,
  sample,
  note,
  className,
}) => {
  const sampleCols = React.useMemo(() => deriveColumns(sample ?? []), [sample]);
  return (
    <div className={className}>
      {title && (
        <h3 className="mb-2 text-lg font-semibold text-slate-800">{title}</h3>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
            Schema
          </div>
          <div className="max-h-64 overflow-auto p-2">
            {schema && schema.length > 0 ? (
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700">
                      Name
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700">
                      Type
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700">
                      Nullable
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {schema.map((f) => (
                    <tr key={f.name} className="odd:bg-slate-50">
                      <td className="px-3 py-2 text-sm text-emerald-700">
                        {f.name}
                      </td>
                      <td className="px-3 py-2 text-sm text-sky-700">
                        {f.type}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700">
                        {String(f.nullable ?? true)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="px-3 py-2 text-sm text-slate-500">
                No schema provided
              </div>
            )}
          </div>
        </div>

        <div className="rounded border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
            Field Stats
          </div>
          <div className="max-h-64 overflow-auto p-2">
            {stats && Object.keys(stats).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(stats).map(([name, s]) => (
                  <div
                    key={name}
                    className="rounded border border-slate-200 bg-white"
                  >
                    <div className="border-b border-slate-200 px-3 py-1 text-sm font-semibold text-slate-700">
                      {name}
                    </div>
                    <div className="grid grid-cols-2 gap-2 p-2 text-xs text-slate-700 md:grid-cols-3">
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
              <div className="px-3 py-2 text-sm text-slate-500">
                No stats provided
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
          Sample Rows
        </div>
        <div className="max-h-64 overflow-auto">
          {sample && sample.length > 0 ? (
            <table className="min-w-full border-collapse">
              <thead className="bg-slate-50">
                <tr>
                  {sampleCols.map(
                    (c: {
                      key: string;
                      label?: string;
                      align?: "left" | "center" | "right";
                    }) => (
                      <th
                        key={c.key}
                        className="px-3 py-2 text-left text-xs font-semibold text-slate-700"
                      >
                        {c.label ?? c.key}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {sample.map((r, i) => (
                  <tr key={i} className="odd:bg-slate-50">
                    {sampleCols.map(
                      (c: {
                        key: string;
                        label?: string;
                        align?: "left" | "center" | "right";
                      }) => (
                        <td
                          key={c.key}
                          className="px-3 py-2 text-sm text-slate-700"
                        >
                          {renderCellValue(
                            (r as Record<string, unknown>)[c.key]
                          )}
                        </td>
                      )
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="px-3 py-2 text-sm text-slate-500">
              No sample rows
            </div>
          )}
        </div>
      </div>

      {note && (
        <p className="mt-3 text-sm text-slate-600">
          <span className="font-semibold text-slate-800">Note:</span> {note}
        </p>
      )}
    </div>
  );
};
