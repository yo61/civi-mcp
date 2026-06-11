import { describe, expect, it, vi } from "vitest";
import { getTool } from "../../src/mcp/tools/get.js";

describe("civicrm_get tool", () => {
  it("delegates to client.get with the given params and returns serialised result", async () => {
    const get = vi.fn(async () => ({
      count: 1,
      values: [{ id: 1, display_name: "Alice" }],
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = getTool({ get } as any);
    const out = await tool.handler({
      entity: "Contact",
      where: [["display_name", "LIKE", "Ali%"]],
      select: ["id", "display_name"],
      limit: 25,
      offset: 0,
    });
    expect(get).toHaveBeenCalledWith("Contact", {
      where: [["display_name", "LIKE", "Ali%"]],
      select: ["id", "display_name"],
      limit: 25,
      offset: 0,
    });
    const parsed = JSON.parse((out.content[0] as { text: string }).text) as {
      count: number;
      values: unknown[];
    };
    expect(parsed.count).toBe(1);
  });

  it("rejects limit > 500", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = getTool({ get: async () => ({ count: 0, values: [] }) } as any);
    // Tools receive raw args; validation happens via the inputSchema in server.ts
    // but the schema itself should reject limit=1000 when parsed:
    const limitSchema = tool.inputSchema.limit;
    expect(() => limitSchema.parse(1000)).toThrow();
  });
});
