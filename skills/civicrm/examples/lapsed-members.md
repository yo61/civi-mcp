# Example — Recently lapsed members

**User asks:** "Show me members whose memberships lapsed in the last 30 days."

## Walk-through

1. **Compute the date window** in the site's timezone (ask the user if
   ambiguous): 30 days ago = `YYYY-MM-DD`.

2. **Query:**

    ```
    civicrm_get(
      entity: "Membership",
      where: [
        ["status_id:name","IN",["Expired","Cancelled"]],
        ["end_date",">=","<30-days-ago>"],
        ["end_date","<=","<today>"]
      ],
      select: ["contact_id.display_name", "membership_type_id:name", "end_date"],
      orderBy: { "end_date": "DESC" },
      limit: 100
    )
    ```

## Notes

- Use `status_id:name IN ["Expired","Cancelled"]` rather than guessing
  numeric ids.
- `end_date` is in the site timezone. Adjust the bounds if the user is
  asking from a different timezone.
