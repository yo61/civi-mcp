/**
 * Civi4Client — the Anti-Corruption Layer between our domain and CiviCRM's
 * APIv4 wire format. Every quirk of the upstream (snake_case keys,
 * is_error envelope, data_type strings, options/suffixes arrays) dies at
 * this boundary; consumers (the MCP tools) see only value objects from
 * `./types.js`.
 *
 * Acts as a generic repository: one method per APIv4 verb, parameterised
 * by entity name. We deliberately do not model CiviCRM's entities
 * (Contact, Membership, Contribution) here — Civi owns its entity model
 * and our job is to pass-through, not duplicate.
 */
import { PromiseCache } from "./cache.js";
import { postJson } from "./http.js";
import type { ApiKey, ApiV4Envelope, EntityDescribe, EntitySummary, Field } from "./types.js";

export type Civi4ClientOptions = {
  baseUrl: URL;
  apiKey: ApiKey;
  authxPath?: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
};

const ENTITY_LIST_KEY = "__entities__";

export class Civi4Client {
  readonly #baseUrl: URL;
  readonly #apiKey: ApiKey;
  readonly #authxPath: string;
  readonly #timeoutMs: number;
  readonly #fetcher: typeof fetch;
  readonly #entityListCache = new PromiseCache<string, readonly EntitySummary[]>();
  readonly #describeCache = new PromiseCache<string, EntityDescribe>();

  constructor(options: Civi4ClientOptions) {
    this.#baseUrl = options.baseUrl;
    this.#apiKey = options.apiKey;
    this.#authxPath = options.authxPath ?? "/civicrm/authx/api4";
    this.#timeoutMs = options.timeoutMs ?? 30_000;
    this.#fetcher = options.fetcher ?? fetch;
  }

  async listEntities(): Promise<readonly EntitySummary[]> {
    return this.#entityListCache.getOrLoad(ENTITY_LIST_KEY, async () => {
      const env = await this.#call<ApiV4Envelope<EntitySummary>>("Entity", "get", {});
      return env.values.map((v) => ({
        name: v.name,
        title: v.title,
        description: v.description,
        ...(v.abstract !== undefined ? { abstract: v.abstract } : {}),
      }));
    });
  }

  async describe(entity: string, opts: { refresh?: boolean } = {}): Promise<EntityDescribe> {
    if (opts.refresh) this.#describeCache.invalidate(entity);
    return this.#describeCache.getOrLoad(entity, async () => {
      const [fieldsEnv, actionsEnv] = await Promise.all([
        this.#call<ApiV4Envelope<RawField>>(entity, "getFields", {}),
        this.#call<ApiV4Envelope<{ name: string }>>(entity, "getActions", {}),
      ]);
      return mapDescribe(
        entity,
        fieldsEnv.values,
        actionsEnv.values.map((a) => a.name),
      );
    });
  }

  async #call<T>(entity: string, action: string, params: Record<string, unknown>): Promise<T> {
    const url = new URL(`${this.#authxPath.replace(/\/$/, "")}/${entity}/${action}`, this.#baseUrl);
    return postJson<T>({
      url,
      apiKey: this.#apiKey,
      body: { params },
      timeoutMs: this.#timeoutMs,
      fetcher: this.#fetcher,
      entity,
      action,
    });
  }
}

type RawField = {
  name: string;
  data_type: string;
  title?: string;
  description?: string;
  required?: boolean;
  fk_entity?: string;
  options?: ReadonlyArray<{ id: string | number; name: string; label: string }>;
  suffixes?: readonly string[];
  custom_field_id?: number;
  custom_group?: { name: string };
  custom_field_name?: string;
};

const STANDARD_QUERY_HINTS = [
  "Filter by pseudo-constant name: ['status_id:name','=','Current']",
  "Date format: 'YYYY-MM-DD'",
  "Join via dot-notation in select: ['contact_id.display_name']",
  "Logical groups: ['AND', [[...],[...]]]; default top-level is AND",
] as const;

const mapField = (raw: RawField): Field => ({
  name: raw.name,
  type: raw.data_type,
  required: raw.required === true,
  ...(raw.title !== undefined ? { title: raw.title } : {}),
  ...(raw.description !== undefined ? { description: raw.description } : {}),
  ...(raw.fk_entity !== undefined ? { fkEntity: raw.fk_entity } : {}),
  ...(raw.options && raw.options.length > 0
    ? {
        pseudoconstant: {
          queryByName: `${raw.name}:name`,
          queryByLabel: `${raw.name}:label`,
          values: raw.options,
        },
      }
    : {}),
  ...(raw.custom_group && raw.custom_field_name
    ? {
        custom: {
          groupName: raw.custom_group.name,
          fieldName: raw.custom_field_name,
        },
      }
    : {}),
});

const mapDescribe = (
  entity: string,
  fields: readonly RawField[],
  actions: readonly string[],
): EntityDescribe => ({
  entity,
  description: "",
  actions,
  primaryKey: ["id"],
  fields: fields.map(mapField),
  queryHints: STANDARD_QUERY_HINTS,
});
