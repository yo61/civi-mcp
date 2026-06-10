# `civicrm-mcp` — Design Spec

- **Date:** 2026-06-10
- **Status:** Approved (Phase 1 scope)
- **Author:** Robin (with Claude Code, explanatory mode)

## 1. Purpose

A TypeScript MCP server that lets an LLM (Claude Desktop, Claude Code, Cursor)
answer natural-language questions against a CiviCRM instance via APIv4.

Phase 1 supports a personal, read-only workflow ("how many life members signed
up since 1 Jan?"). The architecture must extend cleanly to:

- **Phase 2** — additional users in Robin's org, plus dedicated tools for the
  highest-value entities.
- **Phase 3** — publishable as a generic tool any CiviCRM admin can point at
  their own instance.

## 2. Goals & non-goals

### Goals

- Natural-language analytical queries against CiviCRM data, accurate and
  schema-aware.
- A small, fixed set of generic MCP tools (≤ 10) so the LLM's tool selection
  stays sharp.
- Works against arbitrary Civi schemas (extensions, custom fields, custom
  entities) without code changes.
- An optional Claude Code skill that gives the agent CiviCRM workflow
  heuristics, domain mental model, and common query patterns — opt-in for
  Claude Code users; the MCP server stays universal.
- TypeScript that is approachable for someone learning the language: explicit,
  idiomatic, strict-typed.

### Non-goals (Phase 1)

- Writes of any kind.
- HTTP/SSE transport (stdio only).
- OAuth (Bearer token via `authx` is sufficient).
- APIv3 fallback (rare on modern Civi; revisit only if shipped publicly).
- Multi-tenant request routing in a single process.
- A bespoke permission layer — CiviCRM's own ACLs are the authority, enforced
  via the user's API key.
- Dedicated entity tools — deferred to Phase 2 with evidence.

## 3. Architecture

Three units, narrowly scoped, communicating through small interfaces:

```text
   ┌─────────────────────────┐
   │   MCP layer             │   stdio JSON-RPC ⇄ host client
   │   (@modelcontextprotocol│
   │    /sdk)                │
   └──────────┬──────────────┘
              │ typed handlers (zod-validated args)
   ┌──────────▼──────────────┐
   │   Civi4Client           │   typed APIv4 wrapper
   │                         │   • describe + in-memory cache
   │                         │   • get / count / call
   │                         │   • authx Bearer header
   └──────────┬──────────────┘
              │ HTTPS + JSON
   ┌──────────▼──────────────┐
   │   CiviCRM site          │   /civicrm/authx/api4/$Entity/$action
   └─────────────────────────┘
```

- **MCP layer** — knows the MCP protocol, defines tools with zod schemas,
  formats results for the LLM. No HTTP knowledge, no Civi semantics.
- **`Civi4Client`** — knows APIv4 (URL shape, auth header, response envelope,
  error format). Stateless apart from the introspection cache. Reusable as a
  plain TypeScript library — re-used by the Phase 2 codegen script.
- **Bootstrap (`cli.ts`)** — reads env/args, builds the client, wires it into
  the MCP server, starts the stdio transport.

## 4. The four Phase 1 tools

### 4.1 `civicrm_list_entities`

- **Args:** none.
- **Returns:** array of `{ name, title, description, abstract }` for every
  entity available on the target site.
- **Backing call:** `Entity.get` (APIv4).

### 4.2 `civicrm_describe_entity`

- **Args (zod):**
  ```ts
  {
    entity: z.string(),
    includeCustomFields: z.boolean().default(true)
  }
  ```
- **Returns:** a compact document with everything the LLM needs to query the
  entity correctly:

  ```jsonc
  {
    "entity": "Membership",
    "description": "...",
    "actions": ["get", "getFields", "getActions", "create", "update", "delete", "save"],
    "primaryKey": ["id"],
    "fields": [
      {
        "name": "status_id",
        "type": "Integer",
        "title": "Status",
        "required": true,
        "fkEntity": "MembershipStatus",
        "pseudoconstant": {
          "queryByName": "status_id:name",
          "queryByLabel": "status_id:label",
          "values": [
            { "id": 1, "name": "New", "label": "New" },
            { "id": 2, "name": "Current", "label": "Current" }
          ]
        }
      },
      {
        "name": "custom_42",
        "type": "String",
        "title": "Renewal source",
        "custom": { "groupName": "MembershipDetails", "fieldName": "RenewalSource" }
      }
    ],
    "queryHints": [
      "Filter by pseudo-constant name: ['status_id:name','=','Current']",
      "Date format: 'YYYY-MM-DD'",
      "Join via dot-notation in select: ['contact_id.display_name']"
    ]
  }
  ```

- **Backing calls:** `$Entity.getFields`, `$Entity.getActions` (plus pseudo-
  constant resolution via `getFields` parameters).

### 4.3 `civicrm_get`

APIv4 `where` clauses come in two shapes: **field clauses**
(`[field, op, value]` 3-tuples) and **logical groups**
(`["AND" | "OR" | "NOT", [...subclauses]]` 2-tuples, which can nest). We model
both with a recursive discriminated union:

```ts
const FieldClause = z.tuple([z.string(), z.string(), z.unknown()]);
type WhereClause = z.infer<typeof FieldClause> | [
  "AND" | "OR" | "NOT",
  WhereClause[]
];
const WhereClauseSchema: z.ZodType<WhereClause> = z.union([
  FieldClause,
  z.tuple([z.enum(["AND", "OR", "NOT"]), z.lazy(() => z.array(WhereClauseSchema))])
]);
```

- **Args (zod):**
  ```ts
  {
    entity: z.string(),
    where: z.array(WhereClauseSchema).default([]),
    select: z.array(z.string()).default(["*"]),
    orderBy: z.record(z.enum(["ASC", "DESC"])).optional(),
    limit: z.number().int().min(1).max(500).default(25),
    offset: z.number().int().min(0).default(0),
    groupBy: z.array(z.string()).optional()
  }
  ```
- **Returns:** `{ count: <returned>, values: [...] }`. Result count is bounded.
- **Backing call:** `$Entity.get`.

### 4.4 `civicrm_count`

- **Args:** same shape as `civicrm_get` but only `entity` and `where`.
- **Returns:** `{ count: <number> }`.
- **Backing call:** `$Entity.get` with `select=["row_count"]`.

### 4.5 End-to-end trace

*"How many life members signed up since 1 Jan?"*

1. `civicrm_describe_entity("MembershipType")` → sees `name` field.
2. `civicrm_get("MembershipType", where=[["name","=","Lifetime"]], select=["id","name"])`
   → `{ values: [{id: 7, name: "Lifetime"}] }`.
3. `civicrm_describe_entity("Membership")` → fields incl. `status_id`
   pseudoconstants.
4. `civicrm_count("Membership", where=[["membership_type_id","=",7],
   ["start_date",">=","2026-01-01"],
   ["status_id:name","IN",["New","Current"]]])` → `{ count: N }`.

Two of these calls are cached after the first session question.

## 5. Companion Claude Code skill

The MCP server gives the agent **hands** (typed tool contracts). The skill
gives it **intuition** (when to use which tool, how CiviCRM is structured,
common query shapes). They are complementary: the MCP works in any MCP
client; the skill is an opt-in companion for Claude Code users that materially
improves results.

### 5.1 Seam between skill and MCP

To keep the two artifacts from drifting:

- **MCP `describe_entity.queryHints`** carries *per-entity, schema-specific*
  guidance (pseudo-constant suffix, date format, dot-notation joins). These
  are generated from the live schema and are always current.
- **Skill** carries *cross-entity, workflow-level, conceptual* guidance — the
  things that don't change when an admin installs a new extension.

Rule of thumb: if a hint mentions a specific field, it belongs in
`queryHints`. If it talks about the agent's approach or CiviCRM as a domain,
it belongs in the skill.

### 5.2 Skill content (Phase 1)

A single `SKILL.md` plus a small `examples/` directory. Frontmatter follows
the Claude Code skill format:

```markdown
---
name: civicrm
description: Use when answering analytical or operational questions about a
  CiviCRM instance — members, contributions, events, contacts, activities.
  Provides workflow heuristics and common query patterns. Requires the
  civicrm-mcp MCP server to be configured.
---
```

Body sections:

- **When to invoke.** Trigger phrases ("how many members…", "list contacts…",
  "donations by…"). What to do if the MCP server is unavailable (tell the
  user; don't try to fabricate answers).
- **Workflow heuristics.**
  - Start with `civicrm_list_entities` if you don't recognise an entity name
    from the user's question.
  - Cache `describe_entity` results — call once per entity per session.
  - For "how many" questions, prefer `civicrm_count` over `civicrm_get`.
  - For "list me…" or "show me…" set `limit` explicitly to match user intent.
  - When the user names a status, type, or category in plain English, query
    via the `:name` or `:label` pseudo-constant suffix, not the numeric id.
- **CiviCRM mental model.** A short, accurate description of:
  - **Contact** as the root entity (Individual / Organization / Household).
  - **Membership** = a Contact's relationship to a MembershipType, with a
    status that's auto-recalculated by Civi.
  - **Contribution** = a financial transaction linked to a Contact (and
    optionally a Membership, an Event, etc.). Hard credit vs soft credit.
  - **Activity** = a logged interaction (call, email, meeting). Has a status
    and an assignee.
  - **Participant** = a Contact registered for an Event.
- **Pseudo-constant cheat-sheet** with worked examples.
- **Gotchas** — `is_deleted` defaults, timezone semantics, custom field
  naming conventions, soft credit double-counting.
- **Common query patterns** (links into `examples/`).

### 5.3 Examples

Each example is a short markdown file showing a worked natural-language
question end-to-end, including the MCP calls and the expected shape of the
result. Phase 1 examples:

- `examples/active-members.md` — current members of a given type.
- `examples/donations-by-month.md` — contribution totals grouped by month.
- `examples/lapsed-members.md` — members whose end_date passed in the last
  N days.
- `examples/recent-activity.md` — contacts with activities in the last week.

### 5.4 Installation

The skill is **not** part of the npm package. Installation is a documented
manual step:

```sh
# from a clone of civi-mcp-server
cp -r skills/civicrm ~/.claude/skills/civicrm
```

A small README at `skills/civicrm/INSTALL.md` documents the path and
explains how to verify the install (`/skills` listing in Claude Code).

If a Claude Code skill marketplace gains traction later, the skill will be
republished there; the in-repo copy stays canonical.

### 5.5 Drift-prevention

- A `skills/civicrm/CHANGELOG.md` records skill changes alongside MCP
  changes. PRs that change MCP tool names, args, or response shapes must
  also update the skill or explicitly note "no skill change needed".
- An integration test (`test/integration/skill-consistency.test.ts`) parses
  the skill's MCP-tool references and asserts each tool name exists in the
  server's registered tool list. Catches renames at CI time.

## 6. CiviCRM client (`Civi4Client`)

### 6.1 Public surface

`ApiKey` is a branded `string` — a TypeScript idiom for tagging secrets so they
can't be accidentally interpolated into URLs or logs:

```ts
export type ApiKey = string & { readonly __brand: "ApiKey" };
export const asApiKey = (s: string): ApiKey => s as ApiKey;
```

```ts
class Civi4Client {
  constructor(opts: {
    baseUrl: URL;
    apiKey: ApiKey;        // branded string
    authxPath?: string;    // default: "/civicrm/authx/api4"
    timeoutMs?: number;    // default: 30_000
    fetcher?: typeof fetch; // injectable for tests
  });

  listEntities(): Promise<EntitySummary[]>;
  describe(entity: string, opts?: { refresh?: boolean }): Promise<EntityDescribe>;
  get<T = unknown>(entity: string, params: ApiV4GetParams): Promise<{ count: number; values: T[] }>;
  count(entity: string, where: WhereClause[]): Promise<{ count: number }>;
  call<T = unknown>(entity: string, action: string, params: object): Promise<T>; // internal escape hatch
}
```

### 6.2 Request shape

POST to `${baseUrl}${authxPath}/${Entity}/${action}` with:

- Header `Authorization: Bearer <apiKey>`
- Header `Content-Type: application/json`
- Header `X-Requested-With: XMLHttpRequest`
- Body `{ "params": { ... } }`

### 6.3 Response handling

APIv4 always responds with `{ values: [...], count: N, ... }` on success.
On error the body contains `{ is_error: 1, error_message: "...", error_code: "..." }`
which is converted into a typed `CiviApiError`.

### 6.4 Caching

- **Type:** `Map<string, Promise<EntityDescribe>>` keyed by entity name.
- **Storing the promise (not the resolved value)** deduplicates concurrent
  in-flight requests.
- **Lifetime:** the MCP server process.
- **Invalidation:** `describe(entity, { refresh: true })` bypasses and replaces.
- **List-of-entities** cached the same way under a sentinel key.
- **No disk cache in Phase 1.** Add later if restart latency hurts.

## 7. Configuration

All config from env vars, with CLI overrides for ad-hoc use:

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `CIVI_BASE_URL` | yes | — | Base URL of the Civi site |
| `CIVI_API_KEY` | yes | — | User's personal API key (Bearer) |
| `CIVI_AUTHX_PATH` | no | `/civicrm/authx/api4` | Override for non-standard sites |
| `CIVI_TIMEOUT_MS` | no | `30000` | HTTP request timeout |
| `CIVI_CACHE_DIR` | no | (off) | Reserved for Phase 2 disk cache |
| `CIVI_LOG_LEVEL` | no | `error` | `error` \| `warn` \| `info` \| `debug` |

Example Claude Desktop config snippet:

```jsonc
{
  "mcpServers": {
    "civicrm": {
      "command": "npx",
      "args": ["-y", "civicrm-mcp"],
      "env": {
        "CIVI_BASE_URL": "https://civi.example.org",
        "CIVI_API_KEY": "<personal-api-key>"
      }
    }
  }
}
```

## 8. Transport

- **Phase 1:** `StdioServerTransport` from `@modelcontextprotocol/sdk`.
- **Logging:** all logs to **stderr** (`pino` configured with stderr
  destination). stdout is reserved for the JSON-RPC stream.

## 9. Error handling

Three error classes, all extending `CiviError`:

- `CiviAuthError` — HTTP 401/403 or APIv4 permission denial. Surfaced to the
  LLM verbatim so it can explain to the user.
- `CiviApiError` — `is_error: 1` from APIv4 (validation, unknown field/entity).
  Civi's error message is included; LLMs self-correct well from these.
- `CiviTransportError` — network failure, timeout, non-JSON response. Includes
  the request signature.

Inside MCP tool handlers, errors are caught and returned as `isError: true`
tool results with a structured message. Full errors logged to stderr at
`error` level. Never swallowed.

## 10. Testing strategy

| Layer | Tool | Scope | Mocks? |
|---|---|---|---|
| Unit | vitest | Pure functions: query-building, cache eviction, schema mappers | None |
| Component | vitest | `Civi4Client` and tool handlers | Mock `fetch` (msw or native) |
| Integration (opt-in) | vitest | Real APIv4 against test Civi | None; env-gated `CIVI_INTEGRATION_BASE_URL` + key |

Principles (from global standards):

- Test behaviour, not implementation.
- Cover edges and error paths, not just the happy path.
- Mock the HTTP boundary, not the client.
- Verify tests catch failures (break code → test fails → fix).

## 11. Project layout

The repo holds two related-but-independent artifacts: the npm-published MCP
server and the manually-installed Claude Code skill. They share docs and a
changelog but are distributed through different channels.

```text
civi-mcp-server/
├── package.json                  # type: "module", node 22, bin entry
├── tsconfig.json                 # strict + noUncheckedIndexedAccess + ...
├── .oxlintrc.json
├── .oxfmt.toml
├── .pre-commit-config.yaml       # prek reads this natively
├── README.md                     # overview + install both artifacts
│
├── src/                          # MCP server (published to npm)
│   ├── cli.ts                    # entry point
│   ├── config.ts                 # env parsing → typed Config (zod)
│   ├── civi/
│   │   ├── index.ts              # public exports
│   │   ├── client.ts             # Civi4Client
│   │   ├── http.ts               # fetch wrapper, timeout
│   │   ├── errors.ts
│   │   ├── types.ts
│   │   └── cache.ts
│   └── mcp/
│       ├── index.ts
│       ├── server.ts             # registers tools
│       └── tools/
│           ├── list-entities.ts
│           ├── describe-entity.ts
│           ├── get.ts
│           └── count.ts
│
├── skills/                       # Claude Code skill (manual install)
│   └── civicrm/
│       ├── SKILL.md              # frontmatter + body (workflow + model)
│       ├── INSTALL.md            # how to copy into ~/.claude/skills/
│       ├── CHANGELOG.md          # tracked alongside MCP changes
│       └── examples/
│           ├── active-members.md
│           ├── donations-by-month.md
│           ├── lapsed-members.md
│           └── recent-activity.md
│
├── docs/
│   ├── install-mcp.md            # Claude Desktop config snippet, env vars
│   ├── install-skill.md          # link to skills/civicrm/INSTALL.md
│   └── superpowers/specs/        # design specs (this file)
│
└── test/
    ├── civi/
    │   ├── client.test.ts        # mocked fetch
    │   └── cache.test.ts
    ├── mcp/
    │   └── tools.test.ts         # mocked Civi4Client (via mocked fetch)
    └── integration/
        ├── live.test.ts                # opt-in real Civi
        └── skill-consistency.test.ts   # skill ⇄ MCP tool name parity
```

The `skills/` folder is **excluded** from the npm package via `"files"` in
`package.json`. Skill distribution happens by cloning the repo (or, later, a
marketplace), not via npm install.

## 12. Tooling & hygiene

### 12.1 Strict TypeScript

`tsconfig.json` enables (per global standards):

- `strict: true`
- `noUncheckedIndexedAccess: true`
- `exactOptionalPropertyTypes: true`
- `noImplicitOverride: true`
- `noPropertyAccessFromIndexSignature: true`
- `verbatimModuleSyntax: true`
- `isolatedModules: true`
- `module: "NodeNext"`, `target: "ES2024"`

### 12.2 Pre-commit pipeline (`.pre-commit-config.yaml`)

Standard hygiene suite + project tooling + commit-msg validation + markdown:

```yaml
- repo: https://github.com/pre-commit/pre-commit-hooks
  rev: v6.0.0
  hooks:
    - id: trailing-whitespace
    - id: end-of-file-fixer
    - id: check-added-large-files
    - id: check-json
    - id: check-yaml
    - id: check-merge-conflict
    - id: mixed-line-ending
      args: ["--fix=lf"]

- repo: https://github.com/compilerla/conventional-pre-commit
  rev: v4.4.0
  hooks:
    - id: conventional-pre-commit
      stages: [commit-msg]

- repo: https://github.com/DavidAnson/markdownlint-cli2
  rev: v0.18.1   # lookup latest at scaffold time
  hooks:
    - id: markdownlint-cli2

- repo: local
  hooks:
    - id: oxfmt
      name: oxfmt --check
      entry: pnpm oxfmt --check
      language: system
      types_or: [ts, tsx, javascript, jsx]
    - id: oxlint
      name: oxlint
      entry: pnpm oxlint
      language: system
      types_or: [ts, tsx, javascript, jsx]
    - id: tsc
      name: tsc --noEmit
      entry: pnpm tsc --noEmit
      language: system
      pass_filenames: false
    - id: vitest
      name: vitest (unit + component)
      entry: pnpm vitest run
      language: system
      pass_filenames: false
```

Versions are pinned but should be refreshed to current stable when
scaffolding; never assume from memory.

### 12.3 Commit conventions

- Conventional Commits enforced on `commit-msg` stage.
- Imperative mood, ≤ 72 char subject.
- One logical change per commit.
- Feature branches only — never commit directly to `main`.

### 12.4 CI (later)

GitHub Actions workflow runs the same pipeline plus:

- `pnpm audit --audit-level=moderate`
- `actionlint` and `zizmor` on workflow files
- Actions pinned to SHA hashes with version comments

## 13. Phase 2 / Phase 3 roadmap

Captured as guardrails so the Phase 1 design stays compatible — **not part of
the Phase 1 build**.

### Phase 2 — org rollout

- Write tools: `civicrm_create`, `civicrm_update`, `civicrm_delete`,
  `civicrm_call`. Each has a `dryRun` arg. Env var `CIVI_WRITE_MODE = off |
  dryRun | on`.
- `pnpm generate-tools` CLI: uses `Civi4Client.getFields` to emit typed
  dedicated tools under `src/mcp/tools/dedicated/<Entity>.ts`. Opt-in via
  `CIVI_MCP_DEDICATED_TOOLS=Membership,Contribution`.
- Optional on-disk describe cache under `$XDG_CACHE_HOME/civicrm-mcp/<site-hash>/`.

### Phase 3 — public release

- HTTP/SSE transport (`StreamableHTTPServerTransport`). Per-request
  authentication via `Authorization: Bearer <civi-api-key>` header — the server
  holds no credentials.
- APIv3 fallback module for entities not yet on v4.
- `civicrm_health` tool reporting server/version/auth status.
- npm publish; optional `npx civicrm-mcp init` for first-time setup.

## 14. Success criteria (Phase 1)

The Phase 1 build is complete when:

1. From Claude Desktop, natural-language queries against the configured Civi
   correctly answer the following without code changes per question:
   - "How many members have pending contributions?"
   - "How many life members signed up since 1 January?"
   - "List the 10 contacts most recently added to group X."
   - "What was the total of all completed contributions in May?"
2. The agent uses pseudo-constant names (`status_id:name = "Current"`) rather
   than guessing numeric ids.
3. Custom fields are discoverable via `describe_entity` and queryable via
   `civicrm_get` / `civicrm_count`.
4. All three test layers pass; integration tests pass against the real Civi.
5. The `skills/civicrm` skill is installable via the documented one-line
   copy, is discovered by Claude Code (`/skills` lists it), and noticeably
   improves the agent's behaviour on the four example queries above (fewer
   roundtrips, correct pseudo-constant usage from the first call).
6. The skill-consistency test passes — every MCP tool name referenced in the
   skill exists in the registered tool list.
7. A second user can run the package with only a `CIVI_BASE_URL` and
   `CIVI_API_KEY` — no code changes.
8. Zero warnings from `oxlint`, `oxfmt`, `tsc --noEmit`; all pre-commit hooks
   green.

## 15. Known risks & open considerations

- **Tool description size.** `civicrm_describe_entity`'s output can be large
  for entities with many custom fields (Contact especially). If LLM context
  pressure becomes an issue, add a `fields` filter arg to scope the response.
- **Pseudo-constant payload.** Some pseudo-constants enumerate large value
  lists (e.g., country codes). We may need to elide values past a threshold
  and tell the LLM how to fetch the full list via `civicrm_get` on the lookup
  entity.
- **Where-clause typing.** APIv4 accepts heterogeneous value types (strings,
  numbers, booleans, arrays for IN clauses). The zod schema uses
  `z.unknown()` for the value slot; we may tighten this to a union later
  once usage patterns settle.
- **Date timezone handling.** APIv4 dates are typically site-local. Document
  this in `queryHints` so the LLM knows to ask the user if a question is
  timezone-sensitive.

## 16. Document status

This spec is the agreed Phase 1 contract. Changes after acceptance go through
the same brainstorming flow and produce a new dated spec or an addendum.
