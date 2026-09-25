import { afterEach, describe, expect, it } from "vitest";
import { cachedSearch, searchKey } from "@/server/search-cache";
import type { Show } from "@/server/tvmaze";
import { testDatabase } from "./database";

let storage: ReturnType<typeof testDatabase>;
afterEach(async () => { await storage?.close(); });
const show = (id: number): Show => ({ id, name: `Show ${id}`, url: `https://www.tvmaze.com/shows/${id}`, year: null, poster: null, platform: null, country: null, status: "Running" });
function source(results: Show[] | Error = [show(45039)]) {
  const calls: string[] = [];
  return { calls, search: async (q: string) => { calls.push(q); await new Promise(r => setTimeout(r, 20)); if (results instanceof Error) throw results; return results; } };
}
const at = (minutes: number) => new Date(Date.UTC(2026, 8, 26, 10, minutes));

describe("search cache", () => {
  it("normalises trim, Unicode NFC, case and whitespace, without user identity", () => {
    expect(searchKey("  Slow   Horses ")).toBe("slow horses");
    expect(searchKey("Café Society")).toBe(searchKey("Café society"));
  });

  it("serves two users asking the same thing with one source request, keeping TVmaze's order", async () => {
    storage = testDatabase(); const db = storage.db, tvmaze = source([show(2), show(1)]);
    const [a, b] = await Promise.all([cachedSearch(db, tvmaze, "Slow Horses", at(0)), cachedSearch(db, tvmaze, "  slow horses", at(0))]);
    expect(tvmaze.calls).toHaveLength(1);
    expect(a.map(s => s.id)).toEqual([2, 1]); expect(b).toEqual(a);
    const row = await db.searchCache.findUniqueOrThrow({ where: { key: "slow horses" } });
    expect(row.expiresAt).toEqual(new Date(+at(0) + 3600_000));
    expect(JSON.stringify(row)).not.toMatch(/userId|owner/);
  });

  it("keeps results an hour, empty results ten minutes and never caches a failure", async () => {
    storage = testDatabase(); const db = storage.db;
    const hit = source();
    await cachedSearch(db, hit, "Slow Horses", at(0)); await cachedSearch(db, hit, "Slow Horses", at(59));
    expect(hit.calls).toHaveLength(1);
    await cachedSearch(db, hit, "Slow Horses", at(61));
    expect(hit.calls).toHaveLength(2);
    const empty = source([]);
    await cachedSearch(db, empty, "Nothing here", at(0)); await cachedSearch(db, empty, "Nothing here", at(9));
    expect(empty.calls).toHaveLength(1);
    await cachedSearch(db, empty, "Nothing here", at(11));
    expect(empty.calls).toHaveLength(2);
    const failing = source(new Error("TVmaze down"));
    await expect(cachedSearch(db, failing, "Broken query", at(0))).rejects.toThrow();
    await expect(cachedSearch(db, failing, "Broken query", at(0))).rejects.toThrow();
    expect(failing.calls).toHaveLength(2);
    expect(await db.searchCache.findUnique({ where: { key: "broken query" } })).toBeNull();
  });

  it("is capped at 1,000 entries by evicting expired and then oldest rows", async () => {
    storage = testDatabase(); const db = storage.db;
    await db.searchCache.createMany({ data: Array.from({ length: 1000 }, (_, i) => ({ key: `old ${i}`, resultJson: "[]", createdAt: new Date(+at(0) + i), expiresAt: new Date(+at(0) + 3600_000) })) });
    await cachedSearch(db, source(), "Newest", at(1));
    expect(await db.searchCache.count()).toBe(1000);
    expect(await db.searchCache.findUnique({ where: { key: "old 0" } })).toBeNull();
    expect(await db.searchCache.findUnique({ where: { key: "newest" } })).not.toBeNull();
  });

  it("does not let an aborted request of one client cancel the shared source request", async () => {
    storage = testDatabase(); const db = storage.db, tvmaze = source();
    const first = cachedSearch(db, tvmaze, "Slow Horses", at(0)).catch(() => "aborted");
    const second = await cachedSearch(db, tvmaze, "Slow Horses", at(0));
    await first;
    expect(second[0].id).toBe(45039); expect(tvmaze.calls).toHaveLength(1);
  });
});
