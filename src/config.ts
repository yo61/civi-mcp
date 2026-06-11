import { z } from "zod";

const LogLevel = z.enum(["error", "warn", "info", "debug"]);

const EnvSchema = z.object({
  CIVI_BASE_URL: z.url({ error: "CIVI_BASE_URL must be a valid URL" }),
  CIVI_API_KEY: z
    .string({ error: "CIVI_API_KEY is required" })
    .min(1, "CIVI_API_KEY must not be empty"),
  CIVI_AUTHX_PATH: z.string().default("/civicrm/ajax/api4"),
  CIVI_TIMEOUT_MS: z
    .string()
    .default("30000")
    .transform((s, ctx) => {
      const n = Number.parseInt(s, 10);
      if (!Number.isFinite(n) || n <= 0) {
        ctx.addIssue({
          code: "custom",
          message: "CIVI_TIMEOUT_MS must be a positive integer",
        });
        return z.NEVER;
      }
      return n;
    }),
  CIVI_LOG_LEVEL: LogLevel.default("error"),
});

export type Config = {
  baseUrl: URL;
  apiKey: string;
  authxPath: string;
  timeoutMs: number;
  logLevel: z.infer<typeof LogLevel>;
};

export const loadConfig = (env: Record<string, string | undefined>): Config => {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((i) => `${i.path.join(".") || "env"}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid configuration — ${message}`);
  }
  return {
    baseUrl: new URL(parsed.data.CIVI_BASE_URL),
    apiKey: parsed.data.CIVI_API_KEY,
    authxPath: parsed.data.CIVI_AUTHX_PATH,
    timeoutMs: parsed.data.CIVI_TIMEOUT_MS,
    logLevel: parsed.data.CIVI_LOG_LEVEL,
  };
};
