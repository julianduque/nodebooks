import { createHash, timingSafeEqual } from "node:crypto";

export const PASSWORD_COOKIE_NAME = "nodebooks-auth";

export const derivePasswordToken = (password: string) => {
  return createHash("sha256").update(password).digest("hex");
};

export const isTokenValid = (
  token: string | undefined,
  expectedToken: string
) => {
  if (!token) {
    return false;
  }
  const expected = Buffer.from(expectedToken, "utf8");
  const provided = Buffer.from(token, "utf8");
  if (expected.length !== provided.length) {
    return false;
  }
  return timingSafeEqual(expected, provided);
};

export const parseCookieHeader = (raw: string | undefined) => {
  if (!raw) {
    return {} as Record<string, string>;
  }
  const out: Record<string, string> = {};
  const segments = raw.split(";");
  for (const segment of segments) {
    const [key, ...rest] = segment.split("=");
    if (!key) {
      continue;
    }
    const name = key.trim();
    if (!name) {
      continue;
    }
    const value = rest.join("=").trim();
    out[name] = value;
  }
  return out;
};
