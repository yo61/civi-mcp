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
  it("issues a POST with Bearer auth and form-encoded params, returns parsed JSON", async () => {
    const fetcher = vi.fn<FetchFn>(async () => ok({ values: [{ id: 1 }], count: 1 }));
    const result = await postJson({
      url: new URL("https://civi.example.org/civicrm/ajax/api4/Contact/get"),
      apiKey: "test-key",
      params: { limit: 1 },
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
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(headers["X-Requested-With"]).toBe("XMLHttpRequest");
    const body = init?.body as string;
    expect(body.startsWith("params=")).toBe(true);
    const sentParams = JSON.parse(decodeURIComponent(body.slice("params=".length))) as unknown;
    expect(sentParams).toEqual({ limit: 1 });
  });

  // Regression guard for the bug discovered during Task 22 hands-on testing:
  // CiviCRM's AJAX endpoint reads $_POST['params']. A raw JSON request body
  // (the previous implementation) means PHP sees no params and APIv4 returns
  // every row, ignoring where/select/limit/groupBy. The exact wire shape
  // tested here is the only thing keeping that regression from coming back.
  it("encodes complex params (where, select, limit, groupBy) intact via the form body", async () => {
    const fetcher = vi.fn<FetchFn>(async () => ok({ values: [], count: 0 }));
    const complex = {
      where: [["contribution_status_id:name", "=", "Pending"]],
      select: ["row_count"],
      limit: 25,
      groupBy: ["contact_id"],
    };
    await postJson({
      url: new URL("https://civi.example.org/civicrm/ajax/api4/Contribution/get"),
      apiKey: "k",
      params: complex,
      timeoutMs: 1000,
      fetcher,
    });
    const body = fetcher.mock.calls[0]?.[1]?.body as string;
    expect(body.startsWith("params=")).toBe(true);
    const sent = JSON.parse(decodeURIComponent(body.slice("params=".length))) as typeof complex;
    expect(sent).toEqual(complex);
  });

  it("throws CiviAuthError on 401", async () => {
    const fetcher = vi.fn<FetchFn>(async () => new Response("unauthorised", { status: 401 }));
    await expect(
      postJson({
        url: new URL("https://civi.example.org/p"),
        apiKey: "k",
        params: {},
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
      url: new URL("https://civi.example.org/civicrm/ajax/api4/Contact/get"),
      apiKey: "k",
      params: {},
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
        params: {},
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
        params: {},
        timeoutMs: 5,
        fetcher,
      }),
    ).rejects.toBeInstanceOf(CiviTransportError);
  });
});
