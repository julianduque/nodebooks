import { WorkerPool } from "@nodebooks/runtime-host";
import { loadServerConfig } from "@nodebooks/config";

let pool: WorkerPool | null = null;
let lastTimeoutMs: number | null = null;

export const getWorkerPool = () => {
  const { kernelTimeoutMs } = loadServerConfig();
  if (!pool) {
    pool = new WorkerPool({ perJobTimeoutMs: kernelTimeoutMs });
  } else if (lastTimeoutMs !== kernelTimeoutMs) {
    pool.setPerJobTimeoutMs(kernelTimeoutMs);
  }
  lastTimeoutMs = kernelTimeoutMs;
  return pool;
};
