/**
 * civicrm_list_entities — MCP tool wrapping Civi4Client.listEntities.
 *
 * Belongs to the MCP bounded context. Tools are the outward-facing
 * primitives the LLM invokes; each takes a typed input and produces
 * a `ToolResult` (a list of content blocks). This tool takes no
 * input — it returns the entity catalogue the Civi site exposes.
 *
 * `ToolResult` is defined here and re-used by sibling tool files.
 */
import type { Civi4Client } from "../../civi/client.js";

export type ToolResult = {
  content: ReadonlyArray<{ type: "text"; text: string }>;
  isError?: boolean;
};

export const listEntitiesTool = (client: Civi4Client) => ({
  name: "civicrm_list_entities" as const,
  description:
    "List CiviCRM entities available on this site. Call once per session before guessing entity names.",
  inputSchema: {} as const,
  handler: async (_args: Record<string, never>): Promise<ToolResult> => {
    const values = await client.listEntities();
    return { content: [{ type: "text", text: JSON.stringify(values, null, 2) }] };
  },
});
