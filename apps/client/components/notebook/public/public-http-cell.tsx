"use client";

import { useMemo } from "react";
import type { NotebookCell } from "@nodebooks/notebook-schema";

const PublicHttpCell = ({
  cell,
}: {
  cell: Extract<NotebookCell, { type: "http" }>;
}) => {
  const request = cell.request ?? {
    method: "GET",
    url: "",
    headers: [],
    query: [],
    body: { mode: "none", text: "", contentType: "application/json" },
  };
  const response = cell.response;

  const requestHeaders = useMemo(
    () =>
      Array.isArray(request.headers)
        ? request.headers.filter(
            (header) => (header.name ?? "").trim().length > 0
          )
        : [],
    [request.headers]
  );
  const queryParams = useMemo(
    () =>
      Array.isArray(request.query)
        ? request.query.filter((param) => (param.name ?? "").trim().length > 0)
        : [],
    [request.query]
  );

  const requestBody = useMemo(() => {
    if (request.body?.mode === "json" || request.body?.mode === "text") {
      return request.body.text ?? "";
    }
    return "";
  }, [request.body?.mode, request.body?.text]);

  const responseStatus = response?.status
    ? `${response.status} ${response.statusText ?? ""}`.trim()
    : null;

  const responseHeaders = useMemo(
    () =>
      Array.isArray(response?.headers)
        ? response.headers.filter(
            (header) => (header.name ?? "").trim().length > 0
          )
        : [],
    [response?.headers]
  );

  const responseBody = useMemo(() => {
    if (!response?.body) {
      return null;
    }
    if (response.body.type === "binary") {
      const size =
        typeof response.body.size === "number"
          ? `${response.body.size} bytes`
          : "binary";
      const encoding = response.body.encoding ?? "base64";
      const text = response.body.text ?? "";
      return `Binary data (${size}, ${encoding}):\n${text}`;
    }
    if (response.body.text && response.body.text.length > 0) {
      return response.body.text;
    }
    return "";
  }, [response?.body]);

  const timestampLabel = useMemo(() => {
    if (!response?.timestamp) {
      return null;
    }
    const timestamp = new Date(response.timestamp);
    if (Number.isNaN(timestamp.getTime())) {
      return response.timestamp;
    }
    return timestamp.toLocaleString();
  }, [response?.timestamp]);

  return (
    <section id={`cell-${cell.id}`} className="space-y-4 text-sm">
      <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span className="rounded border px-2 py-1 font-mono text-[11px] font-semibold text-emerald-700 shadow-sm ring-1 ring-emerald-200 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-0">
            {request.method ?? "GET"}
          </span>
          <span className="font-medium text-foreground">HTTP Request</span>
        </div>
        {request.url ? (
          <div className="wrap-break-word font-mono text-[13px] text-foreground">
            {request.url}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No URL configured.</p>
        )}
        {queryParams.length > 0 ? (
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Query Parameters
            </p>
            <div className="rounded-md border border-border/60 bg-background/80 p-2 text-xs font-mono">
              {queryParams.map((param) => (
                <div
                  key={param.id ?? `${param.name}-${param.value}`}
                  className="flex gap-2"
                >
                  <span className="text-emerald-600 dark:text-emerald-200">
                    {param.name}
                  </span>
                  <span className="text-muted-foreground">=</span>
                  <span className="text-foreground break-all">
                    {param.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {requestBody ? (
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Body
            </p>
            <pre className="max-h-64 overflow-auto rounded-md border border-border/60 bg-background/80 p-3 text-xs font-mono leading-relaxed">
              {requestBody}
            </pre>
          </div>
        ) : null}
        {requestHeaders.length > 0 ? (
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Headers
            </p>
            <div className="rounded-md border border-border/60 bg-background/80 p-2 text-xs font-mono">
              {requestHeaders.map((header) => (
                <div
                  key={header.id ?? `${header.name}-${header.value}`}
                  className="flex gap-2"
                >
                  <span className="text-sky-500 dark:text-sky-300">
                    {header.name}
                  </span>
                  <span className="text-muted-foreground">:</span>
                  <span className="text-foreground break-all">
                    {header.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {response ? (
        <div className="space-y-3 rounded-lg border border-border bg-card/80 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border px-2 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700 shadow-sm ring-1 ring-emerald-200 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-0">
              Response
            </span>
            {timestampLabel ? (
              <span className="text-xs text-muted-foreground">
                {timestampLabel}
              </span>
            ) : null}
            {typeof response.durationMs === "number" ? (
              <span className="text-xs text-muted-foreground">
                {response.durationMs} ms
              </span>
            ) : null}
          </div>
          {response.error ? (
            <p className="text-sm font-medium text-rose-400">
              {response.error}
            </p>
          ) : (
            <div className="space-y-2">
              {responseStatus ? (
                <p className="font-medium text-foreground">{responseStatus}</p>
              ) : null}
              {response.url ? (
                <p className="font-mono text-xs text-muted-foreground break-all">
                  {response.url}
                </p>
              ) : null}
            </div>
          )}
          {responseHeaders.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Response Headers
              </p>
              <div className="rounded-md border border-border/60 bg-background/60 p-2 text-xs font-mono">
                {responseHeaders.map((header) => (
                  <div
                    key={`${header.name}-${header.value}`}
                    className="flex gap-2"
                  >
                    <span className="text-emerald-600 dark:text-emerald-200">
                      {header.name}
                    </span>
                    <span className="text-muted-foreground">:</span>
                    <span className="text-foreground break-all">
                      {header.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {responseBody ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Body
              </p>
              <pre className="max-h-72 overflow-auto rounded-md border border-border/60 bg-background/80 p-3 text-xs font-mono leading-relaxed">
                {responseBody}
              </pre>
            </div>
          ) : null}
          {response.curl ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                cURL
              </p>
              <pre className="overflow-auto rounded-md border border-border/60 bg-background/80 p-3 text-xs font-mono leading-relaxed">
                {response.curl}
              </pre>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Run this request in the editor to capture the latest response.
        </p>
      )}
    </section>
  );
};

export default PublicHttpCell;
