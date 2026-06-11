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
