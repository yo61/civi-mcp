import { vi } from "vitest";

export type RouteMap = Record<string, unknown>; // "Entity/action" -> response body

export const mockFetch = (routes: RouteMap) =>
  vi.fn<typeof fetch>(async (input) => {
    const url =
      typeof input === "string" || input instanceof URL ? new URL(input.toString()) : input.url;
    const target = typeof url === "string" ? new URL(url) : url;
    const match = target.pathname.match(/\/api4\/([^/]+)\/([^/]+)$/);
    if (!match) throw new Error(`mockFetch: unrecognised URL ${target.toString()}`);
    const key = `${match[1]}/${match[2]}`;
    const body = routes[key];
    if (body === undefined) throw new Error(`mockFetch: no route for ${key}`);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
