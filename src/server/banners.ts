import type { PrismaClient, TrackedShow } from "@prisma/client";
import type { ArtworkSource } from "./tvmaze";

const day = 86_400_000;

// Called within the existing owner's mutation lock, never during page reads.
export async function refreshArtwork(db: PrismaClient, source: ArtworkSource, show: TrackedShow, now: Date) {
  if (show.bannerNextCheckAt && show.bannerNextCheckAt > now) return;
  let artwork = { bannerUrl: show.bannerUrl, backgroundUrl: show.backgroundUrl }, delay = 7 * day;
  try { artwork = await source.artwork(show.tvmazeId); }
  catch { delay = day; }
  await db.trackedShow.update({ where: { id: show.id }, data: { ...artwork, bannerNextCheckAt: new Date(now.getTime() + delay) } });
}
