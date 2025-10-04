import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "nodebooks.sid";
export const SESSION_COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

export const createSessionToken = () => randomBytes(48).toString("base64url");

export const hashSessionToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export const isSessionTokenEqual = (a: string, b: string) => {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
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
