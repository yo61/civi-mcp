/**
 * civicrm_describe_entity — MCP tool wrapping Civi4Client.describe.
 *
 * Belongs to the MCP bounded context. Returns the field metadata,
 * available actions and query hints for a single entity so the
 * caller can construct a valid `civicrm_get` payload without
 * guessing field names or pseudoconstant aliases.
 *
 * `refresh: true` bypasses the client's describe cache.
 */
import { z } from "zod";
import type { Civi4Client } from "../../civi/client.js";
import type { ToolResult } from "./list-entities.js";

const InputSchema = {
  entity: z.string().min(1, "entity is required"),
  refresh: z.boolean().default(false),
} as const;

const ArgsSchema = z.object(InputSchema);
type Args = z.input<typeof ArgsSchema>;

export const describeEntityTool = (client: Civi4Client) => ({
  name: "civicrm_describe_entity" as const,
  description:
    "Return field metadata, available actions and query hints for a single CiviCRM entity. " +
    "Use the pseudoconstant fields to query by human-readable name (e.g. ['status_id:name','=','Current']).",
  inputSchema: InputSchema,
  handler: async (args: Args): Promise<ToolResult> => {
    const parsed = ArgsSchema.parse(args);
    const payload = await client.describe(parsed.entity, { refresh: parsed.refresh });
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  },
});
