#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Civi4Client } from "./civi/client.js";
import { asApiKey } from "./civi/types.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./logging.js";
import { buildServer } from "./mcp/server.js";

const main = async (): Promise<void> => {
  const cfg = loadConfig(process.env);
  const log = createLogger(cfg.logLevel);

  log.info({ baseUrl: cfg.baseUrl.toString() }, "starting civicrm-mcp");

  const client = new Civi4Client({
    baseUrl: cfg.baseUrl,
    apiKey: asApiKey(cfg.apiKey),
    authxPath: cfg.authxPath,
    timeoutMs: cfg.timeoutMs,
  });

  const server = buildServer(client, log);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  log.info("connected");
};

main().catch((err: unknown) => {
  // stderr — stdout is reserved for JSON-RPC
  process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
