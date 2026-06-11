import { describe, expect, it, vi } from "vitest";
import { CiviApiError, CiviAuthError, CiviTransportError } from "../../src/civi/errors.js";
import { wrapHandler } from "../../src/mcp/errors-to-result.js";

const fakeLog = { error: vi.fn() };

const okHandler = async () => ({ content: [{ type: "text" as const, text: "ok" }] });

const throwAuth = async () => {
  throw new CiviAuthError("Authentication failed (401)", { status: 401 });
};

const throwApi = async () => {
  throw new CiviApiError("unknown field 'foo'", {
    entity: "Contact",
    action: "get",
    errorCode: "unknown_field",
  });
};

const throwTransport = async () => {
  throw new CiviTransportError("ECONNREFUSED");
};

const throwUnexpected = async () => {
  throw new TypeError("kaboom");
};

describe("wrapHandler", () => {
  it("passes through successful results unchanged", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrapped = wrapHandler("t", okHandler, fakeLog as any);
    const out = await wrapped({});
    expect(out.isError).toBeUndefined();
    expect(out.content[0]).toEqual({ type: "text", text: "ok" });
  });

  it("converts CiviAuthError to isError result with a clear message", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrapped = wrapHandler("civicrm_get", throwAuth, fakeLog as any);
    const out = await wrapped({});
    expect(out.isError).toBe(true);
    expect(out.content[0]?.text).toMatch(/Authentication failed/);
    expect(fakeLog.error).toHaveBeenCalled();
  });

  it("includes entity/action context for CiviApiError", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrapped = wrapHandler("civicrm_get", throwApi, fakeLog as any);
    const out = await wrapped({});
    expect(out.isError).toBe(true);
    expect(out.content[0]?.text).toMatch(/Contact\.get/);
    expect(out.content[0]?.text).toMatch(/unknown field 'foo'/);
  });

  it("converts CiviTransportError to isError without leaking internals", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrapped = wrapHandler("civicrm_get", throwTransport, fakeLog as any);
    const out = await wrapped({});
    expect(out.isError).toBe(true);
    expect(out.content[0]?.text).toMatch(/transport/i);
  });

  it("converts unexpected errors to a generic isError result and logs them", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrapped = wrapHandler("civicrm_get", throwUnexpected, fakeLog as any);
    const out = await wrapped({});
    expect(out.isError).toBe(true);
    expect(out.content[0]?.text).toMatch(/internal error/i);
    expect(fakeLog.error).toHaveBeenCalled();
  });
});
