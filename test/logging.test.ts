import { describe, expect, it } from "vitest";
import { createLogger } from "../src/logging.js";

describe("createLogger", () => {
  it("returns a pino logger configured at the given level", () => {
    const log = createLogger("info");
    expect(typeof log.info).toBe("function");
    expect(log.level).toBe("info");
  });
});
