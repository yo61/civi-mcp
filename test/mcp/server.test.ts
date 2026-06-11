import { describe, expect, it } from "vitest";
import { createLogger } from "../../src/logging.js";
import { buildServer } from "../../src/mcp/server.js";

describe("buildServer", () => {
  it("registers all four Phase 1 tools", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const server = buildServer({} as any, createLogger("error"));
    // eslint-disable-next-line no-underscore-dangle
    const names = server._registeredToolNames();
    expect([...names].toSorted()).toEqual(
      [
        "civicrm_count",
        "civicrm_describe_entity",
        "civicrm_get",
        "civicrm_list_entities",
      ].toSorted(),
    );
  });
});
