import { ImageResponse } from "next/og";
import { headers } from "next/headers";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Notebook";

const buildNotebookApiUrl = (id: string): string => {
  const rawBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (rawBase && /^https?:\/\//.test(rawBase)) {
    const normalized = rawBase.endsWith("/") ? rawBase.slice(0, -1) : rawBase;
    return `${normalized}/notebooks/${id}`;
  }

  const fallback = rawBase ?? "/api";
  const trimmed = fallback.endsWith("/") ? fallback.slice(0, -1) : fallback;
  if (!trimmed || trimmed === "/") {
    return `/notebooks/${id}`;
  }
  if (trimmed.startsWith("/")) {
    return `${trimmed}/notebooks/${id}`;
  }
  return `/${trimmed}/notebooks/${id}`;
};

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const getOrigin = async (): Promise<string> => {
    const url = process.env.NEXT_PUBLIC_SITE_URL;
    if (url) return url;
    const h = await headers();
    const protocol = h.get("x-forwarded-proto") ?? "http";
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
    return `${protocol}://${host}`;
  };
  const origin = await getOrigin();

  let notebookTitle: string = "Notebook";
  try {
    const res = await fetch(buildNotebookApiUrl(id), {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const payload = await res.json();
      const name = payload?.data?.name;
      if (typeof name === "string" && name.trim().length > 0) {
        notebookTitle = name.trim();
      }
    }
  } catch {
    // If fetch fails, keep fallback title
  }

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0b1220 0%, #0e1b2d 100%)",
          color: "#e2e8f0",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 48,
            right: 48,
            fontSize: 24,
            color: "#94a3b8",
            fontWeight: 500,
          }}
        >
          nodebooks.dev
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 32,
            padding: 40,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 140,
              width: 140,
              borderRadius: 24,
              background: "#0ea5e9",
              boxShadow:
                "0 10px 25px rgba(14, 165, 233, 0.35), inset 0 0 20px rgba(255, 255, 255, 0.2)",
              overflow: "hidden",
            }}
          >
            <img
              alt="NodeBooks"
              height={140}
              width={140}
              src={`${origin}/icon.svg`}
              style={{ objectFit: "cover" }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 36, color: "#94a3b8", fontWeight: 600 }}>
              NodeBooks
            </div>
            <div
              style={{
                maxWidth: 900,
                fontSize: 72,
                fontWeight: 800,
                letterSpacing: -1,
                lineHeight: 1.05,
                color: "#e2e8f0",
                display: "block",
              }}
            >
              {notebookTitle}
            </div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
