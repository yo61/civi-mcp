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
