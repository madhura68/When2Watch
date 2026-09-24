import type { PrismaClient, TrackedShow } from "@prisma/client";
import type { BannerSource } from "./tvmaze";

const day = 86_400_000;

// Called within the existing owner's mutation lock, never during page reads.
export async function refreshBanner(db: PrismaClient, source: BannerSource, show: TrackedShow, now: Date) {
  if (show.bannerNextCheckAt && show.bannerNextCheckAt > now) return;
  let bannerUrl = show.bannerUrl, delay = 7 * day;
  try { bannerUrl = await source.banner(show.tvmazeId); }
  catch { delay = day; }
  await db.trackedShow.update({ where: { id: show.id }, data: { bannerUrl, bannerNextCheckAt: new Date(now.getTime() + delay) } });
}
