# Example — Donations by month

**User asks:** "What were our completed donations by month last year?"

## Walk-through

1. **Describe `Contribution`** to confirm `contribution_status_id` and
   `financial_type_id` pseudo-constants.

2. **Query, grouping by month:**

    ```
    civicrm_get(
      entity: "Contribution",
      where: [
        ["contribution_status_id:name","=","Completed"],
        ["receive_date",">=","2025-01-01"],
        ["receive_date","<","2026-01-01"]
      ],
      select: ["MONTH(receive_date) AS month", "SUM(total_amount) AS total"],
      groupBy: ["month"],
      orderBy: { "month": "ASC" },
      limit: 12
    )
    ```

## Notes

- Filter to `financial_type_id:name = "Donation"` if "donations" must
  exclude member dues.
- For a year-on-year comparison, run the query for two date ranges and
  diff the results client-side.
