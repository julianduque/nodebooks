import { customAlphabet } from "nanoid";
import {
  normalizeSlug,
  suggestSlug,
  type Notebook,
} from "@nodebooks/notebook-schema";
import type { NotebookStore } from "../types.js";

const randomSuffix = customAlphabet("1234567890abcdefghijklmnopqrstuvwxyz", 6);

export const MAX_NOTEBOOK_SLUG_ATTEMPTS = 250;

export const normalizeRequestedSlug = (
  value?: string | null
): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = normalizeSlug(value);
  return normalized || null;
};

export const generateUniqueNotebookSlug = async (
  store: NotebookStore,
  notebook: Pick<Notebook, "id" | "name">,
  requested?: string | null,
  reserved?: Set<string>
): Promise<string> => {
  const normalizedRequest = normalizeRequestedSlug(requested);
  const fallbackSlug =
    normalizeSlug(notebook.id) ||
    normalizeSlug(`notebook-${notebook.id}`) ||
    `notebook-${notebook.id}`.toLowerCase();

  let base =
    normalizedRequest ||
    suggestSlug(notebook.name, fallbackSlug) ||
    fallbackSlug;

  if (!base) {
    base = `${fallbackSlug}-${randomSuffix()}`;
    base = normalizeSlug(base) || base;
  }

  let candidate = base;
  let suffix = 2;
  let attempts = 0;

  while (attempts < MAX_NOTEBOOK_SLUG_ATTEMPTS) {
    const isReserved = reserved?.has(candidate) ?? false;
    if (!isReserved) {
      const existing = await store.getByPublicSlug(candidate);
      if (!existing || existing.id === notebook.id) {
        reserved?.add(candidate);
        return candidate;
      }
    }

    attempts += 1;
    const next = normalizeSlug(`${base}-${suffix++}`);
    if (next && !(reserved?.has(next) ?? false)) {
      candidate = next;
      continue;
    }

    const randomId = randomSuffix();
    const fallbackCandidate =
      normalizeSlug(`${fallbackSlug}-${randomId}`) ||
      `${fallbackSlug}-${randomId}`;
    if (!(reserved?.has(fallbackCandidate) ?? false)) {
      candidate = fallbackCandidate;
      continue;
    }

    const extraId = randomSuffix();
    const extendedCandidate =
      normalizeSlug(`${fallbackCandidate}-${extraId}`) ||
      `${fallbackCandidate}-${extraId}`;
    candidate = extendedCandidate;
  }

  const emergencyId = randomSuffix();
  const fallback =
    normalizeSlug(`${fallbackSlug}-${Date.now()}-${emergencyId}`) ||
    `${fallbackSlug}-${Date.now()}-${emergencyId}`;
  reserved?.add(fallback);
  return fallback;
};
