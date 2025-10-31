import type { HttpCell } from "../schema.js";

const HTTP_VARIABLE_PATTERN = /\{\{\s*([A-Z0-9_]+)\s*\}\}/gi;

const substituteHttpVariables = (
  value: string,
  variables: Record<string, string>
) => {
  if (typeof value !== "string" || value.length === 0) {
    return "";
  }
  HTTP_VARIABLE_PATTERN.lastIndex = 0;
  return value.replace(HTTP_VARIABLE_PATTERN, (_, rawKey: string) => {
    const key = rawKey.trim();
    if (!key) {
      return "";
    }
    const exact = variables[key] ?? variables[key.toUpperCase()] ?? "";
    return exact;
  });
};

const escapeCurlValue = (value: string) => {
  return value.replace(/'/g, "'\\''");
};

const sanitizeTemplateLiteral = (value: string) => {
  const escaped = (value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
  HTTP_VARIABLE_PATTERN.lastIndex = 0;
  return escaped.replace(HTTP_VARIABLE_PATTERN, (_, rawKey: string) => {
    const key = rawKey.trim();
    if (!key) {
      return "";
    }
    return "${process.env." + key + ' ?? ""}';
  });
};

const toTemplateLiteral = (value: string) => {
  return `\`${sanitizeTemplateLiteral(value ?? "")}\``;
};

export interface HttpExecutionDetails {
  method: string;
  url: string | null;
  headers: { name: string; value: string }[];
  body?: string;
}

type HttpCellLike = Pick<HttpCell, "request">;

export const buildHttpExecutionDetails = (
  cell: HttpCellLike,
  variables: Record<string, string>
): HttpExecutionDetails | null => {
  const request = cell.request ?? {
    method: "GET",
    url: "",
    headers: [],
    query: [],
    body: { mode: "none", text: "", contentType: "application/json" },
  };

  const method = (request.method ?? "GET").toUpperCase();

  const headers = (request.headers ?? [])
    .filter((header) => header?.enabled !== false)
    .map((header) => {
      const name = substituteHttpVariables(
        header?.name ?? "",
        variables
      ).trim();
      const value = substituteHttpVariables(header?.value ?? "", variables);
      return { name, value };
    })
    .filter((header) => header.name.length > 0);

  const query = (request.query ?? [])
    .filter((param) => param?.enabled !== false)
    .map((param) => ({
      name: substituteHttpVariables(param?.name ?? "", variables),
      value: substituteHttpVariables(param?.value ?? "", variables),
    }))
    .filter((param) => param.name.trim().length > 0);

  const rawUrl = substituteHttpVariables(request.url ?? "", variables).trim();
  let urlString: string | null = rawUrl || null;
  if (rawUrl) {
    try {
      const url = new URL(rawUrl);
      query.forEach((param) => {
        url.searchParams.append(param.name, param.value);
      });
      urlString = url.toString();
    } catch {
      if (query.length > 0) {
        const queryString = query
          .map(
            (param) =>
              `${encodeURIComponent(param.name)}=${encodeURIComponent(param.value)}`
          )
          .join("&");
        urlString = `${rawUrl}${rawUrl.includes("?") ? "&" : "?"}${queryString}`;
      }
    }
  }

  let body: string | undefined;
  if (request.body?.mode === "json") {
    const substituted = substituteHttpVariables(
      request.body?.text ?? "",
      variables
    ).trim();
    if (substituted.length > 0) {
      try {
        body = JSON.stringify(JSON.parse(substituted));
      } catch {
        body = substituted;
      }
    }
  } else if (request.body?.mode === "text") {
    body = substituteHttpVariables(request.body?.text ?? "", variables);
  }

  if (["GET", "HEAD"].includes(method)) {
    body = undefined;
  }

  return {
    method,
    url: urlString,
    headers,
    body,
  };
};

export const buildHttpCurlCommand = (
  details: HttpExecutionDetails | null
): string | null => {
  if (!details || !details.url) {
    return null;
  }
  const parts = [`curl -X ${details.method}`];
  details.headers.forEach((header) => {
    parts.push(`-H '${escapeCurlValue(`${header.name}: ${header.value}`)}'`);
  });
  if (details.body && details.body.length > 0) {
    parts.push(`--data '${escapeCurlValue(details.body)}'`);
  }
  parts.push(`'${escapeCurlValue(details.url)}'`);
  return parts.join(" ");
};

export const buildHttpCodeSnippet = (cell: HttpCellLike) => {
  const request = cell.request ?? {
    method: "GET",
    url: "",
    headers: [],
    query: [],
    body: { mode: "none", text: "", contentType: "application/json" },
  };

  const lines: string[] = [];
  const rawUrl = (request.url ?? "").trim();
  const urlLiteral = rawUrl
    ? toTemplateLiteral(rawUrl)
    : "`https://example.com`";
  lines.push(`const url = new URL(${urlLiteral});`);

  (request.query ?? [])
    .filter((param) => param?.enabled !== false)
    .filter((param) => (param?.name ?? "").trim().length > 0)
    .forEach((param) => {
      lines.push(
        `url.searchParams.append(${toTemplateLiteral(param?.name ?? "")}, ${toTemplateLiteral(
          param?.value ?? ""
        )});`
      );
    });

  const headerLines = (request.headers ?? [])
    .filter((header) => header?.enabled !== false)
    .filter((header) => (header?.name ?? "").trim().length > 0)
    .map(
      (header) =>
        `headers.set(${toTemplateLiteral(header?.name ?? "")}, ${toTemplateLiteral(
          header?.value ?? ""
        )});`
    );

  if (headerLines.length > 0) {
    lines.push("", "const headers = new Headers();");
    lines.push(...headerLines);
  }

  const bodyMode = request.body?.mode ?? "none";
  const bodyText = request.body?.text ?? "";
  let bodyDeclaration: string | null = null;
  let bodyUsage: string | null = null;
  if (bodyMode === "json" && bodyText.trim().length > 0) {
    bodyDeclaration = `const payload = JSON.parse(${toTemplateLiteral(bodyText)});`;
    bodyUsage = "JSON.stringify(payload)";
  } else if (bodyMode === "text" && bodyText.length > 0) {
    bodyDeclaration = `const body = ${toTemplateLiteral(bodyText)};`;
    bodyUsage = "body";
  }

  if (bodyDeclaration) {
    lines.push("", bodyDeclaration);
  }

  const optionEntries: string[] = [
    `  method: ${JSON.stringify((request.method ?? "GET").toUpperCase())}`,
  ];
  if (headerLines.length > 0) {
    optionEntries.push("  headers");
  }
  if (bodyUsage) {
    optionEntries.push(`  body: ${bodyUsage}`);
  }

  lines.push(
    "",
    "const response = await fetch(url, {",
    ...optionEntries.map((entry) => `${entry},`),
    "});",
    "",
    "if (!response.ok) {",
    "  throw new Error(`Request failed: ${response.status} ${response.statusText}`);",
    "}",
    "",
    'const contentType = response.headers.get("content-type");',
    'if (contentType && contentType.includes("application/json")) {',
    "  const data = await response.json();",
    "  console.log(data);",
    "} else {",
    "  const text = await response.text();",
    "  console.log(text);",
    "}"
  );

  return lines.join("\n");
};
