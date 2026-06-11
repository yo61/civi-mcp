import { describe, expect, it, vi } from "vitest";
import { countTool } from "../../src/mcp/tools/count.js";

describe("civicrm_count tool", () => {
  it("returns {count: N} from client.count", async () => {
    const count = vi.fn(async () => ({ count: 142 }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = countTool({ count } as any);
    const out = await tool.handler({
      entity: "Contact",
      where: [["contact_type", "=", "Individual"]],
    });
    expect(count).toHaveBeenCalledWith("Contact", [["contact_type", "=", "Individual"]]);
    const parsed = JSON.parse((out.content[0] as { text: string }).text) as { count: number };
    expect(parsed.count).toBe(142);
  });
});
