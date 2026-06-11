/**
 * civicrm_count — MCP tool wrapping Civi4Client.count.
 *
 * Belongs to the MCP bounded context. Provides a cheap "how many" entry
 * point that delegates to APIv4 `get` with `select: ['row_count']` under
 * the hood. Use this instead of `civicrm_get` when only the count matters
 * — it avoids streaming rows the caller will discard.
 *
 * `inputSchema` is exposed as the raw record of zod schemas so the MCP
 * server can hand each field schema to the SDK individually; the handler
 * parses internally so direct callers still get `.default(...)` values.
 */
import { z } from "zod";
import type { Civi4Client } from "../../civi/client.js";
import type { ToolResult } from "./list-entities.js";
import { WhereClauseSchema } from "./where-schema.js";

const InputSchema = {
  entity: z.string().min(1),
  where: z.array(WhereClauseSchema).default([]),
} as const;

const ArgsSchema = z.object(InputSchema);
type Args = z.input<typeof ArgsSchema>;

export const countTool = (client: Civi4Client) => ({
  name: "civicrm_count" as const,
  description:
    "Count CiviCRM records matching a where clause. Cheaper than civicrm_get for 'how many' questions.",
  inputSchema: InputSchema,
  handler: async (args: Args): Promise<ToolResult> => {
    const parsed = ArgsSchema.parse(args);
    const result = await client.count(parsed.entity, parsed.where);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
});
