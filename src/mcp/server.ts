/**
 * MCP server wiring. Registers the four Phase 1 tools against an
 * `McpServer` instance and wraps every handler with the error-to-
 * ToolResult policy seam so domain errors surface as structured
 * `isError` results instead of crashing the JSON-RPC loop.
 *
 * `_registeredToolNames` is a deliberate test seam — keeps the test
 * independent of internal SDK state.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Civi4Client } from "../civi/client.js";
import type { Logger } from "../logging.js";
import { wrapHandler } from "./errors-to-result.js";
import { countTool } from "./tools/count.js";
import { describeEntityTool } from "./tools/describe-entity.js";
import { getTool } from "./tools/get.js";
import { listEntitiesTool } from "./tools/list-entities.js";
import type { ToolResult } from "./tools/list-entities.js";

export type CiviMcpServer = McpServer & {
  _registeredToolNames(): readonly string[];
};

type AnyTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: never) => Promise<ToolResult>;
};

export const buildServer = (client: Civi4Client, log: Logger): CiviMcpServer => {
  const server = new McpServer({
    name: "civicrm-mcp",
    version: "0.1.0",
  }) as CiviMcpServer;
  const registered: string[] = [];

  const register = (t: AnyTool): void => {
    const safe = wrapHandler(t.name, t.handler as (a: unknown) => Promise<ToolResult>, log);
    server.registerTool(
      t.name,
      {
        description: t.description,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inputSchema: t.inputSchema as any,
      },
      // The SDK callback signature is (args, extra) => CallToolResult.
      // Our wrapped handler ignores `extra` and returns a ToolResult,
      // which is structurally a CallToolResult.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (async (args: unknown) => safe(args)) as any,
    );
    registered.push(t.name);
  };

  register(listEntitiesTool(client));
  register(describeEntityTool(client));
  register(getTool(client));
  register(countTool(client));

  // eslint-disable-next-line no-underscore-dangle
  server._registeredToolNames = () => [...registered];
  return server;
};
