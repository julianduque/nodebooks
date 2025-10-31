import type { SqlConnection } from "@nodebooks/notebook-schema";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const EMPTY_SQL_CONNECTIONS: SqlConnection[] = [];

// eslint-disable-next-line no-control-regex, no-useless-escape
const STRIP_ANSI = /\u001B\[[0-?]*[ -\/]*[@-~]/g;

export const normalizeBuffer = (value: string | null | undefined) => {
  if (!value) return "";
  return value.replace(STRIP_ANSI, "").replace(/\r/g, "");
};

export const describeSqlDriver = (driver: SqlConnection["driver"]) => {
  switch (driver) {
    case "postgres":
      return "PostgreSQL";
    default:
      return driver;
  }
};

export const formatSqlTimestamp = (value: string | null | undefined) => {
  if (!value) return null;
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toLocaleString();
  } catch {
    return null;
  }
};
