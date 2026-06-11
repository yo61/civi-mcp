/**
 * Value objects of the Civi domain context.
 *
 * Every type in this file is an immutable value object: equality is by
 * attribute, not identity. Field names mirror CiviCRM APIv4's vocabulary
 * (pseudoconstant, fkEntity, customGroup) to keep the ubiquitous language
 * intact across the anti-corruption layer in `client.ts`.
 */

/**
 * Branded API key — prevents accidental interpolation into URLs/logs.
 * At runtime it's still a string; the brand exists only in the type system.
 * Modeled structurally rather than as a class to keep zero runtime cost
 * (the value is passed to fetch headers as-is).
 */
export type ApiKey = string & { readonly __brand: "ApiKey" };
export const asApiKey = (s: string): ApiKey => s as ApiKey;

export type LogicalOp = "AND" | "OR" | "NOT";

export type FieldClause = readonly [field: string, op: string, value: unknown];

export type LogicalClause = readonly [op: LogicalOp, clauses: readonly WhereClause[]];

export type WhereClause = FieldClause | LogicalClause;

export type OrderDirection = "ASC" | "DESC";

export type GetParams = {
  where?: readonly WhereClause[];
  select?: readonly string[];
  orderBy?: Readonly<Record<string, OrderDirection>>;
  limit?: number;
  offset?: number;
  groupBy?: readonly string[];
};

export type EntitySummary = {
  name: string;
  title: string;
  description: string;
  abstract?: boolean;
};

export type PseudoconstantValue = {
  id: string | number;
  name: string;
  label: string;
};

export type Pseudoconstant = {
  queryByName: string; // e.g. "status_id:name"
  queryByLabel: string; // e.g. "status_id:label"
  values: readonly PseudoconstantValue[];
};

export type CustomFieldRef = {
  groupName: string;
  fieldName: string;
};

export type Field = {
  name: string;
  type: string;
  title?: string;
  description?: string;
  required: boolean;
  fkEntity?: string;
  pseudoconstant?: Pseudoconstant;
  custom?: CustomFieldRef;
};

export type EntityDescribe = {
  entity: string;
  description: string;
  actions: readonly string[];
  primaryKey: readonly string[];
  fields: readonly Field[];
  queryHints: readonly string[];
};

export type ApiV4Envelope<T> = {
  values: readonly T[];
  count?: number;
  is_error?: 0;
};

export type ApiV4ErrorEnvelope = {
  is_error: 1;
  error_message: string;
  error_code?: string;
};
