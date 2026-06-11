# Architecture hypotheses

## H1: The CiviCRM MCP design generalises to a framework

**Hypothesis:** The dispatcher + introspection + generic CRUD pattern used
in `civi-mcp` (`listEntities`/`describe`/`get`/`count`) is reusable as
a framework. `Civi4Client` is structurally an "adapter" — extract its
shape into an interface and the same MCP wiring + caching + error
mapping should work for any backend with introspection.

**Status:** Untested. We have one example (CiviCRM).

**What would confirm:** Successfully building a second MCP server (e.g.
HubSpot, Discourse, Mastodon) using the same patterns with minimal
new abstractions, then a third where extracting a shared library
materially simplifies things.

**What would refute:** The second backend needs primitives the CiviCRM
design didn't anticipate (different auth model, different query
language, different metadata shape) and the abstraction either becomes
leaky or requires backend-specific escape hatches that defeat the point.

**Why we're not acting on this yet:**
- Premature abstraction creates worse code than the concrete version.
- The "Rule of Three" — wait until three independent examples exist
  before extracting a shared abstraction.
- Existing projects in this space (`openapi-mcp-server`, GraphQL→MCP
  bridges) cover the well-specified-API niche; our pattern would compete
  in the "richly-introspectable proprietary API" niche, which has fewer
  examples to learn from.

**Next data point:** If/when Robin or someone else starts building
another similar MCP server and finds themselves copy-pasting
`PromiseCache`, `wrapHandler`, and the dispatcher tools, that's the
signal to extract.

**Raised by:** Robin, 2026-06-11, during civi-mcp Phase 1 execution
(Task 1 done).
