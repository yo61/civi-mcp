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
