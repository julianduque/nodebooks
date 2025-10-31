export type PlotLayoutCommitResult = {
  ok: boolean;
  error?: string;
};

const committers = new Map<string, () => PlotLayoutCommitResult>();

export const registerPlotLayoutCommitter = (
  cellId: string,
  committer: () => PlotLayoutCommitResult
) => {
  committers.set(cellId, committer);
};

export const unregisterPlotLayoutCommitter = (
  cellId: string,
  committer?: () => PlotLayoutCommitResult
) => {
  const existing = committers.get(cellId);
  if (!existing) {
    return;
  }
  if (!committer || existing === committer) {
    committers.delete(cellId);
  }
};

export const commitPlotLayoutDraft = (
  cellId: string
): PlotLayoutCommitResult => {
  const committer = committers.get(cellId);
  if (!committer) {
    return { ok: true };
  }
  return committer();
};
