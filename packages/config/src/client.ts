import type { ClientConfig } from "./types.js";
import { loadClientConfig } from "./index.js";

// Re-export a zero-dep client helper for Next.js/browser usage
export function clientConfig(): ClientConfig {
  return loadClientConfig();
}

export type { ClientConfig };
