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
import type { ApiKey, ApiV4Envelope, EntitySummary } from "./types.js";

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
