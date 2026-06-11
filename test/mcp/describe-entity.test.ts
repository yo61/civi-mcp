import { describe, expect, it, vi } from "vitest";
import { describeEntityTool } from "../../src/mcp/tools/describe-entity.js";
import type { EntityDescribe } from "../../src/civi/types.js";

const stubDescribe: EntityDescribe = {
  entity: "Membership",
  description: "",
  actions: ["get"],
  primaryKey: ["id"],
  fields: [
    {
      name: "status_id",
      type: "Integer",
      required: true,
      pseudoconstant: {
        queryByName: "status_id:name",
        queryByLabel: "status_id:label",
        values: [{ id: 2, name: "Current", label: "Current" }],
      },
    },
  ],
  queryHints: ["Date format: 'YYYY-MM-DD'"],
};

describe("civicrm_describe_entity tool", () => {
  it("returns describe payload as JSON in a text content block", async () => {
    const describeFn = vi.fn(async () => stubDescribe);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = describeEntityTool({ describe: describeFn } as any);
    const out = await tool.handler({ entity: "Membership" });
    expect(describeFn).toHaveBeenCalledWith("Membership", { refresh: false });
    const parsed = JSON.parse((out.content[0] as { text: string }).text) as EntityDescribe;
    expect(parsed.entity).toBe("Membership");
    expect(parsed.fields[0]?.pseudoconstant?.queryByName).toBe("status_id:name");
  });

  it("forwards refresh=true to the client", async () => {
    const describeFn = vi.fn(async () => stubDescribe);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = describeEntityTool({ describe: describeFn } as any);
    await tool.handler({ entity: "Membership", refresh: true });
    expect(describeFn).toHaveBeenCalledWith("Membership", { refresh: true });
  });
});
