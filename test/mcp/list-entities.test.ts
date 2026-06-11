import { describe, expect, it } from "vitest";
import { listEntitiesTool } from "../../src/mcp/tools/list-entities.js";

const fakeClient = {
  listEntities: async () => [
    { name: "Contact", title: "Contact", description: "A contact" },
    { name: "Membership", title: "Membership", description: "A membership" },
  ],
} as const;

describe("civicrm_list_entities tool", () => {
  it("returns entities serialised as JSON in a text content block", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await listEntitiesTool(fakeClient as any).handler({});
    expect(result.content[0]?.type).toBe("text");
    const parsed = JSON.parse((result.content[0] as { text: string }).text) as Array<{
      name: string;
    }>;
    expect(parsed.map((e) => e.name)).toEqual(["Contact", "Membership"]);
  });

  it("declares no input parameters", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = listEntitiesTool(fakeClient as any);
    expect(Object.keys(tool.inputSchema)).toHaveLength(0);
  });
});
