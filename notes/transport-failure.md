# MCP server transport failure — 2026-06-11

Handoff doc for a fresh debugging session. Self-contained: assume no prior
context.

## Symptom

Every call into the local `civicrm` MCP server fails identically at the
JSON-RPC transport layer, before any handler logic runs. The client surfaces:

```
Transport error calling <tool_name>: Response was not valid JSON
```

The server _is_ reachable (the call goes out and a response comes back). The
response simply isn't a valid JSON-RPC frame.

## Calls attempted

All four exposed tools were invoked. All four returned the same transport
error.

| Tool                      | Arguments                  | Result            |
| ------------------------- | -------------------------- | ----------------- |
| `civicrm_describe_entity` | `{entity: "Contribution"}` | Response not JSON |
| `civicrm_describe_entity` | `{entity: "Membership"}`   | Response not JSON |
| `civicrm_list_entities`   | `{}`                       | Response not JSON |
| `civicrm_count`           | `{entity: "Contribution"}` | Response not JSON |

The triggering user task was "How many members have pending contributions?" —
not relevant to the bug; any call would have hit the same failure.

## What this rules out

- Not a per-tool bug. Four tools with different schemas all fail identically,
  so it isn't a malformed zod schema, a bad handler return shape, or a
  CiviCRM-side error being mis-mapped by one tool's policy.
- Not a CiviCRM connectivity issue. CiviCRM-side failures would come back as a
  structured `ToolResult` (see commit `32e8bb9 feat(mcp): server wiring with
policy-based error-to-ToolResult mapping`), not a transport error.
- Not an unloaded tool schema. Schemas were fetched via `ToolSearch
select:...` before each call and returned cleanly.

So the corruption is happening between the dispatch layer and stdout, or
_around_ startup before dispatch ever runs.

## Most likely causes, in order

1. **Stdout pollution.** Stdio MCP servers reserve stdout for JSON-RPC frames
   only. A stray `console.log`, banner print, dotenv "loaded .env" notice, or
   library that defaults to stdout will corrupt the first frame the client
   reads. Symptom matches exactly: every call fails with "Response was not
   valid JSON".
2. **Unhandled exception on startup spilling to stdout.** A missing env var
   (CiviCRM site URL, API key, etc.) throwing before the JSON-RPC writer is
   installed would dump a stack trace where the client expects a response.
3. **Logger misconfiguration.** A logger (pino, winston, console) defaulting
   to stdout instead of stderr.
4. **Framing bug.** The transport writes valid JSON but with wrong framing
   (missing newline for ndjson, missing Content-Length header for LSP-style,
   double-emitted frames). Less likely given the SDK normally handles this,
   but worth checking if a custom writer was introduced.

## Where to look first

Recent commits on `feat/civi-mcp-phase-1`:

```
d0645e6 feat(skill): SKILL.md with workflow heuristics and mental model
e47fc18 fix(test): make integration test discoverable but lazily constructed
4b9b9ec test(integration): live APIv4 smoke test (env-gated)
819555c feat(cli): bootstrap MCP server over stdio          <-- prime suspect
32e8bb9 feat(mcp): server wiring with policy-based error-to-ToolResult mapping
```

`819555c` introduced the stdio bootstrap. That is the most likely site of the
bug.

Files to inspect:

- The CLI entry point (likely `src/cli.ts` or `src/index.ts` or
  `bin/civi-mcp` — whatever `819555c` added).
- The MCP server wiring from `32e8bb9`.
- Any logger setup module.
- `.env` loading code (dotenv banners often print to stdout).

Grep targets in `src/`:

```bash
rg -n 'console\.(log|info|warn|debug)' src/
rg -n 'process\.stdout' src/
rg -n 'dotenv' src/
rg -n 'pino|winston|bunyan' src/
```

Anything in `src/` writing to stdout outside of the MCP transport is suspect.
All diagnostic output must go to stderr.

## Concrete reproduction

The cleanest signal is the raw bytes the server emits. Run the server manually
and pipe a JSON-RPC `initialize` + `tools/list` frame in, observe what comes
back on stdout. Anything that is not a single well-formed JSON-RPC response is
the bug.

Roughly:

```bash
# Adjust to whatever the bin/entry actually is
node dist/cli.js < /tmp/mcp-handshake.jsonl

# Or, to see stdout vs stderr separately:
node dist/cli.js < /tmp/mcp-handshake.jsonl 2> /tmp/stderr.log
```

If a banner, log line, or stack trace appears anywhere in stdout above or
below the JSON-RPC response, that is the corruption.

A minimal `/tmp/mcp-handshake.jsonl`:

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"debug","version":"0.0.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}
```

## Environment

- Project: `/Users/robin/code/github.com/yo61/civi-mcp-server`
- Branch: `feat/civi-mcp-phase-1`
- MCP transport: stdio
- Configured via: `.mcp.json` or `claude mcp add` (per project memory —
  `.claude/settings.json` is NOT the config location for this client).

## Fix shape (expected)

Whatever is writing to stdout, route it to stderr instead. Examples:

- `console.log(...)` → `console.error(...)`
- `dotenv.config()` → `dotenv.config({ debug: false })` plus suppress any
  custom banner
- Logger config → set destination to `process.stderr` (pino:
  `pino(pino.destination(2))`)

After the fix, the manual repro above should produce exactly the expected
JSON-RPC frames on stdout and nothing else.
