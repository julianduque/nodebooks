"use client";

import type { NotebookCell, SqlConnection } from "@nodebooks/notebook-schema";
import type { ThemeMode } from "@/components/theme-context";
import PublicMarkdownCell from "@/components/notebook/public/public-markdown-cell";
import PublicCodeCell from "@/components/notebook/public/public-code-cell";
import PublicTerminalCell from "@/components/notebook/public/public-terminal-cell";
import PublicCommandCell from "@/components/notebook/public/public-command-cell";
import PublicHttpCell from "@/components/notebook/public/public-http-cell";
import PublicSqlCell from "@/components/notebook/public/public-sql-cell";
import PublicPlotCell from "@/components/notebook/public/public-plot-cell";
import PublicAiCell from "@/components/notebook/public/public-ai-cell";

const PublicCell = ({
  cell,
  theme,
  connections,
  globals,
}: {
  cell: NotebookCell;
  theme: ThemeMode;
  connections: SqlConnection[];
  globals?: Record<string, unknown>;
}) => {
  if (cell.type === "markdown") {
    return <PublicMarkdownCell cell={cell} theme={theme} />;
  }
  if (cell.type === "code") {
    return <PublicCodeCell cell={cell} />;
  }
  if (cell.type === "terminal") {
    return <PublicTerminalCell cell={cell} />;
  }
  if (cell.type === "command") {
    return <PublicCommandCell cell={cell} />;
  }
  if (cell.type === "http") {
    return <PublicHttpCell cell={cell} />;
  }
  if (cell.type === "sql") {
    return (
      <PublicSqlCell cell={cell} connections={connections} theme={theme} />
    );
  }
  if (cell.type === "plot") {
    return <PublicPlotCell cell={cell} globals={globals ?? {}} />;
  }
  if (cell.type === "ai") {
    return <PublicAiCell cell={cell} theme={theme} />;
  }
  return null;
};

export default PublicCell;
