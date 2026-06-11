import { describe, expect, it, vi } from "vitest";
import { PromiseCache } from "../../src/civi/cache.js";

describe("PromiseCache", () => {
  it("calls the loader once for the same key, deduplicating in-flight calls", async () => {
    const cache = new PromiseCache<string, number>();
    const loader = vi.fn(async () => 42);
    const [a, b] = await Promise.all([cache.getOrLoad("k", loader), cache.getOrLoad("k", loader)]);
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("re-uses cached resolved value", async () => {
    const cache = new PromiseCache<string, number>();
    const loader = vi.fn(async () => 1);
    await cache.getOrLoad("x", loader);
    await cache.getOrLoad("x", loader);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("evicts a rejected promise so the next call retries", async () => {
    const cache = new PromiseCache<string, number>();
    const loader = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce(7);
    await expect(cache.getOrLoad("k", loader)).rejects.toThrow("transient");
    await expect(cache.getOrLoad("k", loader)).resolves.toBe(7);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("invalidate() forces a fresh load", async () => {
    const cache = new PromiseCache<string, number>();
    const loader = vi.fn<() => Promise<number>>().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    expect(await cache.getOrLoad("k", loader)).toBe(1);
    cache.invalidate("k");
    expect(await cache.getOrLoad("k", loader)).toBe(2);
  });
});
