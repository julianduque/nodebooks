import { ImageResponse } from "next/og";
import { headers } from "next/headers";

export const alt = "NodeBooks";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

const getOrigin = async (): Promise<string> => {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  if (url) return url;
  const h = await headers();
  const protocol = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${protocol}://${host}`;
};

export default async function Image() {
  const origin = await getOrigin();
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
          fontSize: 64,
          fontWeight: 700,
          letterSpacing: -1,
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
          {/* nodebooks.dev */}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 150,
              width: 150,
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
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              lineHeight: 1.05,
            }}
          >
            <span style={{ fontSize: 84 }}>NodeBooks</span>
            <span
              style={{
                marginTop: 8,
                fontSize: 32,
                fontWeight: 500,
                color: "#94a3b8",
              }}
            >
              Interactive Node.js Notebooks
            </span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
