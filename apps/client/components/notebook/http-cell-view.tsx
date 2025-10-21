"use client";

import { useMemo } from "react";
import clsx from "clsx";
import type { NotebookCell } from "@nodebooks/notebook-schema";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

const VARIABLE_PATTERN = /\{\{\s*([A-Z0-9_]+)\s*\}\}/gi;
const BODY_MODES = ["none", "json", "text"] as const;
type BodyMode = (typeof BODY_MODES)[number];

const createItemId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `http_${Math.random().toString(36).slice(2, 10)}`;
};

const substituteVariables = (
  value: string,
  variables: Record<string, string>
) => {
  if (!value) return "";
  return value.replace(VARIABLE_PATTERN, (_, key: string) => {
    const exact = variables[key] ?? variables[key.toUpperCase()] ?? "";
    return exact;
  });
};

interface HttpCellViewProps {
  cell: Extract<NotebookCell, { type: "http" }>;
  onChange: (
    updater: (cell: NotebookCell) => NotebookCell,
    options?: { persist?: boolean; touch?: boolean }
  ) => void;
  variables: Record<string, string>;
  isRunning: boolean;
  readOnly: boolean;
}

const HttpCellView = ({
  cell,
  onChange,
  variables,
  isRunning,
  readOnly,
}: HttpCellViewProps) => {
  const request = cell.request ?? {
    method: "GET",
    url: "",
    headers: [],
    query: [],
    body: { mode: "none", text: "", contentType: "application/json" },
  };
  const response = cell.response;

  const updateRequest = (
    updater: (request: typeof request) => typeof request,
    options?: { persist?: boolean; touch?: boolean }
  ) => {
    onChange((current) => {
      if (current.id !== cell.id || current.type !== "http") {
        return current;
      }
      const nextRequest = updater({
        method: request.method ?? "GET",
        url: request.url ?? "",
        headers: Array.isArray(request.headers) ? [...request.headers] : [],
        query: Array.isArray(request.query) ? [...request.query] : [],
        body: request.body ?? {
          mode: "none",
          text: "",
          contentType: "application/json",
        },
      });
      return {
        ...current,
        request: {
          method: nextRequest.method ?? "GET",
          url: nextRequest.url ?? "",
          headers: Array.isArray(nextRequest.headers)
            ? nextRequest.headers.map((header) => ({
                id: header.id ?? createItemId(),
                name: header.name ?? "",
                value: header.value ?? "",
                enabled: header.enabled !== false,
              }))
            : [],
          query: Array.isArray(nextRequest.query)
            ? nextRequest.query.map((param) => ({
                id: param.id ?? createItemId(),
                name: param.name ?? "",
                value: param.value ?? "",
                enabled: param.enabled !== false,
              }))
            : [],
          body: {
            mode: (nextRequest.body?.mode ?? "none") as BodyMode,
            text: nextRequest.body?.text ?? "",
            contentType:
              nextRequest.body?.contentType ?? "application/json",
          },
        },
      } satisfies NotebookCell;
    }, options);
  };

  const resolvedUrl = useMemo(() => {
    const base = substituteVariables(request.url ?? "", variables);
    const query = Array.isArray(request.query) ? request.query : [];
    try {
      if (!base) return "";
      const url = new URL(base);
      query
        .filter((param) => param.enabled !== false)
        .forEach((param) => {
          const name = substituteVariables(param.name ?? "", variables);
          const value = substituteVariables(param.value ?? "", variables);
          if (name.trim().length > 0) {
            url.searchParams.append(name, value);
          }
        });
      return url.toString();
    } catch {
      const parts = query
        .filter((param) => param.enabled !== false)
        .map((param) => ({
          name: substituteVariables(param.name ?? "", variables),
          value: substituteVariables(param.value ?? "", variables),
        }))
        .filter((param) => param.name.trim().length > 0);
      if (parts.length === 0) {
        return base;
      }
      const queryString = parts
        .map((param) =>
          `${encodeURIComponent(param.name)}=${encodeURIComponent(param.value)}`
        )
        .join("&");
      if (!base) {
        return queryString ? `?${queryString}` : "";
      }
      if (base.includes("?")) {
        return `${base}&${queryString}`;
      }
      return `${base}?${queryString}`;
    }
  }, [request.url, request.query, variables]);

  const resolvedHeaders = useMemo(() => {
    const list = Array.isArray(request.headers) ? request.headers : [];
    return list
      .filter((header) => header.enabled !== false)
      .map((header) => ({
        id: header.id ?? createItemId(),
        name: substituteVariables(header.name ?? "", variables),
        value: substituteVariables(header.value ?? "", variables),
      }))
      .filter((header) => header.name.trim().length > 0);
  }, [request.headers, variables]);

  const resolvedBody = useMemo(() => {
    if (request.body?.mode === "json") {
      return substituteVariables(request.body?.text ?? "", variables);
    }
    if (request.body?.mode === "text") {
      return substituteVariables(request.body?.text ?? "", variables);
    }
    return "";
  }, [request.body?.mode, request.body?.text, variables]);

  const availableVariables = useMemo(
    () => Object.keys(variables).sort(),
    [variables]
  );

  const hasHeaders = Array.isArray(request.headers)
    ? request.headers.length > 0
    : false;
  const hasParams = Array.isArray(request.query)
    ? request.query.length > 0
    : false;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-3 text-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <label className="flex shrink-0 items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Method
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
              value={request.method ?? "GET"}
              onChange={(event) =>
                updateRequest(
                  (prev) => ({ ...prev, method: event.target.value }),
                  { persist: true }
                )
              }
              disabled={readOnly || isRunning}
            >
              {[
                "GET",
                "POST",
                "PUT",
                "PATCH",
                "DELETE",
                "HEAD",
                "OPTIONS",
              ].map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </label>
          <div className="flex w-full flex-col gap-1">
            <Input
              value={request.url ?? ""}
              onChange={(event) =>
                updateRequest(
                  (prev) => ({ ...prev, url: event.target.value }),
                  { persist: false }
                )
              }
              onBlur={(event) =>
                updateRequest(
                  (prev) => ({ ...prev, url: event.target.value }),
                  { persist: true }
                )
              }
              placeholder="https://api.example.com/resource"
              className="h-9"
              disabled={readOnly || isRunning}
            />
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">Resolved:</span>
              <span className="truncate text-emerald-500" title={resolvedUrl}>
                {resolvedUrl || "Enter a request URL"}
              </span>
            </div>
          </div>
        </div>
        {availableVariables.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="uppercase tracking-wide">Variables:</span>
            {availableVariables.map((name) => (
              <span
                key={name}
                className="rounded border border-border bg-background px-2 py-0.5 font-mono text-xs"
              >
                {name}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <Tabs defaultValue={hasHeaders ? "headers" : hasParams ? "params" : "body"}>
        <TabsList>
          <TabsTrigger value="params">Query Params</TabsTrigger>
          <TabsTrigger value="headers">Headers</TabsTrigger>
          <TabsTrigger value="body">Body</TabsTrigger>
          <TabsTrigger value="response">Response</TabsTrigger>
        </TabsList>
        <TabsContent value="params">
          <div className="rounded-lg border border-border bg-card">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="w-1/3 px-3 py-2 text-left">Name</th>
                  <th className="w-1/2 px-3 py-2 text-left">Value</th>
                  <th className="w-[80px] px-3 py-2 text-left">Enabled</th>
                  <th className="w-[60px] px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {(request.query ?? []).map((param) => (
                  <tr key={param.id ?? createItemId()} className="border-t border-border/60">
                    <td className="px-3 py-2">
                      <Input
                        value={param.name ?? ""}
                        onChange={(event) =>
                          updateRequest(
                            (prev) => ({
                              ...prev,
                              query: (prev.query ?? []).map((item) =>
                                item.id === param.id
                                  ? { ...item, name: event.target.value }
                                  : item
                              ),
                            }),
                            { persist: false }
                          )
                        }
                        onBlur={(event) =>
                          updateRequest(
                            (prev) => ({
                              ...prev,
                              query: (prev.query ?? []).map((item) =>
                                item.id === param.id
                                  ? { ...item, name: event.target.value }
                                  : item
                              ),
                            }),
                            { persist: true }
                          )
                        }
                        disabled={readOnly || isRunning}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={param.value ?? ""}
                        onChange={(event) =>
                          updateRequest(
                            (prev) => ({
                              ...prev,
                              query: (prev.query ?? []).map((item) =>
                                item.id === param.id
                                  ? { ...item, value: event.target.value }
                                  : item
                              ),
                            }),
                            { persist: false }
                          )
                        }
                        onBlur={(event) =>
                          updateRequest(
                            (prev) => ({
                              ...prev,
                              query: (prev.query ?? []).map((item) =>
                                item.id === param.id
                                  ? { ...item, value: event.target.value }
                                  : item
                              ),
                            }),
                            { persist: true }
                          )
                        }
                        disabled={readOnly || isRunning}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <label className="inline-flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={param.enabled !== false}
                          onChange={(event) =>
                            updateRequest(
                              (prev) => ({
                                ...prev,
                                query: (prev.query ?? []).map((item) =>
                                  item.id === param.id
                                    ? { ...item, enabled: event.target.checked }
                                    : item
                                ),
                              }),
                              { persist: true }
                            )
                          }
                          disabled={readOnly || isRunning}
                        />
                        Enabled
                      </label>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          updateRequest(
                            (prev) => ({
                              ...prev,
                              query: (prev.query ?? []).filter(
                                (item) => item.id !== param.id
                              ),
                            }),
                            { persist: true }
                          )
                        }
                        disabled={readOnly || isRunning}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {readOnly ? null : (
              <div className="flex items-center justify-end border-t border-border/60 bg-muted/40 px-3 py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    updateRequest(
                      (prev) => ({
                        ...prev,
                        query: [
                          ...(prev.query ?? []),
                          {
                            id: createItemId(),
                            name: "",
                            value: "",
                            enabled: true,
                          },
                        ],
                      }),
                      { persist: true }
                    )
                  }
                  disabled={isRunning}
                >
                  Add param
                </Button>
              </div>
            )}
          </div>
        </TabsContent>
        <TabsContent value="headers">
          <div className="rounded-lg border border-border bg-card">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="w-1/3 px-3 py-2 text-left">Header</th>
                  <th className="w-1/2 px-3 py-2 text-left">Value</th>
                  <th className="w-[80px] px-3 py-2 text-left">Enabled</th>
                  <th className="w-[60px] px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {(request.headers ?? []).map((header) => (
                  <tr key={header.id ?? createItemId()} className="border-t border-border/60">
                    <td className="px-3 py-2">
                      <Input
                        value={header.name ?? ""}
                        onChange={(event) =>
                          updateRequest(
                            (prev) => ({
                              ...prev,
                              headers: (prev.headers ?? []).map((item) =>
                                item.id === header.id
                                  ? { ...item, name: event.target.value }
                                  : item
                              ),
                            }),
                            { persist: false }
                          )
                        }
                        onBlur={(event) =>
                          updateRequest(
                            (prev) => ({
                              ...prev,
                              headers: (prev.headers ?? []).map((item) =>
                                item.id === header.id
                                  ? { ...item, name: event.target.value }
                                  : item
                              ),
                            }),
                            { persist: true }
                          )
                        }
                        disabled={readOnly || isRunning}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={header.value ?? ""}
                        onChange={(event) =>
                          updateRequest(
                            (prev) => ({
                              ...prev,
                              headers: (prev.headers ?? []).map((item) =>
                                item.id === header.id
                                  ? { ...item, value: event.target.value }
                                  : item
                              ),
                            }),
                            { persist: false }
                          )
                        }
                        onBlur={(event) =>
                          updateRequest(
                            (prev) => ({
                              ...prev,
                              headers: (prev.headers ?? []).map((item) =>
                                item.id === header.id
                                  ? { ...item, value: event.target.value }
                                  : item
                              ),
                            }),
                            { persist: true }
                          )
                        }
                        disabled={readOnly || isRunning}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <label className="inline-flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={header.enabled !== false}
                          onChange={(event) =>
                            updateRequest(
                              (prev) => ({
                                ...prev,
                                headers: (prev.headers ?? []).map((item) =>
                                  item.id === header.id
                                    ? { ...item, enabled: event.target.checked }
                                    : item
                                ),
                              }),
                              { persist: true }
                            )
                          }
                          disabled={readOnly || isRunning}
                        />
                        Enabled
                      </label>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          updateRequest(
                            (prev) => ({
                              ...prev,
                              headers: (prev.headers ?? []).filter(
                                (item) => item.id !== header.id
                              ),
                            }),
                            { persist: true }
                          )
                        }
                        disabled={readOnly || isRunning}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {readOnly ? null : (
              <div className="flex items-center justify-end border-t border-border/60 bg-muted/40 px-3 py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    updateRequest(
                      (prev) => ({
                        ...prev,
                        headers: [
                          ...(prev.headers ?? []),
                          {
                            id: createItemId(),
                            name: "",
                            value: "",
                            enabled: true,
                          },
                        ],
                      }),
                      { persist: true }
                    )
                  }
                  disabled={isRunning}
                >
                  Add header
                </Button>
              </div>
            )}
          </div>
        </TabsContent>
        <TabsContent value="body">
          <div className="space-y-3 rounded-lg border border-border bg-card p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Body type
              </span>
              {[
              { value: "none", label: "None" },
              { value: "json", label: "JSON" },
              { value: "text", label: "Raw text" },
            ].map((option) => (
              <Button
                key={option.value}
                variant={
                  request.body?.mode === option.value ? "secondary" : "ghost"
                }
                size="sm"
                onClick={() =>
                  updateRequest(
                    (prev) => ({
                      ...prev,
                      body: {
                        mode: option.value as BodyMode,
                        text: option.value === prev.body?.mode
                          ? prev.body?.text ?? ""
                          : "",
                        contentType:
                          option.value === "json"
                            ? "application/json"
                            : option.value === "text"
                              ? prev.body?.contentType ?? "text/plain"
                              : prev.body?.contentType ?? "application/json",
                      },
                    }),
                    { persist: true }
                  )
                }
                  disabled={readOnly || isRunning}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            {request.body?.mode === "json" ? (
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  JSON body
                </label>
                <textarea
                  className="min-h-[140px] w-full rounded-md border border-border bg-background p-3 font-mono text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
                  value={request.body?.text ?? ""}
                  onChange={(event) =>
                    updateRequest(
                      (prev) => ({
                        ...prev,
                        body: {
                          mode: "json",
                          text: event.target.value,
                          contentType:
                            prev.body?.contentType ?? "application/json",
                        },
                      }),
                      { persist: false }
                    )
                  }
                  onBlur={(event) =>
                    updateRequest(
                      (prev) => ({
                        ...prev,
                        body: {
                          mode: "json",
                          text: event.target.value,
                          contentType:
                            prev.body?.contentType ?? "application/json",
                        },
                      }),
                      { persist: true }
                    )
                  }
                  disabled={readOnly || isRunning}
                />
              </div>
            ) : null}
            {request.body?.mode === "text" ? (
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Request body
                </label>
                <textarea
                  className="min-h-[120px] w-full rounded-md border border-border bg-background p-3 font-mono text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
                  value={request.body?.text ?? ""}
                  onChange={(event) =>
                    updateRequest(
                      (prev) => ({
                        ...prev,
                        body: {
                          mode: "text",
                          text: event.target.value,
                          contentType: prev.body?.contentType ?? "text/plain",
                        },
                      }),
                      { persist: false }
                    )
                  }
                  onBlur={(event) =>
                    updateRequest(
                      (prev) => ({
                        ...prev,
                        body: {
                          mode: "text",
                          text: event.target.value,
                          contentType: prev.body?.contentType ?? "text/plain",
                        },
                      }),
                      { persist: true }
                    )
                  }
                  disabled={readOnly || isRunning}
                />
              </div>
            ) : null}
            <div className="rounded-md border border-dashed border-border/80 bg-muted/40 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Preview</p>
              {request.body?.mode === "none" ? (
                <p>No body will be sent with this request.</p>
              ) : (
                <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-emerald-400">
                  {resolvedBody || "(empty)"}
                </pre>
              )}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="response">
          <div className="space-y-3 rounded-lg border border-border bg-card p-4 text-sm">
            {response ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={clsx(
                      "rounded px-2 py-1 text-xs font-semibold",
                      response.status && response.status >= 200 && response.status < 300
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-rose-500/10 text-rose-400"
                    )}
                  >
                    {response.status ?? "--"}
                  </span>
                  {response.statusText ? (
                    <span className="text-xs text-muted-foreground">
                      {response.statusText}
                    </span>
                  ) : null}
                  {typeof response.durationMs === "number" ? (
                    <span className="text-xs text-muted-foreground">
                      {response.durationMs} ms
                    </span>
                  ) : null}
                  {typeof response.body?.size === "number" ? (
                    <span className="text-xs text-muted-foreground">
                      {response.body.size} bytes
                    </span>
                  ) : null}
                  {response.error ? (
                    <span className="text-xs text-rose-400">
                      {response.error}
                    </span>
                  ) : null}
                </div>
                {response.body?.type === "json" && response.body.json ? (
                  <ScrollArea className="max-h-64 rounded-md border border-border/60 bg-background p-3">
                    <pre className="whitespace-pre-wrap break-words font-mono text-xs text-emerald-400">
                      {JSON.stringify(response.body.json, null, 2)}
                    </pre>
                  </ScrollArea>
                ) : null}
                {response.body?.type === "text" && response.body.text ? (
                  <ScrollArea className="max-h-64 rounded-md border border-border/60 bg-background p-3">
                    <pre className="whitespace-pre-wrap break-words font-mono text-xs text-slate-200">
                      {response.body.text}
                    </pre>
                  </ScrollArea>
                ) : null}
                {response.body?.type === "binary" ? (
                  <div className="rounded-md border border-dashed border-border/80 bg-muted/40 p-3 text-xs text-muted-foreground">
                    Binary response captured as base64 ({response.body?.contentType ?? "unknown"}).
                  </div>
                ) : null}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Response headers
                  </p>
                  <div className="rounded-md border border-border/80 bg-muted/30 p-3 text-xs">
                    {Array.isArray(response.headers) && response.headers.length > 0 ? (
                      <ul className="space-y-1">
                        {response.headers.map((header) => (
                          <li key={header.id ?? header.name} className="flex flex-wrap gap-2">
                            <span className="font-medium text-foreground">
                              {header.name}
                            </span>
                            <span className="text-muted-foreground">{header.value}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground">No headers returned.</p>
                    )}
                  </div>
                </div>
                {response.curl ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Generated cURL
                    </p>
                    <ScrollArea className="max-h-48 rounded-md border border-border/60 bg-background p-3">
                      <pre className="whitespace-pre-wrap break-words font-mono text-xs text-slate-200">
                        {response.curl}
                      </pre>
                    </ScrollArea>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Run the request to see the response here.
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>
      <div className="rounded-md border border-dashed border-border/80 bg-muted/40 p-3 text-xs text-muted-foreground">
        <p>
          Use <code>{"{{VARIABLE}}"}</code> to reference notebook environment
          variables when configuring the request.
        </p>
        {resolvedHeaders.length > 0 ? (
          <p className="mt-2">
            <span className="font-semibold text-foreground">Resolved headers:</span>
            {" "}
            {resolvedHeaders.map((header) => `${header.name}: ${header.value}`).join(", ")}
          </p>
        ) : null}
      </div>
    </div>
  );
};

export default HttpCellView;
