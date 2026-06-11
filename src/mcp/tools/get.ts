/**
 * civicrm_get — MCP tool wrapping Civi4Client.get.
 *
 * Belongs to the MCP bounded context. Provides the LLM with a bounded,
 * validated entry point into APIv4 `get` queries. The `limit` is capped
 * at 500 to keep responses within token budgets; callers must paginate
 * via `offset` for larger result sets.
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
  select: z.array(z.string()).default(["*"]),
  orderBy: z.record(z.string(), z.enum(["ASC", "DESC"])).optional(),
  limit: z.number().int().min(1).max(500).default(25),
  offset: z.number().int().min(0).default(0),
  groupBy: z.array(z.string()).optional(),
} as const;

const ArgsSchema = z.object(InputSchema);
type Args = z.input<typeof ArgsSchema>;

export const getTool = (client: Civi4Client) => ({
  name: "civicrm_get" as const,
  description:
    "Query CiviCRM records via APIv4 get. Returns {count, values}. " +
    "Use pseudo-constant suffix names in where clauses (e.g. 'status_id:name') for human-readable queries. " +
    "Use dot-notation in select for joins (e.g. 'contact_id.display_name').",
  inputSchema: InputSchema,
  handler: async (args: Args): Promise<ToolResult> => {
    const parsed = ArgsSchema.parse(args);
    const result = await client.get(parsed.entity, {
      where: parsed.where,
      select: parsed.select,
      limit: parsed.limit,
      offset: parsed.offset,
      ...(parsed.orderBy !== undefined ? { orderBy: parsed.orderBy } : {}),
      ...(parsed.groupBy !== undefined ? { groupBy: parsed.groupBy } : {}),
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
});
