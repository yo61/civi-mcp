/**
 * Zod schema for CiviCRM APIv4 where clauses.
 *
 * Belongs to the MCP bounded context — this is the input-validation
 * shape used by `civicrm_get` and `civicrm_count`. It mirrors the
 * `WhereClause` value object in the Civi context but is defined
 * independently so the MCP layer owns its own input contract.
 *
 * A where clause is either:
 *   - a field clause `[field, op, value]`
 *   - a logical group `["AND" | "OR" | "NOT", [clause, clause, ...]]`
 *
 * Groups nest recursively.
 */
import { z } from "zod";

const FieldClauseSchema = z.tuple([z.string(), z.string(), z.unknown()]);

export type WhereClause =
  | z.infer<typeof FieldClauseSchema>
  | readonly ["AND" | "OR" | "NOT", readonly WhereClause[]];

export const WhereClauseSchema: z.ZodType<WhereClause> = z.union([
  FieldClauseSchema,
  z.tuple([z.enum(["AND", "OR", "NOT"]), z.lazy(() => z.array(WhereClauseSchema))]),
]);
