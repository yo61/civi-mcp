# Dependency knowledge

Confirmed facts about how dependency changes get validated in this repo.

## F1: The `lint` job covers far more than its name

`.github/workflows/ci.yaml` has two jobs, `lint` and `secrets`. `lint`
runs prek over `.pre-commit-config.yaml`, whose `local` hooks shell out
to `pnpm oxfmt --check`, `pnpm oxlint`, `pnpm typecheck` (`tsc
--noEmit`) and `pnpm vitest run --exclude test/integration`, and then
runs `pnpm build` as an explicit step.

So a green `lint` means format, lint, typecheck, the unit suite and emit
all passed — considerably more than the job name suggests. It is also
the only required check that gates anything about the code, so whatever
is not in this job is not gated at all.

The build step sits outside the hooks deliberately. `pnpm typecheck`
uses `tsconfig.json` (src + test, `--noEmit`); `pnpm build` uses
`tsconfig.build.json` (src only, emits `dist/`). Type-checking cannot
tell you emit works, and `dist/cli.js` is what this package ships as its
`bin`. The step was missing until 2026-08-24 — until then the first
thing to run a build was `prepublishOnly`, so a codegen regression would
have surfaced at release rather than on the PR that introduced it.

**Confirmed:** 2026-08-24, merging #14; build step added the same day.

## F2: Required checks are non-strict — a PR can merge without seeing current `main`

Two rulesets apply to `main`:

- "Default Branch" (17866321): 1 approving review, signed commits, no
  deletion, no non-fast-forward, and
  `require_extra_approval_for_unattributed_changes`.
- "Required status checks" (20643455): contexts `lint` and `secrets`,
  with `strict_required_status_checks_policy: false`.

Non-strict means GitHub will not ask a branch to be up to date before
merging. Green checks on a Dependabot PR may therefore have been
produced against a base that is several commits stale. This matters
specifically for PRs touching `pnpm-lock.yaml` — see [R2](rules.md).

Note that `main` has *no* classic branch protection; the rulesets are
the whole story. `gh api repos/yo61/civi-mcp/branches/main/protection`
returns 404, which is misleading if read as "unprotected". Use
`gh api repos/yo61/civi-mcp/rules/branches/main` instead.

**Confirmed:** 2026-08-24, merging #14.

## F3: TypeScript 7.0.2 emit is byte-identical to 6.0.3 here

TypeScript 7 is the Go rewrite of the compiler, so the 6 → 7 bump was
treated as a codegen risk rather than a routine version bump. Building
`dist/` with both compilers and diffing the trees showed the runtime
`.js` output to be byte-identical.

The only differences were sourcemap `mappings` in `.js.map`/`.d.ts.map`,
and `dist/config.d.ts`, where TS 7 serialises the inferred `z.ZodEnum`
members alphabetically (`debug, error, info, warn`) instead of in
declaration order. Object type members are unordered in TypeScript's
type system, so that is the same type with different text.

Useful as a baseline: this codebase's emit did not change across a
complete compiler reimplementation, so a future TypeScript bump that
*does* move `.js` output is worth reading rather than waving through.

**Confirmed:** 2026-08-24, PR #14.
