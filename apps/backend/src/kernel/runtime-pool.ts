import { WorkerPool } from "@nodebooks/runtime-host";

let pool: WorkerPool | null = null;
export const getWorkerPool = () => {
  if (!pool) pool = new WorkerPool();
  return pool;
};
