import { describe, expect, it } from "vitest";
import { Civi4Client } from "../../src/civi/client.js";
import { asApiKey } from "../../src/civi/types.js";
import membershipActions from "../helpers/fixtures/membership-getActions.json" with { type: "json" };
import membershipFields from "../helpers/fixtures/membership-getFields.json" with { type: "json" };
import { mockFetch } from "../helpers/mock-fetch.js";

const baseUrl = new URL("https://civi.example.org");

describe("Civi4Client.listEntities", () => {
  it("returns mapped entity summaries", async () => {
    const fetcher = mockFetch({
      "Entity/get": {
        values: [
          { name: "Contact", title: "Contact", description: "A contact", abstract: false },
          {
            name: "Membership",
            title: "Membership",
            description: "A membership",
            abstract: false,
          },
        ],
      },
    });
    const client = new Civi4Client({
      baseUrl,
      apiKey: asApiKey("k"),
      fetcher,
    });
    const entities = await client.listEntities();
    expect(entities).toHaveLength(2);
    expect(entities[0]?.name).toBe("Contact");
  });

  it("caches the entity list across calls", async () => {
    const fetcher = mockFetch({ "Entity/get": { values: [] } });
    const client = new Civi4Client({ baseUrl, apiKey: asApiKey("k"), fetcher });
    await client.listEntities();
    await client.listEntities();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("Civi4Client.describe", () => {
  it("merges getFields + getActions into an EntityDescribe", async () => {
    const fetcher = mockFetch({
      "Membership/getFields": membershipFields,
      "Membership/getActions": membershipActions,
    });
    const client = new Civi4Client({ baseUrl, apiKey: asApiKey("k"), fetcher });
    const d = await client.describe("Membership");

    expect(d.entity).toBe("Membership");
    expect(d.actions).toEqual(["get", "create", "update", "delete"]);
    expect(d.primaryKey).toEqual(["id"]);

    const status = d.fields.find((f) => f.name === "status_id");
    expect(status?.pseudoconstant?.queryByName).toBe("status_id:name");
    expect(status?.pseudoconstant?.values).toContainEqual({
      id: 2,
      name: "Current",
      label: "Current",
    });
    expect(status?.fkEntity).toBe("MembershipStatus");

    const custom = d.fields.find((f) => f.name === "custom_42");
    expect(custom?.custom?.groupName).toBe("MembershipDetails");
    expect(custom?.custom?.fieldName).toBe("RenewalSource");

    expect(d.queryHints).toContain("Date format: 'YYYY-MM-DD'");
  });

  it("caches describe results per entity, single-flight on concurrent calls", async () => {
    const fetcher = mockFetch({
      "Membership/getFields": membershipFields,
      "Membership/getActions": membershipActions,
    });
    const client = new Civi4Client({ baseUrl, apiKey: asApiKey("k"), fetcher });
    await Promise.all([client.describe("Membership"), client.describe("Membership")]);
    await client.describe("Membership");
    // Two calls total: one getFields, one getActions
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("refresh=true bypasses the cache", async () => {
    const fetcher = mockFetch({
      "Membership/getFields": membershipFields,
      "Membership/getActions": membershipActions,
    });
    const client = new Civi4Client({ baseUrl, apiKey: asApiKey("k"), fetcher });
    await client.describe("Membership");
    await client.describe("Membership", { refresh: true });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});

describe("Civi4Client.get", () => {
  it("passes where/select/limit through to APIv4 and returns mapped envelope", async () => {
    const fetcher = mockFetch({
      "Contact/get": {
        values: [{ id: 1, display_name: "Alice" }],
        count: 1,
      },
    });
    const client = new Civi4Client({ baseUrl, apiKey: asApiKey("k"), fetcher });
    const result = await client.get<{ id: number; display_name: string }>("Contact", {
      where: [["display_name", "LIKE", "Ali%"]],
      select: ["id", "display_name"],
      limit: 25,
    });
    expect(result.count).toBe(1);
    expect(result.values[0]?.display_name).toBe("Alice");
    const [, init] = fetcher.mock.calls[0]!;
    const body = JSON.parse(init?.body as string) as { params: Record<string, unknown> };
    expect(body.params).toMatchObject({
      where: [["display_name", "LIKE", "Ali%"]],
      select: ["id", "display_name"],
      limit: 25,
    });
  });

  it("does not include undefined params in the request body", async () => {
    const fetcher = mockFetch({ "Contact/get": { values: [], count: 0 } });
    const client = new Civi4Client({ baseUrl, apiKey: asApiKey("k"), fetcher });
    await client.get("Contact", {});
    const body = JSON.parse(fetcher.mock.calls[0]![1]?.body as string) as {
      params: Record<string, unknown>;
    };
    expect(Object.keys(body.params)).not.toContain("orderBy");
    expect(Object.keys(body.params)).not.toContain("groupBy");
  });
});
