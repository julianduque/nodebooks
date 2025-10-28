export const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

interface HttpResponseBodyLike {
  type?: "json" | "text" | "binary";
  json?: unknown;
  text?: string | null;
  encoding?: "utf8" | "base64";
  contentType?: string | null;
  size?: number | null;
}

interface HttpResponseLike {
  status?: number | null;
  statusText?: string | null;
  ok?: boolean | null;
  url?: string | null;
  durationMs?: number | null;
  timestamp?: string | null;
  headers?: Array<{ name?: string | null; value?: string | null }> | null;
  body?: HttpResponseBodyLike | null;
  assignedVariable?: string | null;
  assignedBody?: string | null;
  assignedHeaders?: string | null;
  error?: string | null;
}

interface HttpCellLike {
  id: string;
  type: string;
  response?: HttpResponseLike | null;
}

interface NotebookLike {
  cells: HttpCellLike[];
}

export const computeHttpGlobals = (
  notebook: NotebookLike | null
): Record<string, unknown> => {
  if (!notebook) {
    return {};
  }
  const map: Record<string, unknown> = {};
  for (const cell of notebook.cells) {
    if (cell.type !== "http") {
      continue;
    }
    const response = cell.response;
    if (!response || response.error) {
      continue;
    }
    if (response.ok === false) {
      continue;
    }
    const assignedVariable = (response.assignedVariable ?? "").trim();
    const assignedBody = (response.assignedBody ?? "").trim();
    const assignedHeaders = (response.assignedHeaders ?? "").trim();
    const headersList = Array.isArray(response.headers) ? response.headers : [];
    const headersRecord = headersList.reduce<Record<string, string>>(
      (acc, header) => {
        const name = header?.name?.trim();
        if (!name) {
          return acc;
        }
        acc[name] = header?.value ?? "";
        return acc;
      },
      {}
    );
    const body = response.body;
    const bodyText = typeof body?.text === "string" ? body.text : null;
    const base = {
      status: response.status ?? null,
      statusText: response.statusText ?? null,
      ok: response.ok ?? null,
      url: response.url ?? null,
      durationMs: response.durationMs ?? null,
      timestamp: response.timestamp ?? null,
      headers: headersRecord,
      headerList: headersList,
      body: {
        type: body?.type ?? null,
        json: body?.json ?? null,
        text: bodyText,
        encoding: body?.encoding ?? null,
        contentType: body?.contentType ?? null,
        size: body?.size ?? null,
      },
    } as const;

    if (assignedVariable && IDENTIFIER_PATTERN.test(assignedVariable)) {
      map[assignedVariable] = base;
    }

    if (assignedBody && IDENTIFIER_PATTERN.test(assignedBody)) {
      map[assignedBody] = {
        json: body?.json ?? null,
        text: bodyText,
        type: body?.type ?? null,
        encoding: body?.encoding ?? null,
        contentType: body?.contentType ?? null,
        size: body?.size ?? null,
        status: response.status ?? null,
        ok: response.ok ?? null,
        url: response.url ?? null,
        timestamp: response.timestamp ?? null,
        headers: headersRecord,
      };
    }

    if (assignedHeaders && IDENTIFIER_PATTERN.test(assignedHeaders)) {
      map[assignedHeaders] = headersRecord;
    }
  }
  return map;
};
