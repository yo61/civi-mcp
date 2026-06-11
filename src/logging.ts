import pino from "pino";

export type Logger = pino.Logger;

export const createLogger = (level: "error" | "warn" | "info" | "debug"): Logger =>
  pino(
    { level, base: { svc: "civicrm-mcp" } },
    pino.destination({ dest: 2, sync: false }), // 2 = stderr
  );
