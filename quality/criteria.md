# Quality criteria

## Dependencies

**Criteria:**

- `pnpm install --frozen-lockfile` succeeds after any lockfile change
- `pnpm audit --prod --audit-level=moderate` reports no findings
- A lockfile diff's changed package keys are each accounted for in the PR
  description

**Severity:** blocking

**Source:** CI `lint` job; knowledge/dependencies F4

**Last triggered:** 2026-11-17

## Code

**Criteria:**

- `prek run --all-files` passes (format, lint, typecheck, unit tests)
- `pnpm build` succeeds (tsconfig.build.json emit is not covered by
  typecheck)

**Severity:** blocking

**Source:** knowledge/dependencies F1

**Last triggered:** never
