# Dependency knowledge

Confirmed facts about how dependency changes get validated in this repo.

## F1: The `lint` job is the whole gate, and it does not run `pnpm build`

`.github/workflows/ci.yaml` has two jobs, `lint` and `secrets`. `lint`
runs prek over `.pre-commit-config.yaml`, whose `local` hooks shell out
to `pnpm oxfmt --check`, `pnpm oxlint`, `pnpm typecheck` (`tsc
--noEmit`) and `pnpm vitest run --exclude test/integration`.

So a green `lint` means format, lint, typecheck and the unit suite all
passed — considerably more than the job name suggests.

What it does *not* cover is `pnpm build` (`tsc -p tsconfig.build.json`),
which is the only thing that exercises emit. Nothing in CI runs it. The
first gate that does is `prepublishOnly` (`pnpm verify && pnpm build`),
so a regression affecting only code generation would surface at publish
time rather than on the PR that introduced it.

**Confirmed:** 2026-08-24, merging #14.

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
