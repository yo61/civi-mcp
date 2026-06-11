import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLogger } from "../../src/logging.js";
import { buildServer } from "../../src/mcp/server.js";
import type { Civi4Client } from "../../src/civi/client.js";

const SKILL_DIR = join(process.cwd(), "skills", "civicrm");

const collectMarkdown = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectMarkdown(p));
    else if (entry.name.endsWith(".md")) out.push(p);
  }
  return out;
};

const extractToolRefs = (text: string): Set<string> => {
  const refs = new Set<string>();
  for (const m of text.matchAll(/\bcivicrm_[a-z_]+/g)) refs.add(m[0]);
  return refs;
};

describe("skill <-> MCP tool name parity", () => {
  it("every civicrm_* token in the skill is a registered MCP tool", () => {
    const server = buildServer({} as unknown as Civi4Client, createLogger("error"));
    // eslint-disable-next-line no-underscore-dangle
    const registered = new Set(server._registeredToolNames());
    const referenced = new Set<string>();
    for (const file of collectMarkdown(SKILL_DIR)) {
      for (const ref of extractToolRefs(readFileSync(file, "utf8"))) {
        referenced.add(ref);
      }
    }
    expect(referenced.size).toBeGreaterThan(0);
    const unknown = [...referenced].filter((r) => !registered.has(r));
    expect(unknown).toEqual([]);
  });
});
