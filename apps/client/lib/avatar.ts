import { md5Hex } from "@/lib/md5";

export const gravatarUrlForEmail = (email: string, size = 96) => {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  const hash = md5Hex(normalized);
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=identicon`;
};
