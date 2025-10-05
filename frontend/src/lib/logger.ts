// FILE: src/lib/logger.ts

/* Strictly typed, safe logger (works in browser & Node) */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** Core logger */
export function log(level: LogLevel, ...args: ReadonlyArray<unknown>): void {
  // Drop noisy debug logs in production
  if (process.env.NODE_ENV === "production" && level === "debug") return;

  // eslint-disable-next-line no-console
  const fn = (console[level] ?? console.log).bind(console) as (
    ...a: unknown[]
  ) => void;
  fn(...args);
}

/** Convenience helpers */
export const logger = {
  debug: (...args: ReadonlyArray<unknown>): void => log("debug", ...args),
  info: (...args: ReadonlyArray<unknown>): void => log("info", ...args),
  warn: (...args: ReadonlyArray<unknown>): void => log("warn", ...args),
  error: (...args: ReadonlyArray<unknown>): void => log("error", ...args),
};
