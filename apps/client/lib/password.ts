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
  const actual = Buffer.from(token, "utf8");
  if (expected.length !== actual.length) {
    return false;
  }
  return timingSafeEqual(expected, actual);
};
