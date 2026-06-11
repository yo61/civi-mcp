import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("parses required env vars", () => {
    const cfg = loadConfig({
      CIVI_BASE_URL: "https://civi.example.org",
      CIVI_API_KEY: "secret-key",
    });
    expect(cfg.baseUrl.toString()).toBe("https://civi.example.org/");
    expect(cfg.apiKey).toBe("secret-key");
    expect(cfg.authxPath).toBe("/civicrm/authx/api4");
    expect(cfg.timeoutMs).toBe(30_000);
    expect(cfg.logLevel).toBe("error");
  });

  it("rejects missing required vars with a clear message", () => {
    expect(() => loadConfig({})).toThrow(/CIVI_BASE_URL/);
  });

  it("rejects malformed URL", () => {
    expect(() => loadConfig({ CIVI_BASE_URL: "not a url", CIVI_API_KEY: "x" })).toThrow(
      /CIVI_BASE_URL/,
    );
  });

  it("accepts overrides for optional vars", () => {
    const cfg = loadConfig({
      CIVI_BASE_URL: "https://civi.example.org",
      CIVI_API_KEY: "secret",
      CIVI_AUTHX_PATH: "/civicrm/ajax/api4",
      CIVI_TIMEOUT_MS: "60000",
      CIVI_LOG_LEVEL: "debug",
    });
    expect(cfg.authxPath).toBe("/civicrm/ajax/api4");
    expect(cfg.timeoutMs).toBe(60_000);
    expect(cfg.logLevel).toBe("debug");
  });
});
