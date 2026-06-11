import { CiviApiError, CiviAuthError, CiviTransportError } from "./errors.js";

export type PostJsonInput = {
  url: URL;
  apiKey: string;
  body: unknown;
  timeoutMs: number;
  fetcher?: typeof fetch;
  entity?: string;
  action?: string;
};

const isErrorPayload = (
  value: unknown,
): value is { is_error: number; error_message?: string; error_code?: string } =>
  value !== null &&
  typeof value === "object" &&
  "is_error" in value &&
  (value as { is_error: unknown }).is_error === 1;

export const postJson = async <T>(input: PostJsonInput): Promise<T> => {
  const { url, apiKey, body, timeoutMs, entity, action } = input;
  const fetcher = input.fetcher ?? fetch;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (cause) {
    clearTimeout(timer);
    const message =
      cause instanceof Error ? `HTTP request failed: ${cause.message}` : "HTTP request failed";
    throw new CiviTransportError(message, { cause });
  }
  clearTimeout(timer);

  if (response.status === 401 || response.status === 403) {
    throw new CiviAuthError(`Authentication failed (${response.status})`, {
      status: response.status,
    });
  }

  // Clone before reading so the catch path can still inspect the body — the
  // original response is consumed by `.json()` whether it succeeds or throws.
  const peek = response.clone();
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (cause) {
    // Capture a snippet of the body so future misconfigurations (wrong authx
    // path → CiviCRM serves HTML dashboard; reverse proxy returning an error
    // page; site in maintenance mode) surface as actionable messages instead
    // of an opaque "not valid JSON".
    let snippet = "";
    try {
      const text = await peek.text();
      snippet = text.slice(0, 200).replace(/\s+/g, " ").trim();
    } catch {
      // ignore — clone body unreadable
    }
    const ct = response.headers.get("content-type") ?? "unknown";
    const detail = snippet ? ` body starts with: ${snippet}` : "";
    throw new CiviTransportError(`Response was not valid JSON (content-type: ${ct}).${detail}`, {
      cause,
    });
  }

  if (isErrorPayload(parsed)) {
    throw new CiviApiError(parsed.error_message ?? "APIv4 returned an error", {
      entity: entity ?? "unknown",
      action: action ?? "unknown",
      ...(parsed.error_code !== undefined ? { errorCode: parsed.error_code } : {}),
    });
  }

  if (!response.ok) {
    throw new CiviTransportError(`HTTP ${response.status}: ${response.statusText}`);
  }

  return parsed as T;
};
