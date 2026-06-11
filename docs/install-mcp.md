# Installing the civi-mcp server

## Prerequisites

- A CiviCRM 5.40+ site with the `authx` extension enabled.
- A personal API key on your CiviCRM user (Contact → API key field).
- Node 22+ and `npx` available locally.

## Claude Code: install as a plugin (recommended)

The fastest path on Claude Code is the plugin in the
[`yo61/claude-skills`](https://github.com/yo61/claude-skills) marketplace.
It registers the MCP server **and** loads the companion skill in one
step, prompting for the Civi URL and API key at install time:

```
/plugin marketplace add yo61/claude-skills
/plugin install civi-mcp
```

The base URL goes to `~/.claude/settings.json`; the API key is stored in
the system keychain (declared with `sensitive: true` in the plugin
manifest). Skip the rest of this document if you went this route.

## Configure your MCP client manually

Use this path for Claude Desktop, Cursor, or any non-Claude-Code MCP
client — or if you prefer to wire things up by hand.

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) or the equivalent on your OS:

```jsonc
{
  "mcpServers": {
    "civicrm": {
      "command": "npx",
      "args": ["-y", "civi-mcp"],
      "env": {
        "CIVI_BASE_URL": "https://civi.example.org",
        "CIVI_API_KEY": "<your-personal-api-key>"
      }
    }
  }
}
```

Restart Claude Desktop.

### Claude Code

Easiest: use the `claude mcp add` command, which writes to the right
config file with the right schema. Run this in your project directory:

```sh
claude mcp add civicrm \
  -e CIVI_BASE_URL=https://civi.example.org \
  -e CIVI_API_KEY=<your-personal-api-key> \
  -- npx -y civi-mcp
```

`--scope local` is the default (per-project, written to `~/.claude.json`).
Use `--scope user` to make it available in every Claude Code session, or
`--scope project` to write a committable `.mcp.json` in the project root
(use placeholders, never commit the real key).

Verify with:

```sh
claude mcp list
```

`civicrm` should appear as `✓ Connected`. Start a new Claude Code session
(in the same directory if you used `--scope local`) so the server is
picked up, then run `/mcp` to confirm the four tools are listed.

**Do NOT put the MCP server definition in `.claude/settings.json`** — that
file is for permissions, hooks, env vars, status line, and model
selection. MCP server definitions live in `.mcp.json` / `~/.claude.json`
as written by `claude mcp add`.

## Verify

In your MCP client, run a tool listing — you should see
`civicrm_list_entities`, `civicrm_describe_entity`, `civicrm_get`,
`civicrm_count`.

Try a small query: "How many contacts are in the database?"

## Configuration reference

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `CIVI_BASE_URL` | yes | — | Base URL of the Civi site |
| `CIVI_API_KEY` | yes | — | User's personal API key (Bearer) |
| `CIVI_AUTHX_PATH` | no | `/civicrm/ajax/api4` | Override only if your site uses a non-standard API4 path |
| `CIVI_TIMEOUT_MS` | no | `30000` | HTTP request timeout |
| `CIVI_LOG_LEVEL` | no | `error` | `error` \| `warn` \| `info` \| `debug` |
