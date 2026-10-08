// Local visual-check seed: a synthetic ADMIN owner with a session cookie, two followed
// catalog shows with upcoming episodes and an active calendar binding. Disposable
// local PostgreSQL only; no Google requests. Cookie: next-auth.session-token=<token>.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
if (!/127\.0\.0\.1|localhost/.test(process.env.DATABASE_URL ?? "")) throw new Error("local database only");
const token = "vis-dev-session-token-0123456789abcdef0123456789abcdef";
const expires = new Date(Date.now() + 7 * 86400e3);
await db.user.upsert({ where: { id: "owner" }, update: { role: "ADMIN", accessStatus: "ACTIVE" }, create: { id: "owner", email: "owner@example.test", name: "Owner", role: "ADMIN", accessStatus: "ACTIVE" } });
await db.session.upsert({ where: { sessionToken: token }, update: { expires }, create: { userId: "owner", sessionToken: token, expires } });
let account = await db.account.findFirst({ where: { userId: "owner", provider: "google" } });
if (!account) account = await db.account.create({ data: { userId: "owner", type: "oauth", provider: "google", providerAccountId: "synthetic-owner", access_token: "never-serialize-access", refresh_token: "never-serialize-refresh" } });
await db.userPreferences.upsert({ where: { userId: "owner" }, update: {}, create: { userId: "owner", agendaMonths: 2 } });
const day = (offset) => new Date(Date.now() + offset * 86400e3).toISOString().slice(0, 10);
const shows = [
  { tvmazeId: 59401, title: "Slow Horses", year: "2022", platform: "Apple TV+", country: "United Kingdom", status: "Running", genres: ["Drama", "Thriller"], runtime: 50,
    summary: "A team of British intelligence agents serve in a dumping ground department of MI5 known as Slough House.",
    episodes: [[5, 1, "Hello Goodbye", 2], [5, 2, "Bad Dates", 9], [5, 3, "Returns", 16]] },
  { tvmazeId: 41007, title: "Severance", year: "2022", platform: "Apple TV+", country: "United States", status: "To Be Determined", genres: ["Drama", "Science-Fiction"], runtime: 55,
    summary: "Mark leads a team of office workers whose memories have been surgically divided between their work and personal lives.",
    episodes: [[3, 1, "Goodbye, Mrs. Selvig", 5]] },
];
for (const s of shows) {
  const show = await db.catalogShow.upsert({ where: { tvmazeId: s.tvmazeId }, update: {}, create: {
    tvmazeId: s.tvmazeId, title: s.title, sourceUrl: `https://www.tvmaze.com/shows/${s.tvmazeId}`, year: s.year, platform: s.platform, country: s.country,
    status: s.status, summaryText: s.summary, genresJson: JSON.stringify(s.genres), runtimeMinutes: s.runtime, lastAttemptAt: new Date(), lastSuccessAt: new Date() } });
  for (const [season, number, title, offset] of s.episodes) {
    const sourceId = s.tvmazeId * 100 + season * 10 + number;
    await db.catalogEpisode.upsert({ where: { catalogShowId_sourceId: { catalogShowId: show.id, sourceId } }, update: { airdate: day(offset) }, create: {
      catalogShowId: show.id, sourceId, title, season, number, airdate: day(offset), sourceUrl: `https://www.tvmaze.com/episodes/${sourceId}`, summaryText: `Episode ${number} of season ${season}.` } });
  }
  await db.userFollow.upsert({ where: { userId_catalogShowId: { userId: "owner", catalogShowId: show.id } }, update: {}, create: { userId: "owner", catalogShowId: show.id, trying: s.tvmazeId === 41007, lastAttemptAt: new Date(), lastSuccessAt: new Date() } });
}
const binding = await db.calendarBinding.findFirst({ where: { userId: "owner", status: "ACTIVE" } }) ?? await db.calendarBinding.create({ data: {
  userId: "owner", accountId: account.id, calendarId: "when2watch-dev@group.calendar.google.com", status: "ACTIVE", provenance: "APP_CREATED",
  summary: "When2Watch", timeZone: "Europe/Amsterdam", accessRole: "owner", defaultRemindersJson: JSON.stringify([{ method: "popup", minutes: 540 }]), confirmedAt: new Date() } });
const first = await db.catalogEpisode.findFirst({ where: { show: { tvmazeId: 59401 }, number: 1 } });
if (first) await db.calendarEventLink.upsert({ where: { bindingId_catalogEpisodeId: { bindingId: binding.id, catalogEpisodeId: first.id } }, update: {}, create: {
  userId: "owner", bindingId: binding.id, catalogEpisodeId: first.id, calendarId: binding.calendarId, eventId: "dev-event-1", status: "created", desiredJson: "{}", confirmedDesiredHash: "x", lastDate: first.airdate } });
console.log("seeded; cookie next-auth.session-token=" + token);
await db.$disconnect();
