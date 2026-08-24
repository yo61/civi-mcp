# Knowledge index

This directory holds project-specific facts, hypotheses, and rules that
aren't derivable from the code or git history. See the per-domain folders
for details.

## Domains

- [Architecture](architecture/) — high-level design decisions, hypotheses
  about generalisation, patterns we're trying.
- [Dependencies](dependencies/) — what CI actually covers, and the
  checks worth running before merging a bump.

## How this works

- `knowledge.md` — confirmed facts and patterns
- `hypotheses.md` — needs more data
- `rules.md` — confirmed; apply by default

When a hypothesis is confirmed three times, promote it to a rule. When a
rule is contradicted, demote it back to hypothesis.
