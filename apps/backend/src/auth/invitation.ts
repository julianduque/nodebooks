import { createHash, randomBytes } from "node:crypto";

export const INVITATION_TOKEN_PREFIX = "nbiv_";
export const INVITATION_TOKEN_BYTES = 32;
export const INVITATION_EXPIRY_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export const createInvitationToken = () =>
  `${INVITATION_TOKEN_PREFIX}${randomBytes(INVITATION_TOKEN_BYTES).toString("base64url")}`;

export const hashInvitationToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
