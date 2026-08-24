# Dependency rules

Apply by default when handling dependency bumps. Both rules were
validated once (2026-08-24, PR #14); a contradiction demotes them to
hypotheses.

## R1: Validate a compiler or toolchain major bump by diffing the emitted output

A successful `pnpm build` proves emit does not *error*. It does not
prove emit is *unchanged*. When the tool that produces `dist/` changes
major version — above all `typescript`, whose 7.0 release is a complete
reimplementation in Go — those are different questions and only the
second one tells you whether shipped behaviour moved.

Build both and diff:

```bash
git worktree add --detach /tmp/old origin/main
git worktree add --detach /tmp/new origin/main
cd /tmp/new && git merge --no-commit --no-ff <pr-branch>
for d in /tmp/old /tmp/new; do (cd "$d" && pnpm install --frozen-lockfile && pnpm build); done
diff -rq /tmp/old/dist /tmp/new/dist | grep -E '\.(js|d\.ts) differ'
```

Filter to `.js` and `.d.ts`. Sourcemap files will always differ —
`mappings` is a position-encoded VLQ string, so any change in the
compiler's output positions rewrites it wholesale. That is noise.

Identical `.js` means behaviour-preserving. Any `.js` difference needs
reading before the merge, not after.

## R2: Trial-merge Dependabot lockfile PRs and re-run `--frozen-lockfile`

Dependabot opens one PR per dependency and every one of them edits
`pnpm-lock.yaml`. Each PR's lockfile is generated against the base as it
stood when the PR was opened, so the moment one lands, all the others
are stale. Because required checks are non-strict
([F2](knowledge.md)), GitHub will merge the stale ones anyway, and
their green ticks describe a base that no longer exists.

Git resolves the overlap textually. A pnpm lockfile is not textually
independent: the `importers:` block and the transitive peer-resolution
keys (`vitest@4.1.8(@types/node@26.1.2)(vite@8.0.16(...))`) live in
different regions of the file but have to agree. A clean auto-merge can
therefore still produce an internally inconsistent lockfile.

Before merging the second and any subsequent lockfile PR:

```bash
git worktree add --detach /tmp/trial origin/main
cd /tmp/trial && git merge --no-commit --no-ff <pr-branch>
pnpm install --frozen-lockfile
```

`--frozen-lockfile` is the check that matters, because it is the same
flag CI's install step uses — it fails here exactly where CI would fail
after the merge.

In PR #14 the textual merge happened to come out correct. "Happened to"
is the whole point of the rule: it is not guaranteed.
