# Session Report — 2026-06-11

User question that exposed the issues:
> "How many members have pending contributions?"

## TL;DR — the headline bug

The HTTP body sent to CiviCRM APIv4 is malformed. **Every `where` clause, every
`select`, every `limit`, every `offset` is silently ignored by the server.**
`civicrm_count(Contribution, ...)` returned 1,686 for *every* filter I tried —
that number is the total Contribution count on the site, not a filtered count.

Smoke test confirming the bug from this session:

| Call | Returned |
|---|---|
| `civicrm_count(Contribution)` | 1686 |
| `civicrm_count(Contribution, where=[['contribution_status_id:name','=','Pending']])` | 1686 |
| `civicrm_count(Contribution, where=[['contribution_status_id','=',2]])` | 1686 |
| `civicrm_count(Contribution, where=[['contribution_status_id:name','=','Completed']])` | 1686 |

Same shape on `Membership`: any IN filter returned the full table.

## Where the bug is

`src/civi/http.ts:30-39` — request is sent as:

```ts
headers: { "Content-Type": "application/json", ... }
body: JSON.stringify(body)
```

…and `body` is built in `src/civi/client.ts:103-114` as `{ params }`. So the
wire payload becomes:

```json
{"params": {"where": [...], "select": [...], "limit": 500}}
```

CiviCRM's APIv4 AJAX endpoint at `/civicrm/ajax/api4/{Entity}/{action}` reads
`$_POST['params']` (or `$_REQUEST['params']`). With a raw JSON body, neither
superglobal gets populated, so PHP sees no `params` and APIv4 falls back to
defaults: no filter, no limit — return everything.

That perfectly explains the symptoms:
- `count` is always the full row count of the entity table.
- `values` arrays come back at the full size (e.g. the Contribution call
  returned all 1,686 rows even with `limit: 500`).
- `civicrm_list_entities` and `civicrm_describe_entity` still work because they
  legitimately pass no filter.

### The fix (one of)

**Option A — form-encoded** (matches what civix-generated extensions and the
upstream `CRM_Utils_REST` expect):

```ts
headers: {
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/x-www-form-urlencoded",
  "X-Requested-With": "XMLHttpRequest",
},
body: `params=${encodeURIComponent(JSON.stringify(body.params))}`,
```

**Option B — keep JSON, drop the wrapper.** APIv4 also accepts a raw JSON body
whose root *is* the params object (no `{params: ...}` wrapper) when
`Content-Type: application/json` is set, on more recent CiviCRM versions.
Cheaper to ship if it works on the target site, but less portable across
CiviCRM versions than Option A.

I'd ship Option A — it's what the AJAX endpoint has expected since 5.x and
it's documented.

## Why tests didn't catch this

`test/integration/live.test.ts:33-39` is the only live-server test that uses a
`where` clause:

```ts
const result = await client.count("Contact", [
  ["contact_type", "=", "Individual"],
  ["is_deleted", "=", 0],
]);
expect(result.count).toBeGreaterThanOrEqual(0);
```

This passes even when the filter is dropped, because the total contact count is
also `>= 0`. Strengthen this to a discriminating assertion:

```ts
const all = await client.count("Contact");
const individuals = await client.count("Contact", [["contact_type", "=", "Individual"]]);
const orgs = await client.count("Contact", [["contact_type", "=", "Organization"]]);
expect(individuals.count + orgs.count).toBeLessThanOrEqual(all.count);
expect(individuals.count).toBeLessThan(all.count); // proves filter applied
```

Or — better — assert pseudoconstant filtering on a known site fixture (e.g. one
Activity status named "Completed" that doesn't match every row).

The unit test at `test/civi/http.test.ts` won't catch this because it mocks
`fetch` and asserts on the request the *client* sent, not what the *server*
would accept. That's the right place to add a content-type/body-shape
regression assertion once the fix lands.

## Other things I noticed (smaller)

### `select` is dropped together with `where`

Same root cause, but worth calling out because the failure mode is sneaky: when
I asked for `select: ['contact_id']`, the server returned **full Contribution
rows** (~3.5 KB each instead of ~30 bytes), blowing up the tool result to 1.7 MB
and causing the harness to spill the response to disk. From an agent UX
perspective, `select` being broken is the most expensive failure mode —
it turns every query into a token bomb.

### `groupBy` is dropped together with `where`

I tried `groupBy: ['contact_id']` to get distinct contacts and got every
contribution row back. Same root cause.

### The tool descriptions are very good

`civicrm_describe_entity`'s mention of pseudoconstant suffixes
(`'status_id:name'`) and dot-notation joins is exactly the kind of hint that
let me write APIv4-correct queries on the first try. Keep this style — it's
much better than letting the agent guess.

### Tool-result truncation experience

When `civicrm_get` returns a too-large response, the harness saves it to a
file and instructs the agent to `grep` / chunk-read it. That recovery path
worked, but only because the failure mode was "too much data". If the
underlying bug had been "wrong data but small payload" (which is what the
1,686 `count` is), the file path wouldn't have helped. Worth considering:

- A tool-side hint when `select` is provided but the response size is wildly
  inconsistent with the requested column set (e.g. "you asked for 1 column but
  got 35 — the server may be ignoring `select`").
- Sanity-checking `count` against an entity's known cardinality range when one
  is cached from describe.

### Authentication / endpoint configuration looked clean

`config.ts` defaulting to `/civicrm/ajax/api4` and the recent commit
(`9d56255 fix(civi): default authx path is /civicrm/ajax/api4, surface body in
error`) means the transport is reaching the right URL. The bug is purely the
payload shape.

## Trace of what I tried (so you can reproduce)

1. `civicrm_describe_entity(Contribution)` ✓ — worked, returned full schema.
2. `civicrm_describe_entity(Membership)` ✓ — worked.
3. `civicrm_count(Contribution, where=[['contribution_status_id:name','=','Pending']])` → 1686. Treated as truth.
4. `civicrm_get(Contribution, where=[Pending], select=['contact_id'], groupBy=['contact_id'], limit=500)`. Got 1.7 MB. Suspected `select` was ignored; assumed `where`/`groupBy` still worked. **First mistake.** Should have sanity-checked `count` first.
5. Grepped the file → 1,302 distinct `contact_id`s. Built `where=[['contact_id','IN',<1302 ids>]]`.
6. `civicrm_count(Membership, where=[IN 1302 ids])` → 1368. Reported "1,368 memberships, need to dedupe to get distinct contacts."
7. `civicrm_get(Membership, where=[IN 1302 ids], select=['contact_id'], limit=500)` — 660 KB to file.
8. Grepped the file → 1,337 distinct `contact_id`s. **At this point I almost reported "1,337 members".**
9. You pushed back ("1,686 seems too high"). I checked: 479 of the 1,337 IDs aren't in the IN list. *That's impossible* unless `where` is being ignored.
10. `civicrm_count(Contribution)` → 1686. `civicrm_count(Contribution, where=[status_id=2])` → 1686. `civicrm_count(Membership)` → 1368. **Bug confirmed.**

## What I'd change in the agent's behavior

- After step 3, before building anything on top of the count, I should have run
  a no-filter `civicrm_count` and a *different* filter, just to confirm the
  filter discriminates. That's a ~2-token check that would have saved the
  whole detour.
- Anomaly at step 6/7 (the where IN clause returning huge files) was a hint I
  brushed past. "I asked for 1 column and got 1.7 MB" should be a hard stop.
- For "members with X" type questions, when no native MCP join is available,
  ask before committing to a multi-step intersection approach. You probably
  have a faster way (SQL, SearchKit) to answer this kind of question yourself.

## Recommended next actions

1. Fix `src/civi/http.ts` to send `params` in a shape CiviCRM actually reads
   (Option A above).
2. Strengthen the integration smoke test in `test/integration/live.test.ts`
   to assert that a filter actually filters (i.e. filtered count < unfiltered
   count).
3. Add a unit test in `test/civi/http.test.ts` that asserts request
   `Content-Type` and body shape, so this can't silently regress.
4. (Optional) Make `civicrm_get` log a warning when the returned row size is
   much larger than `select`'d columns would imply — defense in depth against
   the server ignoring `select`.
