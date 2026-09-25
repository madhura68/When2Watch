import { afterEach, expect, it } from "vitest";
import { adminStats, getFollowerCounts } from "@/server/admin-stats";
import { overview } from "@/server/overview";
import { purgeUser } from "@/server/privacy";
import { testDatabase } from "./database";
import { activeUser, installation } from "./fixtures/users";

let storage: ReturnType<typeof testDatabase>;
afterEach(async () => { await storage?.close(); });

it("counts distinct ACTIVE followers per show (Proberen once), drops blocked and deleted users, and is admin-only", async () => {
  storage = testDatabase(); const db = storage.db;
  await activeUser(db, "admin", { role: "ADMIN" }); await installation(db, "admin");
  for (const id of ["u1", "u2", "u3"]) await activeUser(db, id);
  const shows = await Promise.all([[45039, "Slow Horses"], [1, "Andor"]].map(([tvmazeId, title]) =>
    db.catalogShow.create({ data: { tvmazeId: tvmazeId as number, title: title as string, sourceUrl: "x", status: "Running" } })));
  await db.userFollow.createMany({ data: [
    { userId: "u1", catalogShowId: shows[0].id, trying: true }, { userId: "u2", catalogShowId: shows[0].id }, { userId: "u3", catalogShowId: shows[0].id },
    { userId: "u1", catalogShowId: shows[1].id }] });
  expect(await getFollowerCounts(db, "admin")).toEqual([{ tvmazeId: 45039, title: "Slow Horses", followers: 3 }, { tvmazeId: 1, title: "Andor", followers: 1 }]);

  await db.user.update({ where: { id: "u2" }, data: { accessStatus: "BLOCKED" } });
  await db.$transaction(tx => purgeUser(tx, "u1", new Date()));
  expect(await getFollowerCounts(db, "admin")).toEqual([{ tvmazeId: 45039, title: "Slow Horses", followers: 1 }]);

  await expect(getFollowerCounts(db, "u3")).rejects.toMatchObject({ status: 403 });
  await expect(adminStats(db, "u3")).rejects.toMatchObject({ status: 403 });
  expect(Object.keys((await adminStats(db, "admin")).tvmazeRequests)).toEqual(["since", "total", "search", "show", "updates", "other"]);
  // Ordinary responses never carry counts or other users.
  const own = JSON.stringify(await overview("u3", db, new Date()));
  expect(own).not.toMatch(/followers|u2|admin/);
});
