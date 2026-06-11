import { describe, expect, it } from "vitest";
import {
  CiviError,
  CiviAuthError,
  CiviApiError,
  CiviTransportError,
} from "../../src/civi/errors.js";

describe("CiviError hierarchy", () => {
  it("CiviAuthError carries status and message", () => {
    const e = new CiviAuthError("invalid bearer", { status: 401 });
    expect(e).toBeInstanceOf(CiviError);
    expect(e.name).toBe("CiviAuthError");
    expect(e.status).toBe(401);
  });

  it("CiviApiError carries entity, action, and Civi error code", () => {
    const e = new CiviApiError("unknown field 'foo'", {
      entity: "Contact",
      action: "get",
      errorCode: "unknown_field",
    });
    expect(e.entity).toBe("Contact");
    expect(e.action).toBe("get");
    expect(e.errorCode).toBe("unknown_field");
  });

  it("CiviTransportError captures cause", () => {
    const cause = new Error("ECONNREFUSED");
    const e = new CiviTransportError("network failure", { cause });
    expect(e.cause).toBe(cause);
  });

  it("each subclass is distinguishable via instanceof", () => {
    const a = new CiviAuthError("a");
    const b = new CiviApiError("b", { entity: "X", action: "get" });
    expect(a).toBeInstanceOf(CiviAuthError);
    expect(a).not.toBeInstanceOf(CiviApiError);
    expect(b).toBeInstanceOf(CiviApiError);
  });
});
