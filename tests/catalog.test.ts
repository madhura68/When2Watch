import { afterEach, describe, expect, it } from "vitest";
import raw from "./fixtures/tvmaze/slow-horses.json";
import { ensureCatalogSnapshot, refreshFollowedCatalog, type CatalogSource } from "@/server/catalog";
import { parseSnapshot, type ShowArtwork, type Snapshot } from "@/server/tvmaze";
import { testDatabase } from "./database";
import { activeUser, installation } from "./fixtures/users";

let storage: ReturnType<typeof testDatabase>;
afterEach(async () => { await storage?.close(); });
const day = 86_400_000, now = new Date("2026-09-26T06:05:00Z");

function fakeSource(options: { index?: Map<number, number>; fail?: Set<number>; artwork?: ShowArtwork | Error; version?: number } = {}) {
  const calls: string[] = [];
  let input = structuredClone(raw) as typeof raw;
  const source: CatalogSource = {
    async snapshot(id): Promise<Snapshot> {
      calls.push(`snapshot:${id}`); await new Promise(r => setTimeout(r, 10));
      if (options.fail?.has(id)) throw new Error("TVmaze unavailable");
      // The snapshot's own version (TVmaze `updated`); unset here, so only the index decides what is applied.
      return parseSnapshot({ ...input, id, updated: options.version ?? null }, id);
    },
    async updates(since) { calls.push(`updates:${since ?? "all"}`); return options.index ?? new Map(); },
    async artwork() { calls.push("artwork"); if (options.artwork instanceof Error) throw options.artwork; return options.artwork ?? { bannerUrl: null, backgroundUrl: null }; },
  };
  return { source, calls, setInput: (next: typeof raw) => { input = next; }, options };
}

async function followed() {
  storage = testDatabase(); const db = storage.db;
  await activeUser(db, "a", { role: "ADMIN" }); await activeUser(db, "b"); await installation(db, "a");
  return db;
}

describe("catalog snapshots", () => {
  it("fetches a missing show once for two users and reuses a fresh complete snapshot", async () => {
    const db = await followed(), { source, calls } = fakeSource();
    const [a, b] = await Promise.all([ensureCatalogSnapshot(db, source, 45039, now), ensureCatalogSnapshot(db, source, 45039, now)]);
    expect(calls.filter(c => c.startsWith("snapshot"))).toHaveLength(1);
    expect(a.id).toBe(b.id);
    expect(await db.catalogEpisode.count({ where: { catalogShowId: a.id } })).toBeGreaterThan(0);
    await ensureCatalogSnapshot(db, source, 45039, new Date(+now + 30 * 60_000));
    expect(calls.filter(c => c.startsWith("snapshot"))).toHaveLength(1);
  });

  it("applies a complete snapshot atomically and marks only then missing episodes absent; a failure keeps old data", async () => {
    const db = await followed(), fake = fakeSource();
    const show = await ensureCatalogSnapshot(db, fake.source, 45039, now);
    const before = await db.catalogEpisode.findMany({ where: { catalogShowId: show.id }, orderBy: { sourceId: "asc" } });
    const shortened = structuredClone(raw); shortened._embedded.episodes = shortened._embedded.episodes.slice(0, -1);
    fake.setInput(shortened);
    await ensureCatalogSnapshot(db, fake.source, 45039, new Date(+now + 2 * 3600_000));
    const after = await db.catalogEpisode.findMany({ where: { catalogShowId: show.id }, orderBy: { sourceId: "asc" } });
    expect(after.filter(e => !e.present).map(e => e.sourceId)).toEqual([raw._embedded.episodes.at(-1)!.id]);
    fake.options.fail = new Set([45039]);
    await expect(ensureCatalogSnapshot(db, fake.source, 45039, new Date(+now + 4 * 3600_000))).rejects.toThrow();
    expect(await db.catalogEpisode.findMany({ where: { catalogShowId: show.id }, orderBy: { sourceId: "asc" } })).toEqual(after);
    expect((await db.catalogShow.findUniqueOrThrow({ where: { id: show.id } })).lastError).toBeTruthy();
    expect(before.length).toBe(after.length);
  });
});

describe("daily refresh of followed shows", () => {
  async function withFollow(db: Awaited<ReturnType<typeof followed>>, source: CatalogSource, tvmazeId: number, userId = "a") {
    const show = await ensureCatalogSnapshot(db, source, tvmazeId, new Date(+now - 2 * day));
    await db.userFollow.create({ data: { userId, catalogShowId: show.id } });
    return show;
  }

  it("uses the week feed after a recent check, the full index after more than six days, and fetches only changed shows", async () => {
    const db = await followed(), fake = fakeSource({ index: new Map([[45039, 1790000000]]) });
    await withFollow(db, fake.source, 45039); await withFollow(db, fake.source, 44776);
    fake.calls.length = 0;
    const first = await refreshFollowedCatalog(db, fake.source, now);
    expect(fake.calls[0]).toBe("updates:all");
    expect(fake.calls.filter(c => c.startsWith("snapshot"))).toEqual(["snapshot:45039"]);
    expect(first).toMatchObject({ fetched: 1, failed: 0 });
    expect(await db.catalogShow.findUniqueOrThrow({ where: { tvmazeId: 45039 } })).toMatchObject({ observedSourceUpdatedAt: 1790000000, appliedSourceUpdatedAt: 1790000000 });
    fake.calls.length = 0;
    await refreshFollowedCatalog(db, fake.source, new Date(+now + day));
    expect(fake.calls[0]).toBe("updates:week");
    expect(fake.calls.filter(c => c.startsWith("snapshot"))).toEqual([]);
    await db.installation.update({ where: { id: "singleton" }, data: { catalogIndexCheckedAt: new Date(+now - 7 * day) } });
    fake.calls.length = 0;
    await refreshFollowedCatalog(db, fake.source, new Date(+now + day));
    expect(fake.calls[0]).toBe("updates:all");
  });

  it("raises applied only after a complete snapshot and retries a failed show even when the index check succeeded", async () => {
    const db = await followed(), fake = fakeSource({ index: new Map([[45039, 1790000000]]) });
    await withFollow(db, fake.source, 45039);
    fake.options.fail = new Set([45039]);
    const result = await refreshFollowedCatalog(db, fake.source, now);
    expect(result).toMatchObject({ fetched: 0, failed: 1, errors: [{ tvmazeId: 45039 }] });
    expect(await db.catalogShow.findUniqueOrThrow({ where: { tvmazeId: 45039 } })).toMatchObject({ observedSourceUpdatedAt: 1790000000, appliedSourceUpdatedAt: null });
    fake.options.fail = new Set(); fake.options.index = new Map();
    fake.calls.length = 0;
    await refreshFollowedCatalog(db, fake.source, new Date(+now + day));
    expect(fake.calls).toContain("snapshot:45039");
    expect((await db.catalogShow.findUniqueOrThrow({ where: { tvmazeId: 45039 } })).appliedSourceUpdatedAt).toBe(1790000000);
  });

  it("checks every followed show fully at least weekly, ignores unfollowed shows and blocked users' follows", async () => {
    const db = await followed(), fake = fakeSource();
    await withFollow(db, fake.source, 45039);
    const orphan = await ensureCatalogSnapshot(db, fake.source, 1, new Date(+now - 10 * day));
    await withFollow(db, fake.source, 2, "b");
    await db.user.update({ where: { id: "b" }, data: { accessStatus: "BLOCKED" } });
    await db.catalogShow.updateMany({ data: { lastFullCheckAt: new Date(+now - 8 * day) } });
    fake.calls.length = 0;
    await refreshFollowedCatalog(db, fake.source, now);
    expect(fake.calls.filter(c => c.startsWith("snapshot"))).toEqual(["snapshot:45039"]);
    expect(orphan.tvmazeId).toBe(1);
  });

  it("looks for artwork at most weekly, remembers absence, and never lets an artwork error block episodes", async () => {
    const db = await followed(), fake = fakeSource({ artwork: new Error("images down"), index: new Map([[45039, 1790000000]]) });
    await withFollow(db, fake.source, 45039);
    await db.catalogShow.updateMany({ data: { artworkNextCheckAt: null } });
    const result = await refreshFollowedCatalog(db, fake.source, now);
    expect(result).toMatchObject({ fetched: 1, failed: 0 });
    expect((await db.catalogShow.findUniqueOrThrow({ where: { tvmazeId: 45039 } })).artworkNextCheckAt).toEqual(new Date(+now + day));
    fake.options.artwork = { bannerUrl: null, backgroundUrl: null };
    await refreshFollowedCatalog(db, fake.source, new Date(+now + day));
    expect((await db.catalogShow.findUniqueOrThrow({ where: { tvmazeId: 45039 } })).artworkNextCheckAt).toEqual(new Date(+now + 8 * day));
    fake.calls.length = 0;
    await refreshFollowedCatalog(db, fake.source, new Date(+now + 2 * day));
    expect(fake.calls).not.toContain("artwork");
  });
});
