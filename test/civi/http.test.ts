import { describe, expect, it, vi } from "vitest";
import { postJson } from "../../src/civi/http.js";
import { CiviApiError, CiviAuthError, CiviTransportError } from "../../src/civi/errors.js";

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

type FetchFn = typeof fetch;

describe("postJson", () => {
  it("issues a POST with Bearer auth and JSON body, returns parsed JSON", async () => {
    const fetcher = vi.fn<FetchFn>(async () => ok({ values: [{ id: 1 }], count: 1 }));
    const result = await postJson({
      url: new URL("https://civi.example.org/civicrm/authx/api4/Contact/get"),
      apiKey: "test-key",
      body: { params: { limit: 1 } },
      timeoutMs: 1000,
      fetcher,
    });
    expect(result).toEqual({ values: [{ id: 1 }], count: 1 });
    const firstCall = fetcher.mock.calls[0];
    expect(firstCall).toBeDefined();
    const [calledUrl, init] = firstCall!;
    expect(calledUrl.toString()).toMatch(/Contact\/get$/);
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer test-key");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["X-Requested-With"]).toBe("XMLHttpRequest");
    expect(JSON.parse(init?.body as string)).toEqual({ params: { limit: 1 } });
  });

  it("throws CiviAuthError on 401", async () => {
    const fetcher = vi.fn<FetchFn>(async () => new Response("unauthorised", { status: 401 }));
    await expect(
      postJson({
        url: new URL("https://civi.example.org/p"),
        apiKey: "k",
        body: {},
        timeoutMs: 1000,
        fetcher,
      }),
    ).rejects.toBeInstanceOf(CiviAuthError);
  });

  it("throws CiviApiError when payload is_error=1", async () => {
    const fetcher = vi.fn<FetchFn>(async () =>
      ok({
        is_error: 1,
        error_message: "unknown field 'foo'",
        error_code: "unknown_field",
      }),
    );
    const promise = postJson({
      url: new URL("https://civi.example.org/civicrm/authx/api4/Contact/get"),
      apiKey: "k",
      body: {},
      timeoutMs: 1000,
      fetcher,
      entity: "Contact",
      action: "get",
    });
    await expect(promise).rejects.toBeInstanceOf(CiviApiError);
    await expect(promise).rejects.toMatchObject({
      entity: "Contact",
      action: "get",
    });
  });

  it("throws CiviTransportError on fetch failure", async () => {
    const fetcher = vi.fn<FetchFn>(async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(
      postJson({
        url: new URL("https://civi.example.org/p"),
        apiKey: "k",
        body: {},
        timeoutMs: 1000,
        fetcher,
      }),
    ).rejects.toBeInstanceOf(CiviTransportError);
  });

  it("aborts on timeout", async () => {
    const fetcher = vi.fn<FetchFn>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    await expect(
      postJson({
        url: new URL("https://civi.example.org/p"),
        apiKey: "k",
        body: {},
        timeoutMs: 5,
        fetcher,
      }),
    ).rejects.toBeInstanceOf(CiviTransportError);
  });
});
