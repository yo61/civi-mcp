# civi-mcp

A Model Context Protocol server for CiviCRM. Answer natural-language
questions about your CRM ("how many life members signed up since
January?") from Claude Desktop, Claude Code, Cursor, or any MCP client.

## Status

Phase 1 — read-only, four generic tools, single-tenant via personal API key.

## What's in this repo

- `src/` — the TypeScript MCP server (published to npm as `civi-mcp`)
- `skills/civicrm/` — an optional Claude Code skill with workflow
  heuristics and worked examples
- `docs/` — install guides and the design spec

## Quick start

Make sure the `authx` extension is enabled on your CiviCRM site and you
have a personal API key (Contact -> API key field).

### Claude Code (recommended)

This repo is also published as a Claude Code plugin via the
[`yo61/claude-skills`](https://github.com/yo61/claude-skills) marketplace.
One command registers the MCP server and the skill, prompting for the
Civi URL and API key (the key is stored in the system keychain):

```
/plugin marketplace add yo61/claude-skills
/plugin install civi-mcp
```

### Claude Desktop (recommended)

Each [release](https://github.com/yo61/civi-mcp/releases) ships a
`civi-mcp-vX.Y.Z.mcpb` MCP Bundle. Download it and **double-click the
file** — Claude Desktop opens an install dialog. (Alternatively:
**Settings → Extensions → Install Extension…**, or drag the file into
the window.) Enter the Civi URL and API key when prompted; the key is
stored in the system keychain.

### Other MCP clients (or manual setup)

- Configure the MCP server by hand: see [`docs/install-mcp.md`](docs/install-mcp.md).
- (Claude Code only) install the skill by hand: see
  [`docs/install-skill.md`](docs/install-skill.md).

## How it works

The MCP server exposes four typed tools:

| Tool                      | Purpose                                              |
| ------------------------- | ---------------------------------------------------- |
| `civicrm_list_entities`   | Discover entities on this site                       |
| `civicrm_describe_entity` | Fields, pseudo-constants, query hints for one entity |
| `civicrm_get`             | Generic query (where / select / orderBy / limit)     |
| `civicrm_count`           | Cheap exact-count for "how many" questions           |

The agent calls `describe_entity` once per entity, then issues structured
queries. Pseudo-constants are surfaced so the agent can write
`['status_id:name','=','Current']` rather than guessing numeric ids.
Custom fields are discovered through introspection.

See [the design spec](docs/superpowers/specs/2026-06-10-civi-mcp-server-design.md)
for details.

## Development

```sh
pnpm install
pnpm dev                 # run from source with stdio transport
pnpm test                # unit + component tests
pnpm test:integration    # env-gated live test (needs CIVI_INTEGRATION=1 + creds)
pnpm verify              # format + lint + typecheck + test
```

## Licence

MIT.
