# `civicrm-mcp` Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript MCP server that exposes four generic tools
(`civicrm_list_entities`, `civicrm_describe_entity`, `civicrm_get`,
`civicrm_count`) over CiviCRM's APIv4, plus a companion Claude Code skill
with workflow heuristics and worked examples.

**Architecture:** Three units. (1) `Civi4Client` is a typed APIv4 wrapper
with an in-memory introspection cache and `authx` Bearer auth — reusable
as a standalone library. (2) The MCP layer registers four zod-validated
tools over the client. (3) The CLI bootstrap wires env → config → client →
server → stdio transport. Tested via mocked-`fetch` component tests plus
an env-gated integration test against a real CiviCRM site.

**Tech Stack:** Node 22 LTS, ESM only, TypeScript 5.5+ (strict),
`@modelcontextprotocol/sdk` 1.x, `zod` 3.23+, `pino` 9.x, `vitest` 2.x,
`oxlint`, `oxfmt`, `prek`. Package manager: `pnpm` 9.x.

**Source of truth:** `docs/superpowers/specs/2026-06-10-civicrm-mcp-server-design.md`.

---

## Domain context map

Three bounded contexts, two seams. Naming and folder structure follow this
map so DDD vocabulary lines up with the codebase.

```text
   ┌─────────────────────────────┐     ubiquitous language:
   │   Agent / Skill context     │     "member", "donor", "active",
   │   (skills/civicrm/, prompts)│     "lapsed", domain shorthand
   └──────────────┬──────────────┘
                  │  Customer-Supplier (skill consumes MCP)
   ┌──────────────▼──────────────┐     ubiquitous language:
   │   MCP context               │     Tool, ToolResult, WhereClause,
   │   (src/mcp/)                │     FieldClause, LogicalClause
   └──────────────┬──────────────┘
                  │  Anti-Corruption Layer (Civi4Client)
   ┌──────────────▼──────────────┐     ubiquitous language:
   │   Civi domain context       │     Entity, Field, Pseudoconstant,
   │   (src/civi/)               │     EntityDescribe, EntitySummary
   └──────────────┬──────────────┘     (mirrors APIv4's vocabulary
                  │                     verbatim — see Civi docs)
                  ▼
              CiviCRM APIv4
              (upstream supplier;
              we do not own its model)
```

### Roles

- **Civi domain context (`src/civi/`):** owns the typed model that mirrors
  CiviCRM's APIv4 vocabulary (`Entity.get`, `getFields`, `getActions`,
  `pseudoconstant`). All types here are **value objects** — immutable,
  identity-by-value, expressed as `readonly` TypeScript types. We do *not*
  model CiviCRM's runtime entities (Contact, Membership) ourselves — Civi
  owns them; we pass-through.

- **`Civi4Client` is the Anti-Corruption Layer.** It translates APIv4's
  wire format (snake_case keys, `is_error` envelope, `data_type` strings,
  `options[]` arrays, `suffixes[]`) into the typed value objects of our
  domain (`Field`, `Pseudoconstant`, `EntityDescribe`). Every wire-shape
  quirk dies at this boundary. The MCP layer never sees raw APIv4 JSON.

- **MCP context (`src/mcp/`):** the agent-facing language. Tools, zod
  schemas, `ToolResult`. Knows nothing about HTTP, authx, or APIv4
  response envelopes. Consumes `Civi4Client` as a generic repository.

- **Agent / skill context (`skills/civicrm/`):** the domain vocabulary
  end-users speak — "active member", "lapsed", "donor". The skill is the
  glossary translating their language to MCP tool calls. The
  skill-consistency test (Task 26) keeps this seam from drifting.

### DDD building blocks in this project

| Pattern | Where |
|---|---|
| **Value Object** | `Field`, `Pseudoconstant`, `PseudoconstantValue`, `EntityDescribe`, `EntitySummary`, `WhereClause`, `FieldClause`, `LogicalClause`, `GetParams`, `ApiKey` |
| **Generic Repository** | `Civi4Client` — `listEntities` / `describe` / `get` / `count` parameterised by entity name |
| **Anti-Corruption Layer** | `Civi4Client.describe` (specifically `mapField`/`mapDescribe`) |
| **Ubiquitous Language** | Field names mirror APIv4 keys 1:1 (`pseudoconstant`, `fkEntity`, `customGroup`). Skill prose uses CiviCRM domain terms verbatim. |
| **Customer-Supplier** | CiviCRM (upstream) → our MCP server (downstream). One-way; we adapt to their schema, never vice-versa. |

We deliberately have **no Aggregates** and **no Entities** in our code —
CiviCRM owns its entity model. Trying to mirror it in our types would
duplicate Civi's schema and break for any extension we don't know about.
The generic-repository shape is what lets the design work against
arbitrary Civi installs.

---

## File structure (planned)

```text
civi-mcp-server/
├── package.json
├── tsconfig.json
├── pnpm-lock.yaml
├── .oxlintrc.json
├── .oxfmt.toml
├── .pre-commit-config.yaml
├── .markdownlint.jsonc
├── vitest.config.ts
├── README.md
│
├── src/
│   ├── cli.ts                          # entry point
│   ├── config.ts                       # zod env parser → Config
│   ├── logging.ts                      # pino → stderr
│   ├── civi/
│   │   ├── index.ts                    # public exports
│   │   ├── types.ts                    # ApiKey, EntitySummary, ...
│   │   ├── errors.ts                   # CiviError hierarchy
│   │   ├── http.ts                     # fetch wrapper
│   │   ├── cache.ts                    # PromiseCache<K,V>
│   │   └── client.ts                   # Civi4Client
│   └── mcp/
│       ├── index.ts                    # buildServer(client) → McpServer
│       ├── server.ts                   # registers tools
│       └── tools/
│           ├── where-schema.ts         # shared WhereClauseSchema
│           ├── list-entities.ts
│           ├── describe-entity.ts
│           ├── get.ts
│           └── count.ts
│
├── test/
│   ├── helpers/
│   │   ├── mock-fetch.ts               # build a `fetch` stub
│   │   └── fixtures/                   # captured APIv4 payloads (anonymised)
│   │       ├── entity-get.json
│   │       ├── membership-getFields.json
│   │       └── ...
│   ├── config.test.ts
│   ├── civi/
│   │   ├── errors.test.ts
│   │   ├── cache.test.ts
│   │   ├── http.test.ts
│   │   └── client.test.ts
│   ├── mcp/
│   │   ├── list-entities.test.ts
│   │   ├── describe-entity.test.ts
│   │   ├── get.test.ts
│   │   └── count.test.ts
│   └── integration/
│       ├── live.test.ts                # env-gated against real Civi
│       └── skill-consistency.test.ts   # parses SKILL.md, checks tool names
│
├── skills/
│   └── civicrm/
│       ├── SKILL.md
│       ├── INSTALL.md
│       ├── CHANGELOG.md
│       └── examples/
│           ├── active-members.md
│           ├── donations-by-month.md
│           ├── lapsed-members.md
│           └── recent-activity.md
│
└── docs/
    ├── install-mcp.md
    ├── install-skill.md
    └── superpowers/
        ├── specs/2026-06-10-civicrm-mcp-server-design.md
        └── plans/2026-06-11-civicrm-mcp-phase-1.md   ← this file
```

---

## Conventions used throughout this plan

- **Branch:** All work happens on the existing feature branch
  `docs/civicrm-mcp-design-spec` (rename later via merge to `main`). Never
  commit to `main`. If on `main`, run `git checkout -b feat/<task-slug>`
  first.
- **Conventional Commits** on every commit (`feat:`, `fix:`, `test:`,
  `chore:`, `docs:`, `refactor:`).
- **TDD:** failing test first, run to confirm fails, minimal implementation,
  run to confirm passes, commit.
- **Exact commands:** Where a command differs across shells, the plan
  assumes `zsh` on macOS as in the user's environment.
- **Imports:** All imports are absolute, ESM-style with `.js` extension on
  intra-project imports (TypeScript ESM convention). Example:
  `import { Civi4Client } from "../civi/client.js";` — the `.js` is correct
  even though the source is `.ts`. This is a Node-ESM idiom.
- **Strict TS:** every new file is written assuming `noUncheckedIndexedAccess`
  and `exactOptionalPropertyTypes`. If a code block in this plan looks
  unusually verbose (explicit `undefined`, narrowing, `??`), that's why.

---

## Phase A — Repo scaffolding

### Task 1: package.json, tsconfig, lint/format configs

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.oxlintrc.json`
- Create: `.oxfmt.toml`
- Create: `.markdownlint.jsonc`

- [ ] **Step 1: Check current branch**

```bash
git branch --show-current
```

Expected: `docs/civicrm-mcp-design-spec` (or you start a new branch off it
with `git checkout -b feat/scaffolding`). If `main`, STOP and branch first.

- [ ] **Step 2: Write `package.json`**

Look up latest stable versions before writing (`npm view <pkg> version`).
The versions below are minimums known to work; refresh them.

```jsonc
{
  "name": "civicrm-mcp",
  "version": "0.1.0",
  "description": "Model Context Protocol server for CiviCRM (APIv4).",
  "type": "module",
  "license": "MIT",
  "engines": { "node": ">=22.0.0" },
  "packageManager": "pnpm@9.12.0",
  "bin": { "civicrm-mcp": "./dist/cli.js" },
  "files": ["dist", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "dev": "tsx watch src/cli.ts",
    "start": "node dist/cli.js",
    "lint": "oxlint",
    "format": "oxfmt",
    "format:check": "oxfmt --check",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "CIVI_INTEGRATION=1 vitest run test/integration",
    "verify": "pnpm format:check && pnpm lint && pnpm typecheck && pnpm test"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "pino": "^9.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "oxfmt": "^0.1.0",
    "oxlint": "^0.15.0",
    "tsx": "^4.19.0",
    "typescript": "^5.5.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 3: Write `tsconfig.json`**

```jsonc
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2024"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*", "test/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Write `tsconfig.build.json`**

```jsonc
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": false },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test/**/*", "**/*.test.ts"]
}
```

- [ ] **Step 5: Write `.oxlintrc.json`**

```jsonc
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["typescript", "import", "unicorn", "node"],
  "categories": { "correctness": "error", "suspicious": "error", "perf": "warn", "style": "off" },
  "rules": {
    "no-console": "error",
    "no-debugger": "error"
  },
  "env": { "node": true, "es2024": true },
  "ignorePatterns": ["dist", "node_modules"]
}
```

- [ ] **Step 6: Write `.oxfmt.toml`**

```toml
[format]
line-width = 100
indent-width = 2
quote-style = "double"
trailing-comma = "all"
semicolons = true
```

- [ ] **Step 7: Write `.markdownlint.jsonc`**

```jsonc
{
  "default": true,
  "MD013": { "line_length": 100, "tables": false, "code_blocks": false },
  "MD024": { "siblings_only": true },
  "MD033": false,
  "MD041": false
}
```

- [ ] **Step 8: Install dependencies**

```bash
corepack enable pnpm
pnpm install
```

Expected: `pnpm-lock.yaml` created, no audit errors.

- [ ] **Step 9: Verify typecheck on empty source**

```bash
mkdir -p src
echo "export {};" > src/cli.ts
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json tsconfig.build.json \
        .oxlintrc.json .oxfmt.toml .markdownlint.jsonc src/cli.ts
git commit -m "chore: scaffold package.json, tsconfig and lint/format configs"
```

---

### Task 2: Pre-commit hooks

**Files:**
- Create: `.pre-commit-config.yaml`

- [ ] **Step 1: Look up current rev tags**

```bash
# Look up latest releases — never assume from memory
gh api repos/pre-commit/pre-commit-hooks/releases/latest --jq .tag_name
gh api repos/compilerla/conventional-pre-commit/releases/latest --jq .tag_name
gh api repos/DavidAnson/markdownlint-cli2/releases/latest --jq .tag_name
```

Use the printed tags in Step 2. If `gh` is unavailable, browse each repo
in a web browser.

- [ ] **Step 2: Write `.pre-commit-config.yaml`**

Replace `<latest>` placeholders with tags from Step 1.

```yaml
default_install_hook_types: [pre-commit, commit-msg]

repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: <latest>
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
    rev: <latest>
    hooks:
      - id: conventional-pre-commit
        stages: [commit-msg]

  - repo: https://github.com/DavidAnson/markdownlint-cli2
    rev: <latest>
    hooks:
      - id: markdownlint-cli2

  - repo: local
    hooks:
      - id: oxfmt
        name: oxfmt --check
        entry: pnpm oxfmt --check
        language: system
        types_or: [ts, tsx, javascript, jsx]
        pass_filenames: false
      - id: oxlint
        name: oxlint
        entry: pnpm oxlint
        language: system
        types_or: [ts, tsx, javascript, jsx]
        pass_filenames: false
      - id: tsc
        name: tsc --noEmit
        entry: pnpm typecheck
        language: system
        pass_filenames: false
      - id: vitest
        name: vitest (unit + component)
        entry: pnpm vitest run --exclude test/integration
        language: system
        pass_filenames: false
```

- [ ] **Step 3: Install hooks via prek**

```bash
prek install --hook-type pre-commit --hook-type commit-msg
prek run --all-files
```

Expected: hooks pass. If any standard-suite hook reformats a file, stage
the result.

- [ ] **Step 4: Commit**

```bash
git add .pre-commit-config.yaml
git commit -m "chore: add prek/pre-commit hooks with conventional commits and markdownlint"
```

---

### Task 3: vitest setup + sanity test

**Files:**
- Create: `vitest.config.ts`
- Create: `test/sanity.test.ts`

- [ ] **Step 1: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["test/integration/**", "node_modules", "dist"],
    environment: "node",
    clearMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/index.ts", "src/cli.ts"],
    },
  },
});
```

- [ ] **Step 2: Write a sanity test**

```ts
// test/sanity.test.ts
import { describe, expect, it } from "vitest";

describe("sanity", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
pnpm test
```

Expected: 1 passing test.

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts test/sanity.test.ts
git commit -m "test: configure vitest with a sanity test"
```

---

## Phase B — Foundation: config, types, errors

### Task 4: Config module (env → typed Config via zod)

**Files:**
- Create: `src/config.ts`
- Test: `test/config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/config.test.ts
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("parses required env vars", () => {
    const cfg = loadConfig({
      CIVI_BASE_URL: "https://civi.example.org",
      CIVI_API_KEY: "secret-key",
    });
    expect(cfg.baseUrl.toString()).toBe("https://civi.example.org/");
    expect(cfg.apiKey).toBe("secret-key");
    expect(cfg.authxPath).toBe("/civicrm/authx/api4");
    expect(cfg.timeoutMs).toBe(30_000);
    expect(cfg.logLevel).toBe("error");
  });

  it("rejects missing required vars with a clear message", () => {
    expect(() => loadConfig({})).toThrow(/CIVI_BASE_URL/);
  });

  it("rejects malformed URL", () => {
    expect(() =>
      loadConfig({ CIVI_BASE_URL: "not a url", CIVI_API_KEY: "x" }),
    ).toThrow(/CIVI_BASE_URL/);
  });

  it("accepts overrides for optional vars", () => {
    const cfg = loadConfig({
      CIVI_BASE_URL: "https://civi.example.org",
      CIVI_API_KEY: "secret",
      CIVI_AUTHX_PATH: "/civicrm/ajax/api4",
      CIVI_TIMEOUT_MS: "60000",
      CIVI_LOG_LEVEL: "debug",
    });
    expect(cfg.authxPath).toBe("/civicrm/ajax/api4");
    expect(cfg.timeoutMs).toBe(60_000);
    expect(cfg.logLevel).toBe("debug");
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm vitest run test/config.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement `src/config.ts`**

```ts
import { z } from "zod";

const LogLevel = z.enum(["error", "warn", "info", "debug"]);

const EnvSchema = z.object({
  CIVI_BASE_URL: z
    .string({ message: "CIVI_BASE_URL is required" })
    .url({ message: "CIVI_BASE_URL must be a valid URL" }),
  CIVI_API_KEY: z
    .string({ message: "CIVI_API_KEY is required" })
    .min(1, "CIVI_API_KEY must not be empty"),
  CIVI_AUTHX_PATH: z.string().default("/civicrm/authx/api4"),
  CIVI_TIMEOUT_MS: z
    .string()
    .default("30000")
    .transform((s, ctx) => {
      const n = Number.parseInt(s, 10);
      if (!Number.isFinite(n) || n <= 0) {
        ctx.addIssue({ code: "custom", message: "CIVI_TIMEOUT_MS must be a positive integer" });
        return z.NEVER;
      }
      return n;
    }),
  CIVI_LOG_LEVEL: LogLevel.default("error"),
});

export type Config = {
  baseUrl: URL;
  apiKey: string;
  authxPath: string;
  timeoutMs: number;
  logLevel: z.infer<typeof LogLevel>;
};

export const loadConfig = (env: Record<string, string | undefined>): Config => {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((i) => `${i.path.join(".") || "env"}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid configuration — ${message}`);
  }
  return {
    baseUrl: new URL(parsed.data.CIVI_BASE_URL),
    apiKey: parsed.data.CIVI_API_KEY,
    authxPath: parsed.data.CIVI_AUTHX_PATH,
    timeoutMs: parsed.data.CIVI_TIMEOUT_MS,
    logLevel: parsed.data.CIVI_LOG_LEVEL,
  };
};
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm vitest run test/config.test.ts
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts test/config.test.ts
git commit -m "feat(config): parse and validate environment with zod"
```

---

### Task 5: Civi types

**Files:**
- Create: `src/civi/types.ts`

(No direct test — these are type declarations exercised by later tests.)

- [ ] **Step 1: Write `src/civi/types.ts`**

```ts
/**
 * Value objects of the Civi domain context.
 *
 * Every type in this file is an immutable value object: equality is by
 * attribute, not identity. Field names mirror CiviCRM APIv4's vocabulary
 * (pseudoconstant, fkEntity, customGroup) to keep the ubiquitous language
 * intact across the anti-corruption layer in `client.ts`.
 */

/**
 * Branded API key — prevents accidental interpolation into URLs/logs.
 * At runtime it's still a string; the brand exists only in the type system.
 * Modeled structurally rather than as a class to keep zero runtime cost
 * (the value is passed to fetch headers as-is).
 */
export type ApiKey = string & { readonly __brand: "ApiKey" };
export const asApiKey = (s: string): ApiKey => s as ApiKey;

export type LogicalOp = "AND" | "OR" | "NOT";

export type FieldClause = readonly [field: string, op: string, value: unknown];

export type LogicalClause = readonly [op: LogicalOp, clauses: readonly WhereClause[]];

export type WhereClause = FieldClause | LogicalClause;

export type OrderDirection = "ASC" | "DESC";

export type GetParams = {
  where?: readonly WhereClause[];
  select?: readonly string[];
  orderBy?: Readonly<Record<string, OrderDirection>>;
  limit?: number;
  offset?: number;
  groupBy?: readonly string[];
};

export type EntitySummary = {
  name: string;
  title: string;
  description: string;
  abstract?: boolean;
};

export type PseudoconstantValue = {
  id: string | number;
  name: string;
  label: string;
};

export type Pseudoconstant = {
  queryByName: string;       // e.g. "status_id:name"
  queryByLabel: string;      // e.g. "status_id:label"
  values: readonly PseudoconstantValue[];
};

export type CustomFieldRef = {
  groupName: string;
  fieldName: string;
};

export type Field = {
  name: string;
  type: string;
  title?: string;
  description?: string;
  required: boolean;
  fkEntity?: string;
  pseudoconstant?: Pseudoconstant;
  custom?: CustomFieldRef;
};

export type EntityDescribe = {
  entity: string;
  description: string;
  actions: readonly string[];
  primaryKey: readonly string[];
  fields: readonly Field[];
  queryHints: readonly string[];
};

export type ApiV4Envelope<T> = {
  values: readonly T[];
  count?: number;
  is_error?: 0;
};

export type ApiV4ErrorEnvelope = {
  is_error: 1;
  error_message: string;
  error_code?: string;
};
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/civi/types.ts
git commit -m "feat(civi): add typed model for entities, fields and clauses"
```

---

### Task 6: Civi errors

**Files:**
- Create: `src/civi/errors.ts`
- Test: `test/civi/errors.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// test/civi/errors.test.ts
import { describe, expect, it } from "vitest";
import {
  CiviError,
  CiviAuthError,
  CiviApiError,
  CiviTransportError,
} from "../../src/civi/errors.js";

describe("CiviError hierarchy", () => {
  it("CiviAuthError carries status and message", () => {
    const e = new CiviAuthError("invalid bearer", { status: 401 });
    expect(e).toBeInstanceOf(CiviError);
    expect(e.name).toBe("CiviAuthError");
    expect(e.status).toBe(401);
  });

  it("CiviApiError carries entity, action, and Civi error code", () => {
    const e = new CiviApiError("unknown field 'foo'", {
      entity: "Contact",
      action: "get",
      errorCode: "unknown_field",
    });
    expect(e.entity).toBe("Contact");
    expect(e.action).toBe("get");
    expect(e.errorCode).toBe("unknown_field");
  });

  it("CiviTransportError captures cause", () => {
    const cause = new Error("ECONNREFUSED");
    const e = new CiviTransportError("network failure", { cause });
    expect(e.cause).toBe(cause);
  });

  it("each subclass is distinguishable via instanceof", () => {
    const a = new CiviAuthError("a");
    const b = new CiviApiError("b", { entity: "X", action: "get" });
    expect(a).toBeInstanceOf(CiviAuthError);
    expect(a).not.toBeInstanceOf(CiviApiError);
    expect(b).toBeInstanceOf(CiviApiError);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm vitest run test/civi/errors.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/civi/errors.ts`**

```ts
export class CiviError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CiviError";
  }
}

export class CiviAuthError extends CiviError {
  readonly status?: number;
  constructor(message: string, options?: { status?: number; cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = "CiviAuthError";
    this.status = options?.status;
  }
}

export class CiviApiError extends CiviError {
  readonly entity: string;
  readonly action: string;
  readonly errorCode?: string;
  constructor(
    message: string,
    options: { entity: string; action: string; errorCode?: string; cause?: unknown },
  ) {
    super(message, { cause: options.cause });
    this.name = "CiviApiError";
    this.entity = options.entity;
    this.action = options.action;
    this.errorCode = options.errorCode;
  }
}

export class CiviTransportError extends CiviError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = "CiviTransportError";
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm vitest run test/civi/errors.test.ts
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/civi/errors.ts test/civi/errors.test.ts
git commit -m "feat(civi): typed error hierarchy for auth, api and transport"
```

---

## Phase C — HTTP + cache

### Task 7: Civi HTTP wrapper

**Files:**
- Create: `src/civi/http.ts`
- Test: `test/civi/http.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// test/civi/http.test.ts
import { describe, expect, it, vi } from "vitest";
import { postJson } from "../../src/civi/http.js";
import { CiviAuthError, CiviApiError, CiviTransportError } from "../../src/civi/errors.js";

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

describe("postJson", () => {
  it("issues a POST with Bearer auth and JSON body, returns parsed JSON", async () => {
    const fetcher = vi.fn(async () => ok({ values: [{ id: 1 }], count: 1 }));
    const result = await postJson({
      url: new URL("https://civi.example.org/civicrm/authx/api4/Contact/get"),
      apiKey: "test-key",
      body: { params: { limit: 1 } },
      timeoutMs: 1000,
      fetcher,
    });
    expect(result).toEqual({ values: [{ id: 1 }], count: 1 });
    const [calledUrl, init] = fetcher.mock.calls[0]!;
    expect(calledUrl.toString()).toMatch(/Contact\/get$/);
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer test-key");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["X-Requested-With"]).toBe("XMLHttpRequest");
    expect(JSON.parse(init?.body as string)).toEqual({ params: { limit: 1 } });
  });

  it("throws CiviAuthError on 401", async () => {
    const fetcher = vi.fn(async () => new Response("unauthorised", { status: 401 }));
    await expect(
      postJson({
        url: new URL("https://civi.example.org/p"),
        apiKey: "k",
        body: {},
        timeoutMs: 1000,
        fetcher,
      }),
    ).rejects.toBeInstanceOf(CiviAuthError);
  });

  it("throws CiviApiError when payload is_error=1", async () => {
    const fetcher = vi.fn(async () =>
      ok({ is_error: 1, error_message: "unknown field 'foo'", error_code: "unknown_field" }),
    );
    const promise = postJson({
      url: new URL("https://civi.example.org/civicrm/authx/api4/Contact/get"),
      apiKey: "k",
      body: {},
      timeoutMs: 1000,
      fetcher,
      entity: "Contact",
      action: "get",
    });
    await expect(promise).rejects.toBeInstanceOf(CiviApiError);
    await expect(promise).rejects.toMatchObject({ entity: "Contact", action: "get" });
  });

  it("throws CiviTransportError on fetch failure", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(
      postJson({
        url: new URL("https://civi.example.org/p"),
        apiKey: "k",
        body: {},
        timeoutMs: 1000,
        fetcher,
      }),
    ).rejects.toBeInstanceOf(CiviTransportError);
  });

  it("aborts on timeout", async () => {
    const fetcher = vi.fn(
      (_url: URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    await expect(
      postJson({
        url: new URL("https://civi.example.org/p"),
        apiKey: "k",
        body: {},
        timeoutMs: 5,
        fetcher,
      }),
    ).rejects.toBeInstanceOf(CiviTransportError);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm vitest run test/civi/http.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/civi/http.ts`**

```ts
import { CiviApiError, CiviAuthError, CiviTransportError } from "./errors.js";

export type PostJsonInput = {
  url: URL;
  apiKey: string;
  body: unknown;
  timeoutMs: number;
  fetcher?: typeof fetch;
  entity?: string;   // for CiviApiError context
  action?: string;
};

export const postJson = async <T>(input: PostJsonInput): Promise<T> => {
  const { url, apiKey, body, timeoutMs, entity, action } = input;
  const fetcher = input.fetcher ?? fetch;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (cause) {
    clearTimeout(timer);
    throw new CiviTransportError(
      cause instanceof Error ? `HTTP request failed: ${cause.message}` : "HTTP request failed",
      { cause },
    );
  }
  clearTimeout(timer);

  if (response.status === 401 || response.status === 403) {
    throw new CiviAuthError(
      `Authentication failed (${response.status})`,
      { status: response.status },
    );
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (cause) {
    throw new CiviTransportError("Response was not valid JSON", { cause });
  }

  if (parsed !== null && typeof parsed === "object" && "is_error" in parsed && (parsed as { is_error: number }).is_error === 1) {
    const errBody = parsed as { error_message?: string; error_code?: string };
    throw new CiviApiError(errBody.error_message ?? "APIv4 returned an error", {
      entity: entity ?? "unknown",
      action: action ?? "unknown",
      errorCode: errBody.error_code,
    });
  }

  if (!response.ok) {
    throw new CiviTransportError(`HTTP ${response.status}: ${response.statusText}`);
  }

  return parsed as T;
};
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm vitest run test/civi/http.test.ts
```

Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add src/civi/http.ts test/civi/http.test.ts
git commit -m "feat(civi): typed POST helper with Bearer auth, timeout and error mapping"
```

---

### Task 8: Promise cache

**Files:**
- Create: `src/civi/cache.ts`
- Test: `test/civi/cache.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// test/civi/cache.test.ts
import { describe, expect, it, vi } from "vitest";
import { PromiseCache } from "../../src/civi/cache.js";

describe("PromiseCache", () => {
  it("calls the loader once for the same key, deduplicating in-flight calls", async () => {
    const cache = new PromiseCache<string, number>();
    const loader = vi.fn(async () => 42);
    const [a, b] = await Promise.all([cache.getOrLoad("k", loader), cache.getOrLoad("k", loader)]);
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("re-uses cached resolved value", async () => {
    const cache = new PromiseCache<string, number>();
    const loader = vi.fn(async () => 1);
    await cache.getOrLoad("x", loader);
    await cache.getOrLoad("x", loader);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("evicts a rejected promise so the next call retries", async () => {
    const cache = new PromiseCache<string, number>();
    const loader = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce(7);
    await expect(cache.getOrLoad("k", loader)).rejects.toThrow("transient");
    await expect(cache.getOrLoad("k", loader)).resolves.toBe(7);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("invalidate() forces a fresh load", async () => {
    const cache = new PromiseCache<string, number>();
    const loader = vi.fn<() => Promise<number>>().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    expect(await cache.getOrLoad("k", loader)).toBe(1);
    cache.invalidate("k");
    expect(await cache.getOrLoad("k", loader)).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm vitest run test/civi/cache.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/civi/cache.ts`**

```ts
export class PromiseCache<K, V> {
  readonly #map = new Map<K, Promise<V>>();

  async getOrLoad(key: K, loader: () => Promise<V>): Promise<V> {
    const existing = this.#map.get(key);
    if (existing !== undefined) return existing;
    const p = loader();
    this.#map.set(key, p);
    try {
      return await p;
    } catch (err) {
      // Don't cache failures — let the next call retry.
      if (this.#map.get(key) === p) this.#map.delete(key);
      throw err;
    }
  }

  invalidate(key: K): void {
    this.#map.delete(key);
  }

  clear(): void {
    this.#map.clear();
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm vitest run test/civi/cache.test.ts
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/civi/cache.ts test/civi/cache.test.ts
git commit -m "feat(civi): promise cache with single-flight and failure eviction"
```

---

## Phase D — Civi4Client methods

### Task 9: Civi4Client + listEntities

**Files:**
- Create: `src/civi/client.ts`
- Create: `src/civi/index.ts`
- Test: `test/civi/client.test.ts`
- Test: `test/helpers/mock-fetch.ts`

- [ ] **Step 1: Write the test helper**

```ts
// test/helpers/mock-fetch.ts
import { vi } from "vitest";

export type RouteMap = Record<string, unknown>;  // "Entity/action" → response body

export const mockFetch = (routes: RouteMap) =>
  vi.fn(async (input: URL | string) => {
    const url = typeof input === "string" ? new URL(input) : input;
    const match = url.pathname.match(/\/api4\/([^/]+)\/([^/]+)$/);
    if (!match) throw new Error(`mockFetch: unrecognised URL ${url.toString()}`);
    const key = `${match[1]}/${match[2]}`;
    const body = routes[key];
    if (body === undefined) throw new Error(`mockFetch: no route for ${key}`);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
```

- [ ] **Step 2: Write failing tests for `listEntities`**

```ts
// test/civi/client.test.ts
import { describe, expect, it } from "vitest";
import { Civi4Client } from "../../src/civi/client.js";
import { asApiKey } from "../../src/civi/types.js";
import { mockFetch } from "../helpers/mock-fetch.js";

const baseUrl = new URL("https://civi.example.org");

describe("Civi4Client.listEntities", () => {
  it("returns mapped entity summaries", async () => {
    const fetcher = mockFetch({
      "Entity/get": {
        values: [
          { name: "Contact", title: "Contact", description: "A contact", abstract: false },
          { name: "Membership", title: "Membership", description: "A membership", abstract: false },
        ],
      },
    });
    const client = new Civi4Client({
      baseUrl,
      apiKey: asApiKey("k"),
      fetcher,
    });
    const entities = await client.listEntities();
    expect(entities).toHaveLength(2);
    expect(entities[0]?.name).toBe("Contact");
  });

  it("caches the entity list across calls", async () => {
    const fetcher = mockFetch({ "Entity/get": { values: [] } });
    const client = new Civi4Client({ baseUrl, apiKey: asApiKey("k"), fetcher });
    await client.listEntities();
    await client.listEntities();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run test to confirm it fails**

```bash
pnpm vitest run test/civi/client.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement minimal `src/civi/client.ts`**

```ts
/**
 * Civi4Client — the Anti-Corruption Layer between our domain and CiviCRM's
 * APIv4 wire format. Every quirk of the upstream (snake_case keys,
 * is_error envelope, data_type strings, options/suffixes arrays) dies at
 * this boundary; consumers (the MCP tools) see only value objects from
 * `./types.js`.
 *
 * Acts as a generic repository: one method per APIv4 verb, parameterised
 * by entity name. We deliberately do not model CiviCRM's entities
 * (Contact, Membership, Contribution) here — Civi owns its entity model
 * and our job is to pass-through, not duplicate.
 */
import { PromiseCache } from "./cache.js";
import { postJson } from "./http.js";
import type {
  ApiKey,
  ApiV4Envelope,
  EntityDescribe,
  EntitySummary,
  GetParams,
} from "./types.js";

export type Civi4ClientOptions = {
  baseUrl: URL;
  apiKey: ApiKey;
  authxPath?: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
};

const ENTITY_LIST_KEY = "__entities__";

export class Civi4Client {
  readonly #baseUrl: URL;
  readonly #apiKey: ApiKey;
  readonly #authxPath: string;
  readonly #timeoutMs: number;
  readonly #fetcher: typeof fetch;
  readonly #describeCache = new PromiseCache<string, EntityDescribe>();
  readonly #entityListCache = new PromiseCache<string, readonly EntitySummary[]>();

  constructor(options: Civi4ClientOptions) {
    this.#baseUrl = options.baseUrl;
    this.#apiKey = options.apiKey;
    this.#authxPath = options.authxPath ?? "/civicrm/authx/api4";
    this.#timeoutMs = options.timeoutMs ?? 30_000;
    this.#fetcher = options.fetcher ?? fetch;
  }

  async listEntities(): Promise<readonly EntitySummary[]> {
    return this.#entityListCache.getOrLoad(ENTITY_LIST_KEY, async () => {
      const env = await this.#call<ApiV4Envelope<EntitySummary>>("Entity", "get", {});
      return env.values.map((v) => ({
        name: v.name,
        title: v.title,
        description: v.description,
        ...(v.abstract !== undefined ? { abstract: v.abstract } : {}),
      }));
    });
  }

  async #call<T>(entity: string, action: string, params: Record<string, unknown>): Promise<T> {
    const url = new URL(
      `${this.#authxPath.replace(/\/$/, "")}/${entity}/${action}`,
      this.#baseUrl,
    );
    return postJson<T>({
      url,
      apiKey: this.#apiKey,
      body: { params },
      timeoutMs: this.#timeoutMs,
      fetcher: this.#fetcher,
      entity,
      action,
    });
  }
}
```

- [ ] **Step 5: Write `src/civi/index.ts`**

```ts
export { Civi4Client } from "./client.js";
export type { Civi4ClientOptions } from "./client.js";
export * from "./types.js";
export * from "./errors.js";
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
pnpm vitest run test/civi/client.test.ts
```

Expected: 2 passing.

- [ ] **Step 7: Commit**

```bash
git add src/civi/client.ts src/civi/index.ts test/civi/client.test.ts test/helpers/mock-fetch.ts
git commit -m "feat(civi): Civi4Client.listEntities with caching"
```

---

### Task 10: Civi4Client.describe

**Files:**
- Modify: `src/civi/client.ts` — add `describe()`
- Test: `test/civi/client.test.ts` — add describe tests
- Create: `test/helpers/fixtures/membership-getFields.json`
- Create: `test/helpers/fixtures/membership-getActions.json`

- [ ] **Step 1: Capture fixtures (sample only — anonymise as needed)**

Write `test/helpers/fixtures/membership-getFields.json`:

```json
{
  "values": [
    {
      "name": "id",
      "data_type": "Integer",
      "title": "Membership ID",
      "required": true
    },
    {
      "name": "status_id",
      "data_type": "Integer",
      "title": "Status",
      "required": true,
      "fk_entity": "MembershipStatus",
      "options": [
        { "id": 1, "name": "New", "label": "New" },
        { "id": 2, "name": "Current", "label": "Current" }
      ],
      "suffixes": ["name", "label"]
    },
    {
      "name": "start_date",
      "data_type": "Date",
      "title": "Membership Start Date",
      "required": false
    },
    {
      "name": "custom_42",
      "data_type": "String",
      "title": "Renewal source",
      "required": false,
      "custom_field_id": 42,
      "custom_group": { "name": "MembershipDetails", "title": "Membership Details" },
      "custom_field_name": "RenewalSource"
    }
  ]
}
```

Write `test/helpers/fixtures/membership-getActions.json`:

```json
{ "values": [{ "name": "get" }, { "name": "create" }, { "name": "update" }, { "name": "delete" }] }
```

- [ ] **Step 2: Add failing test**

Append to `test/civi/client.test.ts`:

```ts
import membershipFields from "../helpers/fixtures/membership-getFields.json" with { type: "json" };
import membershipActions from "../helpers/fixtures/membership-getActions.json" with { type: "json" };

describe("Civi4Client.describe", () => {
  it("merges getFields + getActions into an EntityDescribe", async () => {
    const fetcher = mockFetch({
      "Membership/getFields": membershipFields,
      "Membership/getActions": membershipActions,
    });
    const client = new Civi4Client({ baseUrl, apiKey: asApiKey("k"), fetcher });
    const d = await client.describe("Membership");

    expect(d.entity).toBe("Membership");
    expect(d.actions).toEqual(["get", "create", "update", "delete"]);
    expect(d.primaryKey).toEqual(["id"]);

    const status = d.fields.find((f) => f.name === "status_id");
    expect(status?.pseudoconstant?.queryByName).toBe("status_id:name");
    expect(status?.pseudoconstant?.values).toContainEqual({ id: 2, name: "Current", label: "Current" });
    expect(status?.fkEntity).toBe("MembershipStatus");

    const custom = d.fields.find((f) => f.name === "custom_42");
    expect(custom?.custom?.groupName).toBe("MembershipDetails");
    expect(custom?.custom?.fieldName).toBe("RenewalSource");

    expect(d.queryHints).toContain("Date format: 'YYYY-MM-DD'");
  });

  it("caches describe results per entity, single-flight on concurrent calls", async () => {
    const fetcher = mockFetch({
      "Membership/getFields": membershipFields,
      "Membership/getActions": membershipActions,
    });
    const client = new Civi4Client({ baseUrl, apiKey: asApiKey("k"), fetcher });
    await Promise.all([client.describe("Membership"), client.describe("Membership")]);
    await client.describe("Membership");
    // Two calls total: one getFields, one getActions
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("refresh=true bypasses the cache", async () => {
    const fetcher = mockFetch({
      "Membership/getFields": membershipFields,
      "Membership/getActions": membershipActions,
    });
    const client = new Civi4Client({ baseUrl, apiKey: asApiKey("k"), fetcher });
    await client.describe("Membership");
    await client.describe("Membership", { refresh: true });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
```

- [ ] **Step 3: Run test to confirm it fails**

```bash
pnpm vitest run test/civi/client.test.ts -t describe
```

Expected: FAIL — `client.describe` not a function.

- [ ] **Step 4: Implement `describe` in `src/civi/client.ts`**

This is where the Anti-Corruption Layer earns its name. `mapField` and
`mapDescribe` translate APIv4's `getFields` response (`data_type`,
`options`, `suffixes`, `custom_group`, `custom_field_name`) into our
domain's `Field` and `Pseudoconstant` value objects. Adding new APIv4
quirks (e.g. a future `enum_values` field) is a one-line change here —
the MCP layer is unaffected.

Add the following inside the `Civi4Client` class (and add `Field`,
`Pseudoconstant` to the imports from `./types.js`):

```ts
async describe(entity: string, opts: { refresh?: boolean } = {}): Promise<EntityDescribe> {
  if (opts.refresh) this.#describeCache.invalidate(entity);
  return this.#describeCache.getOrLoad(entity, async () => {
    const [fieldsEnv, actionsEnv] = await Promise.all([
      this.#call<ApiV4Envelope<RawField>>(entity, "getFields", {}),
      this.#call<ApiV4Envelope<{ name: string }>>(entity, "getActions", {}),
    ]);
    return mapDescribe(entity, fieldsEnv.values, actionsEnv.values.map((a) => a.name));
  });
}
```

Then at the bottom of `src/civi/client.ts` add the field mapping helpers:

```ts
type RawField = {
  name: string;
  data_type: string;
  title?: string;
  description?: string;
  required?: boolean;
  fk_entity?: string;
  options?: ReadonlyArray<{ id: string | number; name: string; label: string }>;
  suffixes?: readonly string[];
  custom_field_id?: number;
  custom_group?: { name: string };
  custom_field_name?: string;
};

const STANDARD_QUERY_HINTS = [
  "Filter by pseudo-constant name: ['status_id:name','=','Current']",
  "Date format: 'YYYY-MM-DD'",
  "Join via dot-notation in select: ['contact_id.display_name']",
  "Logical groups: ['AND', [[...],[...]]]; default top-level is AND",
] as const;

const mapField = (raw: RawField): import("./types.js").Field => {
  const base: import("./types.js").Field = {
    name: raw.name,
    type: raw.data_type,
    required: raw.required === true,
    ...(raw.title !== undefined ? { title: raw.title } : {}),
    ...(raw.description !== undefined ? { description: raw.description } : {}),
    ...(raw.fk_entity !== undefined ? { fkEntity: raw.fk_entity } : {}),
  };
  if (raw.options && raw.options.length > 0) {
    base.pseudoconstant = {
      queryByName: `${raw.name}:name`,
      queryByLabel: `${raw.name}:label`,
      values: raw.options,
    };
  }
  if (raw.custom_group && raw.custom_field_name) {
    base.custom = {
      groupName: raw.custom_group.name,
      fieldName: raw.custom_field_name,
    };
  }
  return base;
};

const mapDescribe = (
  entity: string,
  fields: readonly RawField[],
  actions: readonly string[],
): EntityDescribe => ({
  entity,
  description: "",
  actions,
  primaryKey: ["id"],
  fields: fields.map(mapField),
  queryHints: STANDARD_QUERY_HINTS,
});
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
pnpm vitest run test/civi/client.test.ts
```

Expected: 5 passing total (2 from Task 9, 3 from this task).

- [ ] **Step 6: Commit**

```bash
git add src/civi/client.ts test/civi/client.test.ts test/helpers/fixtures/
git commit -m "feat(civi): Civi4Client.describe with pseudoconstant and custom-field mapping"
```

---

### Task 11: Civi4Client.get

**Files:**
- Modify: `src/civi/client.ts` — add `get()`
- Test: `test/civi/client.test.ts` — add get tests

- [ ] **Step 1: Add failing test**

Append to `test/civi/client.test.ts`:

```ts
describe("Civi4Client.get", () => {
  it("passes where/select/limit through to APIv4 and returns mapped envelope", async () => {
    const fetcher = mockFetch({
      "Contact/get": {
        values: [{ id: 1, display_name: "Alice" }],
        count: 1,
      },
    });
    const client = new Civi4Client({ baseUrl, apiKey: asApiKey("k"), fetcher });
    const result = await client.get<{ id: number; display_name: string }>("Contact", {
      where: [["display_name", "LIKE", "Ali%"]],
      select: ["id", "display_name"],
      limit: 25,
    });
    expect(result.count).toBe(1);
    expect(result.values[0]?.display_name).toBe("Alice");
    const [, init] = fetcher.mock.calls[0]!;
    const body = JSON.parse(init?.body as string) as { params: Record<string, unknown> };
    expect(body.params).toMatchObject({
      where: [["display_name", "LIKE", "Ali%"]],
      select: ["id", "display_name"],
      limit: 25,
    });
  });

  it("does not include undefined params in the request body", async () => {
    const fetcher = mockFetch({ "Contact/get": { values: [], count: 0 } });
    const client = new Civi4Client({ baseUrl, apiKey: asApiKey("k"), fetcher });
    await client.get("Contact", {});
    const body = JSON.parse(fetcher.mock.calls[0]![1]?.body as string) as { params: Record<string, unknown> };
    expect(Object.keys(body.params)).not.toContain("orderBy");
    expect(Object.keys(body.params)).not.toContain("groupBy");
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm vitest run test/civi/client.test.ts -t "Civi4Client.get"
```

Expected: FAIL.

- [ ] **Step 3: Add `get()` to `Civi4Client`**

Add this method to the class in `src/civi/client.ts`:

```ts
async get<T = unknown>(
  entity: string,
  params: GetParams,
): Promise<{ count: number; values: readonly T[] }> {
  const body = stripUndefined({
    where: params.where,
    select: params.select,
    orderBy: params.orderBy,
    limit: params.limit,
    offset: params.offset,
    groupBy: params.groupBy,
  });
  const env = await this.#call<ApiV4Envelope<T>>(entity, "get", body);
  return { count: env.count ?? env.values.length, values: env.values };
}
```

And add a `stripUndefined` helper at module scope:

```ts
const stripUndefined = <T extends Record<string, unknown>>(obj: T): Partial<T> => {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
};
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm vitest run test/civi/client.test.ts
```

Expected: 7 passing total.

- [ ] **Step 5: Commit**

```bash
git add src/civi/client.ts test/civi/client.test.ts
git commit -m "feat(civi): Civi4Client.get with parameter stripping"
```

---

### Task 12: Civi4Client.count

**Files:**
- Modify: `src/civi/client.ts` — add `count()`
- Test: `test/civi/client.test.ts` — add count tests

- [ ] **Step 1: Add failing test**

Append to `test/civi/client.test.ts`:

```ts
describe("Civi4Client.count", () => {
  it("requests select=[row_count] and returns the count", async () => {
    const fetcher = mockFetch({ "Contact/get": { values: [{ row_count: 142 }], count: 142 } });
    const client = new Civi4Client({ baseUrl, apiKey: asApiKey("k"), fetcher });
    const result = await client.count("Contact", [["contact_type", "=", "Individual"]]);
    expect(result.count).toBe(142);
    const body = JSON.parse(fetcher.mock.calls[0]![1]?.body as string) as { params: { select: string[] } };
    expect(body.params.select).toEqual(["row_count"]);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm vitest run test/civi/client.test.ts -t "Civi4Client.count"
```

Expected: FAIL.

- [ ] **Step 3: Add `count()` to `Civi4Client`**

```ts
async count(
  entity: string,
  where: readonly import("./types.js").WhereClause[] = [],
): Promise<{ count: number }> {
  const env = await this.#call<ApiV4Envelope<{ row_count: number }>>(entity, "get", {
    where,
    select: ["row_count"],
  });
  return { count: env.count ?? env.values[0]?.row_count ?? 0 };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm vitest run test/civi/client.test.ts
```

Expected: 8 passing total.

- [ ] **Step 5: Commit**

```bash
git add src/civi/client.ts test/civi/client.test.ts
git commit -m "feat(civi): Civi4Client.count using row_count select"
```

---

## Phase E — MCP layer

### Task 13: where-schema (shared zod schema)

**Files:**
- Create: `src/mcp/tools/where-schema.ts`
- Test: `test/mcp/where-schema.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// test/mcp/where-schema.test.ts
import { describe, expect, it } from "vitest";
import { WhereClauseSchema } from "../../src/mcp/tools/where-schema.js";

describe("WhereClauseSchema", () => {
  it("accepts a field clause", () => {
    expect(WhereClauseSchema.parse(["status_id", "=", 1])).toEqual(["status_id", "=", 1]);
  });

  it("accepts pseudo-constant suffix", () => {
    expect(WhereClauseSchema.parse(["status_id:name", "=", "Current"])).toEqual([
      "status_id:name",
      "=",
      "Current",
    ]);
  });

  it("accepts an AND group", () => {
    const c = ["AND", [["a", "=", 1], ["b", "=", 2]]] as const;
    expect(WhereClauseSchema.parse(c)).toEqual(c);
  });

  it("accepts a nested OR inside AND", () => {
    const c = ["AND", [["a", "=", 1], ["OR", [["b", "=", 2], ["c", "=", 3]]]]] as const;
    expect(WhereClauseSchema.parse(c)).toEqual(c);
  });

  it("rejects malformed clause", () => {
    expect(() => WhereClauseSchema.parse(["AND", "not-an-array"])).toThrow();
    expect(() => WhereClauseSchema.parse(["a"])).toThrow();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm vitest run test/mcp/where-schema.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/mcp/tools/where-schema.ts`**

```ts
import { z } from "zod";

const FieldClauseSchema = z.tuple([z.string(), z.string(), z.unknown()]);

export type WhereClause =
  | z.infer<typeof FieldClauseSchema>
  | readonly ["AND" | "OR" | "NOT", readonly WhereClause[]];

export const WhereClauseSchema: z.ZodType<WhereClause> = z.union([
  FieldClauseSchema,
  z.tuple([
    z.enum(["AND", "OR", "NOT"]),
    z.lazy(() => z.array(WhereClauseSchema)),
  ]),
]);
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm vitest run test/mcp/where-schema.test.ts
```

Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add src/mcp/tools/where-schema.ts test/mcp/where-schema.test.ts
git commit -m "feat(mcp): recursive where-clause zod schema"
```

---

### Task 14: MCP tool — civicrm_list_entities

**Files:**
- Create: `src/mcp/tools/list-entities.ts`
- Test: `test/mcp/list-entities.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// test/mcp/list-entities.test.ts
import { describe, expect, it } from "vitest";
import { listEntitiesTool } from "../../src/mcp/tools/list-entities.js";

const fakeClient = {
  listEntities: async () => [
    { name: "Contact", title: "Contact", description: "A contact" },
    { name: "Membership", title: "Membership", description: "A membership" },
  ],
} as const;

describe("civicrm_list_entities tool", () => {
  it("returns entities serialised as JSON in a text content block", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await listEntitiesTool(fakeClient as any).handler({});
    expect(result.content[0]?.type).toBe("text");
    const parsed = JSON.parse((result.content[0] as { text: string }).text) as Array<{ name: string }>;
    expect(parsed.map((e) => e.name)).toEqual(["Contact", "Membership"]);
  });

  it("declares no input parameters", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = listEntitiesTool(fakeClient as any);
    expect(Object.keys(tool.inputSchema)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm vitest run test/mcp/list-entities.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/mcp/tools/list-entities.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm vitest run test/mcp/list-entities.test.ts
```

Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add src/mcp/tools/list-entities.ts test/mcp/list-entities.test.ts
git commit -m "feat(mcp): civicrm_list_entities tool"
```

---

### Task 15: MCP tool — civicrm_describe_entity

**Files:**
- Create: `src/mcp/tools/describe-entity.ts`
- Test: `test/mcp/describe-entity.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// test/mcp/describe-entity.test.ts
import { describe, expect, it, vi } from "vitest";
import { describeEntityTool } from "../../src/mcp/tools/describe-entity.js";
import type { EntityDescribe } from "../../src/civi/types.js";

const stubDescribe: EntityDescribe = {
  entity: "Membership",
  description: "",
  actions: ["get"],
  primaryKey: ["id"],
  fields: [
    {
      name: "status_id",
      type: "Integer",
      required: true,
      pseudoconstant: {
        queryByName: "status_id:name",
        queryByLabel: "status_id:label",
        values: [{ id: 2, name: "Current", label: "Current" }],
      },
    },
  ],
  queryHints: ["Date format: 'YYYY-MM-DD'"],
};

describe("civicrm_describe_entity tool", () => {
  it("returns describe payload as JSON in a text content block", async () => {
    const describe = vi.fn(async () => stubDescribe);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = describeEntityTool({ describe } as any);
    const out = await tool.handler({ entity: "Membership" });
    expect(describe).toHaveBeenCalledWith("Membership", { refresh: false });
    const parsed = JSON.parse((out.content[0] as { text: string }).text) as EntityDescribe;
    expect(parsed.entity).toBe("Membership");
    expect(parsed.fields[0]?.pseudoconstant?.queryByName).toBe("status_id:name");
  });

  it("forwards refresh=true to the client", async () => {
    const describe = vi.fn(async () => stubDescribe);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = describeEntityTool({ describe } as any);
    await tool.handler({ entity: "Membership", refresh: true });
    expect(describe).toHaveBeenCalledWith("Membership", { refresh: true });
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm vitest run test/mcp/describe-entity.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/mcp/tools/describe-entity.ts`**

```ts
import { z } from "zod";
import type { Civi4Client } from "../../civi/client.js";
import type { ToolResult } from "./list-entities.js";

const InputSchema = {
  entity: z.string().min(1, "entity is required"),
  refresh: z.boolean().default(false),
} as const;

export const describeEntityTool = (client: Civi4Client) => ({
  name: "civicrm_describe_entity" as const,
  description:
    "Return field metadata, available actions and query hints for a single CiviCRM entity. " +
    "Use the pseudoconstant fields to query by human-readable name (e.g. ['status_id:name','=','Current']).",
  inputSchema: InputSchema,
  handler: async (args: z.infer<z.ZodObject<typeof InputSchema>>): Promise<ToolResult> => {
    const payload = await client.describe(args.entity, { refresh: args.refresh });
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  },
});
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm vitest run test/mcp/describe-entity.test.ts
```

Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add src/mcp/tools/describe-entity.ts test/mcp/describe-entity.test.ts
git commit -m "feat(mcp): civicrm_describe_entity tool"
```

---

### Task 16: MCP tool — civicrm_get

**Files:**
- Create: `src/mcp/tools/get.ts`
- Test: `test/mcp/get.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// test/mcp/get.test.ts
import { describe, expect, it, vi } from "vitest";
import { getTool } from "../../src/mcp/tools/get.js";

describe("civicrm_get tool", () => {
  it("delegates to client.get with the given params and returns serialised result", async () => {
    const get = vi.fn(async () => ({
      count: 1,
      values: [{ id: 1, display_name: "Alice" }],
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = getTool({ get } as any);
    const out = await tool.handler({
      entity: "Contact",
      where: [["display_name", "LIKE", "Ali%"]],
      select: ["id", "display_name"],
      limit: 25,
      offset: 0,
    });
    expect(get).toHaveBeenCalledWith("Contact", {
      where: [["display_name", "LIKE", "Ali%"]],
      select: ["id", "display_name"],
      limit: 25,
      offset: 0,
    });
    const parsed = JSON.parse((out.content[0] as { text: string }).text) as {
      count: number;
      values: unknown[];
    };
    expect(parsed.count).toBe(1);
  });

  it("rejects limit > 500", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = getTool({ get: async () => ({ count: 0, values: [] }) } as any);
    // Tools receive raw args; validation happens via the inputSchema in server.ts
    // but the schema itself should reject limit=1000 when parsed:
    const limitSchema = tool.inputSchema.limit;
    expect(() => limitSchema.parse(1000)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm vitest run test/mcp/get.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/mcp/tools/get.ts`**

```ts
import { z } from "zod";
import type { Civi4Client } from "../../civi/client.js";
import { WhereClauseSchema } from "./where-schema.js";
import type { ToolResult } from "./list-entities.js";

const InputSchema = {
  entity: z.string().min(1),
  where: z.array(WhereClauseSchema).default([]),
  select: z.array(z.string()).default(["*"]),
  orderBy: z.record(z.enum(["ASC", "DESC"])).optional(),
  limit: z.number().int().min(1).max(500).default(25),
  offset: z.number().int().min(0).default(0),
  groupBy: z.array(z.string()).optional(),
} as const;

export const getTool = (client: Civi4Client) => ({
  name: "civicrm_get" as const,
  description:
    "Query CiviCRM records via APIv4 get. Returns {count, values}. " +
    "Use pseudo-constant suffix names in where clauses (e.g. 'status_id:name') for human-readable queries. " +
    "Use dot-notation in select for joins (e.g. 'contact_id.display_name').",
  inputSchema: InputSchema,
  handler: async (args: z.infer<z.ZodObject<typeof InputSchema>>): Promise<ToolResult> => {
    const result = await client.get(args.entity, {
      where: args.where,
      select: args.select,
      limit: args.limit,
      offset: args.offset,
      ...(args.orderBy !== undefined ? { orderBy: args.orderBy } : {}),
      ...(args.groupBy !== undefined ? { groupBy: args.groupBy } : {}),
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
});
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm vitest run test/mcp/get.test.ts
```

Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add src/mcp/tools/get.ts test/mcp/get.test.ts
git commit -m "feat(mcp): civicrm_get tool with bounded limit"
```

---

### Task 17: MCP tool — civicrm_count

**Files:**
- Create: `src/mcp/tools/count.ts`
- Test: `test/mcp/count.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// test/mcp/count.test.ts
import { describe, expect, it, vi } from "vitest";
import { countTool } from "../../src/mcp/tools/count.js";

describe("civicrm_count tool", () => {
  it("returns {count: N} from client.count", async () => {
    const count = vi.fn(async () => ({ count: 142 }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = countTool({ count } as any);
    const out = await tool.handler({
      entity: "Contact",
      where: [["contact_type", "=", "Individual"]],
    });
    expect(count).toHaveBeenCalledWith("Contact", [["contact_type", "=", "Individual"]]);
    const parsed = JSON.parse((out.content[0] as { text: string }).text) as { count: number };
    expect(parsed.count).toBe(142);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm vitest run test/mcp/count.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/mcp/tools/count.ts`**

```ts
import { z } from "zod";
import type { Civi4Client } from "../../civi/client.js";
import { WhereClauseSchema } from "./where-schema.js";
import type { ToolResult } from "./list-entities.js";

const InputSchema = {
  entity: z.string().min(1),
  where: z.array(WhereClauseSchema).default([]),
} as const;

export const countTool = (client: Civi4Client) => ({
  name: "civicrm_count" as const,
  description:
    "Count CiviCRM records matching a where clause. Cheaper than civicrm_get for 'how many' questions.",
  inputSchema: InputSchema,
  handler: async (args: z.infer<z.ZodObject<typeof InputSchema>>): Promise<ToolResult> => {
    const result = await client.count(args.entity, args.where);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
});
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm vitest run test/mcp/count.test.ts
```

Expected: 1 passing.

- [ ] **Step 5: Commit**

```bash
git add src/mcp/tools/count.ts test/mcp/count.test.ts
git commit -m "feat(mcp): civicrm_count tool"
```

---

### Task 18: MCP server wiring with policy-based error wrapping

**Files:**
- Create: `src/mcp/server.ts`
- Create: `src/mcp/index.ts`
- Create: `src/mcp/errors-to-result.ts`
- Test: `test/mcp/errors-to-result.test.ts`
- Test: `test/mcp/server.test.ts`

This is the policy seam between the **Civi domain context** (which raises
typed `CiviError`s) and the **MCP context** (which speaks
`ToolResult`s with `isError: true`). Per spec Section 9: errors are
caught at the tool handler boundary, logged to stderr, surfaced to the
LLM as structured `isError` results, never swallowed.

- [ ] **Step 1: Write failing test for `errorsToResult`**

```ts
// test/mcp/errors-to-result.test.ts
import { describe, expect, it, vi } from "vitest";
import { wrapHandler } from "../../src/mcp/errors-to-result.js";
import { CiviApiError, CiviAuthError, CiviTransportError } from "../../src/civi/errors.js";

const fakeLog = { error: vi.fn() };

describe("wrapHandler", () => {
  it("passes through successful results unchanged", async () => {
    const inner = async () => ({ content: [{ type: "text" as const, text: "ok" }] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrapped = wrapHandler("t", inner, fakeLog as any);
    const out = await wrapped({});
    expect(out.isError).toBeUndefined();
    expect(out.content[0]).toEqual({ type: "text", text: "ok" });
  });

  it("converts CiviAuthError to isError result with a clear message", async () => {
    const inner = async () => {
      throw new CiviAuthError("Authentication failed (401)", { status: 401 });
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrapped = wrapHandler("civicrm_get", inner, fakeLog as any);
    const out = await wrapped({});
    expect(out.isError).toBe(true);
    expect(out.content[0]?.text).toMatch(/Authentication failed/);
    expect(fakeLog.error).toHaveBeenCalled();
  });

  it("includes entity/action context for CiviApiError", async () => {
    const inner = async () => {
      throw new CiviApiError("unknown field 'foo'", {
        entity: "Contact",
        action: "get",
        errorCode: "unknown_field",
      });
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrapped = wrapHandler("civicrm_get", inner, fakeLog as any);
    const out = await wrapped({});
    expect(out.isError).toBe(true);
    expect(out.content[0]?.text).toMatch(/Contact\.get/);
    expect(out.content[0]?.text).toMatch(/unknown field 'foo'/);
  });

  it("converts CiviTransportError to isError without leaking internals", async () => {
    const inner = async () => {
      throw new CiviTransportError("ECONNREFUSED");
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrapped = wrapHandler("civicrm_get", inner, fakeLog as any);
    const out = await wrapped({});
    expect(out.isError).toBe(true);
    expect(out.content[0]?.text).toMatch(/transport/i);
  });

  it("converts unexpected errors to a generic isError result and logs them", async () => {
    const inner = async () => {
      throw new TypeError("kaboom");
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrapped = wrapHandler("civicrm_get", inner, fakeLog as any);
    const out = await wrapped({});
    expect(out.isError).toBe(true);
    expect(out.content[0]?.text).toMatch(/internal error/i);
    expect(fakeLog.error).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm vitest run test/mcp/errors-to-result.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/mcp/errors-to-result.ts`**

```ts
import { CiviApiError, CiviAuthError, CiviError, CiviTransportError } from "../civi/errors.js";
import type { Logger } from "../logging.js";
import type { ToolResult } from "./tools/list-entities.js";

type Handler<A> = (args: A) => Promise<ToolResult>;

const message = (toolName: string, err: unknown): string => {
  if (err instanceof CiviAuthError) {
    return `Authentication failed when calling ${toolName}: ${err.message}`;
  }
  if (err instanceof CiviApiError) {
    return `${err.entity}.${err.action} returned an error: ${err.message}${err.errorCode ? ` [${err.errorCode}]` : ""}`;
  }
  if (err instanceof CiviTransportError) {
    return `Transport error calling ${toolName}: ${err.message}`;
  }
  if (err instanceof CiviError) {
    return `${toolName}: ${err.message}`;
  }
  return `Internal error in ${toolName} — see server logs for details.`;
};

export const wrapHandler = <A>(
  toolName: string,
  handler: Handler<A>,
  log: Logger,
): Handler<A> => {
  return async (args) => {
    try {
      return await handler(args);
    } catch (err) {
      log.error({ tool: toolName, err }, "tool handler threw");
      return {
        content: [{ type: "text", text: message(toolName, err) }],
        isError: true,
      };
    }
  };
};
```

- [ ] **Step 4: Run errors-to-result tests**

```bash
pnpm vitest run test/mcp/errors-to-result.test.ts
```

Expected: 5 passing.

- [ ] **Step 5: Write failing test for `buildServer`**

```ts
// test/mcp/server.test.ts
import { describe, expect, it } from "vitest";
import { buildServer } from "../../src/mcp/server.js";
import { createLogger } from "../../src/logging.js";

describe("buildServer", () => {
  it("registers all four Phase 1 tools", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const server = buildServer({} as any, createLogger("error"));
    const names = server._registeredToolNames();
    expect(names.sort()).toEqual(
      ["civicrm_count", "civicrm_describe_entity", "civicrm_get", "civicrm_list_entities"].sort(),
    );
  });
});
```

- [ ] **Step 6: Run test to confirm it fails**

```bash
pnpm vitest run test/mcp/server.test.ts
```

Expected: FAIL.

- [ ] **Step 7: Implement `src/mcp/server.ts`**

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Civi4Client } from "../civi/client.js";
import type { Logger } from "../logging.js";
import { wrapHandler } from "./errors-to-result.js";
import { countTool } from "./tools/count.js";
import { describeEntityTool } from "./tools/describe-entity.js";
import { getTool } from "./tools/get.js";
import { listEntitiesTool } from "./tools/list-entities.js";

export type CiviMcpServer = McpServer & { _registeredToolNames(): readonly string[] };

type AnyTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: never) => Promise<import("./tools/list-entities.js").ToolResult>;
};

export const buildServer = (client: Civi4Client, log: Logger): CiviMcpServer => {
  const server = new McpServer({ name: "civicrm-mcp", version: "0.1.0" }) as CiviMcpServer;
  const registered: string[] = [];

  const register = (t: AnyTool): void => {
    const safe = wrapHandler(t.name, t.handler as (a: unknown) => Promise<import("./tools/list-entities.js").ToolResult>, log);
    server.tool(t.name, t.description, t.inputSchema as never, safe as never);
    registered.push(t.name);
  };

  register(listEntitiesTool(client));
  register(describeEntityTool(client));
  register(getTool(client));
  register(countTool(client));

  server._registeredToolNames = () => [...registered];
  return server;
};
```

- [ ] **Step 8: Write `src/mcp/index.ts`**

```ts
export { buildServer } from "./server.js";
export type { CiviMcpServer } from "./server.js";
```

- [ ] **Step 9: Run server tests**

```bash
pnpm vitest run test/mcp/server.test.ts
```

Expected: 1 passing.

- [ ] **Step 10: Update `src/cli.ts` to pass the logger to `buildServer`**

Replace the relevant lines in `src/cli.ts` (from Task 20):

```ts
const server = buildServer(client, log);
```

(If Task 20 hasn't been done yet, this is a forward note — Task 20's
code below already uses the two-argument form.)

- [ ] **Step 11: Commit**

```bash
git add src/mcp/server.ts src/mcp/index.ts src/mcp/errors-to-result.ts \
        test/mcp/server.test.ts test/mcp/errors-to-result.test.ts
git commit -m "feat(mcp): server wiring with policy-based error-to-ToolResult mapping"
```

---

## Phase F — Bootstrap and logging

### Task 19: Logging — pino to stderr

**Files:**
- Create: `src/logging.ts`
- Test: `test/logging.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// test/logging.test.ts
import { describe, expect, it } from "vitest";
import { createLogger } from "../src/logging.js";

describe("createLogger", () => {
  it("returns a pino logger configured at the given level", () => {
    const log = createLogger("info");
    expect(typeof log.info).toBe("function");
    expect(log.level).toBe("info");
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm vitest run test/logging.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/logging.ts`**

```ts
import pino from "pino";

export type Logger = pino.Logger;

export const createLogger = (level: "error" | "warn" | "info" | "debug"): Logger =>
  pino(
    { level, base: { svc: "civicrm-mcp" } },
    pino.destination({ dest: 2, sync: false }), // 2 = stderr
  );
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm vitest run test/logging.test.ts
```

Expected: 1 passing.

- [ ] **Step 5: Commit**

```bash
git add src/logging.ts test/logging.test.ts
git commit -m "feat(logging): pino logger writing to stderr"
```

---

### Task 20: CLI bootstrap

**Files:**
- Modify: `src/cli.ts`

This task has no unit test — it's an integration entry point. Verification
is through `pnpm dev` against a real Civi (env-gated) in Task 22.

- [ ] **Step 1: Rewrite `src/cli.ts`**

```ts
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
```

- [ ] **Step 2: Build the package**

```bash
pnpm build
```

Expected: clean compile, `dist/cli.js` exists.

- [ ] **Step 3: Dry-run with stub env (must fail loudly without real Civi)**

```bash
CIVI_BASE_URL=https://invalid.example.org CIVI_API_KEY=x node dist/cli.js < /dev/null
```

Expected: the server starts (writes "starting" / "connected" to stderr),
then exits immediately because stdin closes. No stdout output other than
JSON-RPC.

- [ ] **Step 4: Commit**

```bash
git add src/cli.ts
git commit -m "feat(cli): bootstrap MCP server over stdio"
```

---

## Phase G — Integration with real Civi

### Task 21: Env-gated live integration test

**Files:**
- Create: `test/integration/live.test.ts`

This test is **skipped** unless `CIVI_INTEGRATION=1` and credentials are
set. It runs against the user's real CiviCRM.

- [ ] **Step 1: Write the test**

```ts
// test/integration/live.test.ts
import { describe, expect, it } from "vitest";
import { Civi4Client } from "../../src/civi/client.js";
import { asApiKey } from "../../src/civi/types.js";

const ENABLED =
  process.env["CIVI_INTEGRATION"] === "1" &&
  process.env["CIVI_BASE_URL"] !== undefined &&
  process.env["CIVI_API_KEY"] !== undefined;

const d = ENABLED ? describe : describe.skip;

d("Civi4Client against a real Civi (env-gated)", () => {
  const client = new Civi4Client({
    baseUrl: new URL(process.env["CIVI_BASE_URL"]!),
    apiKey: asApiKey(process.env["CIVI_API_KEY"]!),
  });

  it("lists at least the Contact entity", async () => {
    const entities = await client.listEntities();
    expect(entities.map((e) => e.name)).toContain("Contact");
  });

  it("describes Contact and finds contact_type with a pseudoconstant", async () => {
    const d = await client.describe("Contact");
    const contactType = d.fields.find((f) => f.name === "contact_type");
    expect(contactType?.pseudoconstant).toBeDefined();
  });

  it("counts active individuals (smoke test, exact number not asserted)", async () => {
    const result = await client.count("Contact", [
      ["contact_type", "=", "Individual"],
      ["is_deleted", "=", 0],
    ]);
    expect(result.count).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run integration test against the user's Civi**

```bash
export CIVI_INTEGRATION=1
export CIVI_BASE_URL=https://<your-civi-host>
export CIVI_API_KEY=<your-personal-api-key>
pnpm vitest run test/integration/live.test.ts
```

Expected: 3 passing. If something fails, debug against the real site
before continuing — this test catches the gap between mock fetch and
real-world response shapes.

- [ ] **Step 3: Commit**

```bash
git add test/integration/live.test.ts
git commit -m "test(integration): live APIv4 smoke test (env-gated)"
```

---

### Task 22: Hands-on verification with Claude Desktop

This task has **no code changes** — it's a manual verification step the
spec's success criteria depend on. Document the result in
`docs/superpowers/specs/2026-06-10-civicrm-mcp-server-design.md` under a
new "Validation log" subsection once complete.

- [ ] **Step 1: Configure Claude Desktop**

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```jsonc
{
  "mcpServers": {
    "civicrm": {
      "command": "node",
      "args": ["<absolute-path-to>/civi-mcp-server/dist/cli.js"],
      "env": {
        "CIVI_BASE_URL": "https://<your-civi-host>",
        "CIVI_API_KEY": "<your-personal-api-key>"
      }
    }
  }
}
```

Restart Claude Desktop.

- [ ] **Step 2: Ask each Phase 1 question and record the result**

In a new Claude Desktop conversation, ask in order, and verify the answer:

1. "How many members have pending contributions?"
2. "How many life members signed up since 1 January?"
3. "List the 10 contacts most recently added to group X." (substitute a
   real group name)
4. "What was the total of all completed contributions in May?"

For each, capture:
- Did the agent use pseudo-constant names (`status_id:name = ...`)?
- How many MCP roundtrips did it take?
- Was the final answer correct (cross-check against the Civi UI)?

- [ ] **Step 3: If any answer is wrong, file an issue or add a failing
  integration test, then fix.**

Examples of common Phase-1 issues you may encounter:
- The agent guesses status ids rather than using `:name` suffix → tighten
  the `describe_entity` queryHints copy.
- The agent forgets to filter `is_deleted = 0` → mention it in the skill
  (Phase H).
- `count` returns `undefined` rather than 0 on empty result → check
  Task 12's fallback.

- [ ] **Step 4: Once all four pass, commit a results note**

```bash
# Create or append to docs/superpowers/specs/.../validation-log.md
git add docs/
git commit -m "docs: record Phase 1 hands-on validation results"
```

---

## Phase H — Companion Claude Code skill

### Task 23: SKILL.md scaffold

**Files:**
- Create: `skills/civicrm/SKILL.md`

- [ ] **Step 1: Write `skills/civicrm/SKILL.md`**

```markdown
---
name: civicrm
description: Use when answering analytical or operational questions about a CiviCRM instance — members, contributions, events, contacts, activities. Provides workflow heuristics and common query patterns. Requires the civicrm-mcp MCP server to be configured.
---

# CiviCRM

A companion skill for the `civicrm-mcp` MCP server. The MCP server provides
typed tool contracts; this skill provides the agent's intuition for when
to use them and how CiviCRM is structured.

## When to invoke

Trigger phrases:

- "How many members…", "How many contributions…", "How many contacts…"
- "List the recent / active / lapsed …"
- "What's the total / breakdown / trend of …"
- Anything that names a CiviCRM concept (member, donor, activity, event,
  participant, contribution, group, tag).

If the MCP server is unavailable (tool calls error with `CiviAuth` or
`CiviTransport`), tell the user — do not fabricate an answer.

## The four Phase 1 tools

| Tool | Purpose |
|---|---|
| `civicrm_list_entities` | Discover entities on this site (incl. extensions). Call once per session. |
| `civicrm_describe_entity` | Fields, pseudo-constants, actions, query hints for one entity. Call once per entity per session — results are cached server-side. |
| `civicrm_get` | Query records: where, select, orderBy, limit. |
| `civicrm_count` | Count records matching a where clause. Cheaper than `get` for "how many" questions. |

## Workflow heuristics

1. **Start with `describe` before `get`** if you haven't queried this entity
   in this session — you need the field metadata to write correct filters.
2. **Prefer `count` over `get`** when the user's question is "how many".
3. **Set `limit` explicitly** in `get` to match user intent ("show me ten"
   → `limit: 10`).
4. **Query by name, not by id.** When the user names a status, type, or
   category in plain English, use the `:name` or `:label` pseudo-constant
   suffix:

   ```json
   ["status_id:name", "=", "Current"]
   ```

   Not:

   ```json
   ["status_id", "=", 2]
   ```

5. **Always filter `is_deleted = 0`** when querying Contact-derived data
   unless the user explicitly asks for deleted records.
6. **Joins via dot-notation in `select`**:

   ```json
   { "entity": "Contribution",
     "select": ["total_amount", "contact_id.display_name"],
     "where": [["receive_date", ">=", "2026-01-01"]] }
   ```

## CiviCRM mental model

- **Contact** is the root entity. Three subtypes: `Individual`,
  `Organization`, `Household` (controlled by `contact_type`). Additional
  user-defined sub-types live in `contact_sub_type` (an array).
- **Membership** represents a Contact's relationship to a `MembershipType`.
  Status is auto-recalculated by Civi from `start_date`, `end_date`, and
  `MembershipType.duration_*`. Filter by `status_id:name`.
- **Contribution** is a financial transaction linked to a Contact. Has a
  `financial_type_id` (Donation, Member Dues, …) and a `contribution_status_id`
  (Completed, Pending, Failed, …). "Successful" usually means
  `contribution_status_id:name = "Completed"`.
- **Activity** is a logged interaction (call, email, meeting). Has
  `activity_type_id`, `status_id`, and a many-to-many of contact roles
  (`source`, `target`, `assignee`).
- **Participant** is a Contact registered for an Event. Status indicates
  registration state, not attendance.
- **Group** is a collection of Contacts. `GroupContact` links them; check
  `status` (Added / Pending / Removed) when querying group membership.

## Pseudo-constant cheat-sheet

| Field | What `:name` returns |
|---|---|
| `Membership.status_id` | "New", "Current", "Grace", "Expired", "Cancelled" |
| `Contribution.contribution_status_id` | "Completed", "Pending", "Refunded", "Failed" |
| `Activity.status_id` | "Scheduled", "Completed", "Cancelled" |
| `Contact.contact_type` | "Individual", "Organization", "Household" |
| `Participant.status_id` | "Registered", "Attended", "No-show", "Cancelled" |

Always call `civicrm_describe_entity` for the authoritative list — site
admins can rename or add status values.

## Common gotchas

- **Soft credits.** A contribution can be soft-credited to other contacts
  via `ContributionSoft`. If a user asks "how much did X raise?", consider
  whether they mean hard credit (`Contribution.contact_id = X`) or
  including soft credits (`ContributionSoft.contact_id = X`).
- **Timezone.** APIv4 dates are stored in the site's configured timezone,
  not the user's. If a question is timezone-sensitive ("this week"), ask
  the user to confirm the time window.
- **`is_deleted` defaults to 0 in the UI, not the API.** Without an
  explicit filter you'll get deleted rows.
- **Custom fields.** Surfaced in `describe_entity` with a `custom` ref
  (`groupName` + `fieldName`). Query by the literal field name as returned
  by `describe` — e.g. `custom_42` or `MembershipDetails.RenewalSource`.

## Worked examples

See `examples/`:

- `active-members.md` — current members of a given type
- `donations-by-month.md` — contribution totals grouped by month
- `lapsed-members.md` — members whose `end_date` passed in the last N days
- `recent-activity.md` — contacts with activities in the last week
```

- [ ] **Step 2: Validate it parses as markdown**

```bash
pnpm markdownlint-cli2 skills/civicrm/SKILL.md
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add skills/civicrm/SKILL.md
git commit -m "feat(skill): SKILL.md with workflow heuristics and mental model"
```

---

### Task 24: Skill examples

**Files:**
- Create: `skills/civicrm/examples/active-members.md`
- Create: `skills/civicrm/examples/donations-by-month.md`
- Create: `skills/civicrm/examples/lapsed-members.md`
- Create: `skills/civicrm/examples/recent-activity.md`

- [ ] **Step 1: Write `skills/civicrm/examples/active-members.md`**

```markdown
# Example — Active members of a given type

**User asks:** "How many active Lifetime members do we have?"

## Walk-through

1. **Describe `MembershipType`** to look up the type by name:

   ```
   civicrm_get(
     entity: "MembershipType",
     where: [["name","=","Lifetime"]],
     select: ["id","name"]
   )
   ```

2. **Describe `Membership`** to confirm `status_id` pseudo-constant values.

3. **Count active memberships of that type:**

   ```
   civicrm_count(
     entity: "Membership",
     where: [
       ["membership_type_id","=", <id from step 1>],
       ["status_id:name","IN",["New","Current","Grace"]]
     ]
   )
   ```

## Notes

- "Active" usually includes New + Current + Grace; check with the user if
  they want a tighter or looser definition.
- For a *list* of members instead of a count, swap `civicrm_count` for
  `civicrm_get` and add `select: ["id","contact_id.display_name","start_date"]`.
```

- [ ] **Step 2: Write `skills/civicrm/examples/donations-by-month.md`**

```markdown
# Example — Donations by month

**User asks:** "What were our completed donations by month last year?"

## Walk-through

1. **Describe `Contribution`** to confirm `contribution_status_id` and
   `financial_type_id` pseudo-constants.

2. **Query, grouping by month:**

   ```
   civicrm_get(
     entity: "Contribution",
     where: [
       ["contribution_status_id:name","=","Completed"],
       ["receive_date",">=","2025-01-01"],
       ["receive_date","<","2026-01-01"]
     ],
     select: ["MONTH(receive_date) AS month", "SUM(total_amount) AS total"],
     groupBy: ["month"],
     orderBy: { "month": "ASC" },
     limit: 12
   )
   ```

## Notes

- Filter to `financial_type_id:name = "Donation"` if "donations" must
  exclude member dues.
- For a year-on-year comparison, run the query for two date ranges and
  diff the results client-side.
```

- [ ] **Step 3: Write `skills/civicrm/examples/lapsed-members.md`**

```markdown
# Example — Recently lapsed members

**User asks:** "Show me members whose memberships lapsed in the last 30 days."

## Walk-through

1. **Compute the date window** in the site's timezone (ask the user if
   ambiguous): 30 days ago = `YYYY-MM-DD`.

2. **Query:**

   ```
   civicrm_get(
     entity: "Membership",
     where: [
       ["status_id:name","IN",["Expired","Cancelled"]],
       ["end_date",">=","<30-days-ago>"],
       ["end_date","<=","<today>"]
     ],
     select: ["contact_id.display_name", "membership_type_id:name", "end_date"],
     orderBy: { "end_date": "DESC" },
     limit: 100
   )
   ```

## Notes

- Use `status_id:name IN ["Expired","Cancelled"]` rather than guessing
  numeric ids.
- `end_date` is in the site timezone. Adjust the bounds if the user is
  asking from a different timezone.
```

- [ ] **Step 4: Write `skills/civicrm/examples/recent-activity.md`**

```markdown
# Example — Contacts with recent activity

**User asks:** "Which contacts have we logged any activity for in the last week?"

## Walk-through

1. **Describe `Activity`** if unfamiliar with `status_id` /
   `activity_type_id` pseudo-constants for this site.

2. **Query distinct contacts with completed activities:**

   ```
   civicrm_get(
     entity: "Activity",
     where: [
       ["status_id:name","=","Completed"],
       ["activity_date_time",">=","<7-days-ago>"]
     ],
     select: ["activity_contact.contact_id.display_name", "activity_date_time", "activity_type_id:label"],
     orderBy: { "activity_date_time": "DESC" },
     limit: 100
   )
   ```

## Notes

- `activity_contact` is the join entity linking Activity ↔ Contact with a
  role (source, target, assignee). Use it via dot-notation in `select`.
- If the user wants a *count of contacts*, use `civicrm_get` with
  `select: ["DISTINCT activity_contact.contact_id"]` and count client-side,
  since `civicrm_count` doesn't accept distinct selects in Phase 1.
```

- [ ] **Step 5: Lint markdown**

```bash
pnpm markdownlint-cli2 skills/civicrm/examples/*.md
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add skills/civicrm/examples/
git commit -m "docs(skill): four worked example queries"
```

---

### Task 25: Skill INSTALL.md and CHANGELOG.md

**Files:**
- Create: `skills/civicrm/INSTALL.md`
- Create: `skills/civicrm/CHANGELOG.md`

- [ ] **Step 1: Write `skills/civicrm/INSTALL.md`**

```markdown
# Installing the CiviCRM skill

This skill is the optional companion to the `civicrm-mcp` MCP server. The
MCP server gives the agent typed tool contracts; this skill gives it
workflow heuristics and domain knowledge.

## Prerequisites

- The `civicrm-mcp` MCP server is configured in your Claude Desktop /
  Claude Code MCP config (see `docs/install-mcp.md` in this repo).
- Claude Code is installed and looks at `~/.claude/skills/` by default.

## Install

From a clone of this repo:

```sh
mkdir -p ~/.claude/skills
cp -r skills/civicrm ~/.claude/skills/civicrm
```

## Verify

In Claude Code, run:

```
/skills
```

`civicrm` should appear in the list. Ask a CiviCRM question (e.g. "how
many active members do we have?") — Claude should invoke the skill before
calling the MCP tools.

## Update

When you `git pull` this repo, re-copy:

```sh
rm -rf ~/.claude/skills/civicrm
cp -r skills/civicrm ~/.claude/skills/civicrm
```

The `CHANGELOG.md` in this directory records what changed and whether you
need to also update the MCP server.
```

- [ ] **Step 2: Write `skills/civicrm/CHANGELOG.md`**

```markdown
# Skill changelog

Tracked alongside MCP changes. Entries note whether they affect the MCP
server, the skill, or both.

## 0.1.0 — 2026-06-11

- Initial Phase 1 skill: workflow heuristics, mental model,
  pseudo-constant cheat-sheet, four worked examples.
- **MCP version required:** civicrm-mcp 0.1.0 (the four Phase 1 tools).
```

- [ ] **Step 3: Commit**

```bash
git add skills/civicrm/INSTALL.md skills/civicrm/CHANGELOG.md
git commit -m "docs(skill): install instructions and changelog"
```

---

### Task 26: Skill-consistency integration test

**Files:**
- Create: `test/integration/skill-consistency.test.ts`
- Modify: `vitest.config.ts` if needed (this test runs in the integration
  group, but with no env vars required)

- [ ] **Step 1: Write the test**

```ts
// test/integration/skill-consistency.test.ts
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildServer } from "../../src/mcp/server.js";

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

describe("skill ⇄ MCP tool name parity", () => {
  it("every civicrm_* token in the skill is a registered MCP tool", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const server = buildServer({} as any);
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
```

- [ ] **Step 2: Run it**

```bash
pnpm vitest run test/integration/skill-consistency.test.ts
```

Expected: 1 passing (referenced tools = `civicrm_list_entities`,
`civicrm_describe_entity`, `civicrm_get`, `civicrm_count`, all registered).

- [ ] **Step 3: Commit**

```bash
git add test/integration/skill-consistency.test.ts
git commit -m "test(integration): assert skill markdown only references registered MCP tools"
```

---

## Phase I — Docs and README

### Task 27: docs/install-mcp.md and docs/install-skill.md

**Files:**
- Create: `docs/install-mcp.md`
- Create: `docs/install-skill.md`

- [ ] **Step 1: Write `docs/install-mcp.md`**

```markdown
# Installing the civicrm-mcp server

## Prerequisites

- A CiviCRM 5.40+ site with the `authx` extension enabled.
- A personal API key on your CiviCRM user (Contact → API key field).
- Node 22+ and `npx` available locally.

## Configure your MCP client

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) or the equivalent on your OS:

```jsonc
{
  "mcpServers": {
    "civicrm": {
      "command": "npx",
      "args": ["-y", "civicrm-mcp"],
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

Add to your project's `.claude/settings.json` or your user-level config:

```jsonc
{
  "mcpServers": {
    "civicrm": {
      "command": "npx",
      "args": ["-y", "civicrm-mcp"],
      "env": {
        "CIVI_BASE_URL": "https://civi.example.org",
        "CIVI_API_KEY": "<your-personal-api-key>"
      }
    }
  }
}
```

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
| `CIVI_AUTHX_PATH` | no | `/civicrm/authx/api4` | Override for non-standard sites |
| `CIVI_TIMEOUT_MS` | no | `30000` | HTTP request timeout |
| `CIVI_LOG_LEVEL` | no | `error` | `error` \| `warn` \| `info` \| `debug` |
```

- [ ] **Step 2: Write `docs/install-skill.md`**

```markdown
# Installing the CiviCRM Claude Code skill

This is an optional companion to the MCP server. See
[`skills/civicrm/INSTALL.md`](../skills/civicrm/INSTALL.md) for the full
procedure.

Quick version:

```sh
mkdir -p ~/.claude/skills
cp -r skills/civicrm ~/.claude/skills/civicrm
```

Then check `/skills` in Claude Code lists `civicrm`.
```

- [ ] **Step 3: Lint markdown**

```bash
pnpm markdownlint-cli2 docs/*.md
```

- [ ] **Step 4: Commit**

```bash
git add docs/install-mcp.md docs/install-skill.md
git commit -m "docs: MCP and skill install guides"
```

---

### Task 28: README.md

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

```markdown
# civicrm-mcp

A Model Context Protocol server for CiviCRM. Answer natural-language
questions about your CRM ("how many life members signed up since
January?") from Claude Desktop, Claude Code, Cursor, or any MCP client.

## Status

Phase 1 — read-only, four generic tools, single-tenant via personal API key.

## What's in this repo

- `src/` — the TypeScript MCP server (published to npm as `civicrm-mcp`)
- `skills/civicrm/` — an optional Claude Code skill with workflow
  heuristics and worked examples
- `docs/` — install guides and the design spec

## Quick start

1. Make sure the `authx` extension is enabled on your CiviCRM site and
   you have a personal API key.
2. Configure the MCP server: see [`docs/install-mcp.md`](docs/install-mcp.md).
3. (Optional, Claude Code users) install the skill: see
   [`docs/install-skill.md`](docs/install-skill.md).

## How it works

The MCP server exposes four typed tools:

| Tool | Purpose |
|---|---|
| `civicrm_list_entities` | Discover entities on this site |
| `civicrm_describe_entity` | Fields, pseudo-constants, query hints for one entity |
| `civicrm_get` | Generic query (where / select / orderBy / limit) |
| `civicrm_count` | Cheap exact-count for "how many" questions |

The agent calls `describe_entity` once per entity, then issues structured
queries. Pseudo-constants are surfaced so the agent can write
`['status_id:name','=','Current']` rather than guessing numeric ids.
Custom fields are discovered through introspection.

See [the design spec](docs/superpowers/specs/2026-06-10-civicrm-mcp-server-design.md)
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
```

- [ ] **Step 2: Lint markdown**

```bash
pnpm markdownlint-cli2 README.md
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: project README"
```

---

## Phase J — Final verification

### Task 29: Full pipeline verify

- [ ] **Step 1: Run the full verify pipeline**

```bash
pnpm verify
```

Expected: format clean, lint clean, typecheck clean, all unit + component
tests pass. Zero warnings.

- [ ] **Step 2: Run prek across all files**

```bash
prek run --all-files
```

Expected: every hook green.

- [ ] **Step 3: Run the skill-consistency integration test**

```bash
pnpm vitest run test/integration/skill-consistency.test.ts
```

Expected: pass.

- [ ] **Step 4: Run the live integration test if you have credentials**

```bash
CIVI_INTEGRATION=1 \
  CIVI_BASE_URL=https://<your-civi-host> \
  CIVI_API_KEY=<key> \
  pnpm vitest run test/integration/live.test.ts
```

Expected: pass.

- [ ] **Step 5: Confirm success criteria from the spec**

Walk through Section 14 of `docs/superpowers/specs/2026-06-10-civicrm-mcp-server-design.md`
item by item. Tick each one off. If any fail, file an issue or add a
failing test and fix.

- [ ] **Step 6: Final commit (if any docs updates) and merge**

```bash
# Only if the spec validation log needs updating
git add docs/
git commit -m "docs: complete Phase 1 success-criteria validation log"

# Merge to main via PR
gh pr create --title "feat: civicrm-mcp Phase 1" \
  --body "$(cat <<'EOF'
## Summary
Phase 1 of the civicrm-mcp server: four generic MCP tools over CiviCRM APIv4
plus an optional Claude Code companion skill. Read-only; stdio transport;
authx Bearer auth.

## Test plan
- [x] Unit + component tests pass
- [x] Skill-consistency integration test passes
- [x] Live integration test passes against the maintainer's Civi
- [x] Hands-on validation: four example questions from the spec answered correctly
- [x] prek run --all-files clean

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Notes for the implementer

- **Conventional commits** are enforced by the `commit-msg` hook. If a
  commit is rejected, fix the message and commit again (don't `--amend`
  if the hook is failing — fix the cause).
- **Imports use the `.js` extension** even though the source is `.ts`.
  This is required for Node-ESM with `"module": "NodeNext"`.
- **stdout is reserved for JSON-RPC.** All logs go to stderr (via `pino`
  with `dest: 2`). Never `console.log` in src/.
- **Strict TS:** with `noUncheckedIndexedAccess`, `array[0]` is `T | undefined`.
  Use `array[0]?.field` or explicit narrowing.
- **MCP TS SDK versions vary.** The plan targets `@modelcontextprotocol/sdk`
  1.x with the `McpServer` higher-level class. If the SDK ships a major
  bump that renames `server.tool(...)`, check the SDK changelog and adjust
  Task 18 accordingly.
- **Disk-cache, write tools, dedicated tools, and HTTP transport are
  Phase 2/3.** Resist scope creep — if a "small" addition appears
  necessary, propose it via a fresh brainstorming round, not in this
  plan.
