import { describe, expect, it } from "vitest";
import { Civi4Client } from "../../src/civi/client.js";
import { asApiKey } from "../../src/civi/types.js";
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
