import { describe, expect, it } from "vitest";
import { Civi4Client } from "../../src/civi/client.js";
import { asApiKey } from "../../src/civi/types.js";

const ENABLED =
  process.env["CIVI_INTEGRATION"] === "1" &&
  process.env["CIVI_BASE_URL"] !== undefined &&
  process.env["CIVI_API_KEY"] !== undefined;

const d = ENABLED ? describe : describe.skip;

d("Civi4Client against a real Civi (env-gated)", () => {
  // Lazy construction — describe body runs at discovery time even for
  // describe.skip, so we can't unconditionally call `new URL(undefined)`.
  const client = ENABLED
    ? new Civi4Client({
        baseUrl: new URL(process.env["CIVI_BASE_URL"]!),
        apiKey: asApiKey(process.env["CIVI_API_KEY"]!),
      })
    : (undefined as unknown as Civi4Client);

  it("lists at least the Contact entity", async () => {
    const entities = await client.listEntities();
    expect(entities.map((e) => e.name)).toContain("Contact");
  });

  it("describes Contact and finds contact_type with a pseudoconstant", async () => {
    const describeResult = await client.describe("Contact");
    const contactType = describeResult.fields.find((f) => f.name === "contact_type");
    expect(contactType?.pseudoconstant).toBeDefined();
  });

  it("counts active individuals (smoke test, exact number not asserted)", async () => {
    const result = await client.count("Contact", [
      ["contact_type", "=", "Individual"],
      ["is_deleted", "=", 0],
    ]);
    expect(result.count).toBeGreaterThanOrEqual(0);
  });
});
