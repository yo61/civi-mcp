import { describe, expect, it } from "vitest";
import { WhereClauseSchema } from "../../src/mcp/tools/where-schema.js";

describe("WhereClauseSchema", () => {
  it("accepts a field clause", () => {
    expect(WhereClauseSchema.parse(["status_id", "=", 1])).toEqual(["status_id", "=", 1]);
  });

  it("accepts pseudo-constant suffix", () => {
    expect(WhereClauseSchema.parse(["status_id:name", "=", "Current"])).toEqual([
      "status_id:name",
      "=",
      "Current",
    ]);
  });

  it("accepts an AND group", () => {
    const c = [
      "AND",
      [
        ["a", "=", 1],
        ["b", "=", 2],
      ],
    ] as const;
    expect(WhereClauseSchema.parse(c)).toEqual(c);
  });

  it("accepts a nested OR inside AND", () => {
    const c = [
      "AND",
      [
        ["a", "=", 1],
        [
          "OR",
          [
            ["b", "=", 2],
            ["c", "=", 3],
          ],
        ],
      ],
    ] as const;
    expect(WhereClauseSchema.parse(c)).toEqual(c);
  });

  it("rejects malformed clause", () => {
    expect(() => WhereClauseSchema.parse(["AND", "not-an-array"])).toThrow();
    expect(() => WhereClauseSchema.parse(["a"])).toThrow();
  });
});
