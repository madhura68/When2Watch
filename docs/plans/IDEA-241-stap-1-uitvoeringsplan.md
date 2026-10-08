---
title: "IDEA-241 — Uitvoeringsplan stap 1: Engels, afspraakmodel, landing, privacy en proefevent"
status: draft
version: "0.2"
date: "2026-10-08"
idea: IDEA-241
spec: docs/specs/IDEA-241-stap-1.md (v0.6, commit 4b3064985bb814f8e1326837173325e6868f9c4d)
source_commit: 1554c6a
last_updated: 2026-10-08
---

# IDEA-241 — Uitvoeringsplan stap 1

> **Voor agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (aanbevolen) of superpowers:executing-plans, taak voor taak. Iedere taak eindigt groen (`npm test`, `npm run typecheck`, `npm run build`; P6–P7 ook `npm run test:http`) en met een eigen commit.

**Doel:** When2Watch volledig Engels maken, het agenda-afspraakmodel verrijken (locatie, Engelse tekst, keuze All-day of Fixed time), een openbare landingpagina en Engels privacybeleid leveren, en het OAuth-consentscherm naar Production brengen, zodat JP's proefevent met melding op de iPhone bewezen is en een eerste genodigde zonder testgebruikerslijst kan koppelen.

**Architectuur:** één gedeelde instellingenlader en afspraak-factory voor sync, proef en overzicht; canonieke hash die bestaande hele-dagafspraken ongemoeid laat; tijdgebonden afspraken met expliciete offset en vast DST-beleid; PATCH-bodies die de ongebruikte vorm expliciet wissen; Engelse routes met tijdelijke redirects; landing en privacy als onaangemelde pagina's. De as-built R2-code op `origin/main` (`1554c6a`) is het uitgangspunt.

**Stack:** Next.js 16.3.6 (App Router), React 19, next-auth 4.24, Prisma 6.19 op PostgreSQL 17, Vitest, Node ≥ 24; max2-deploy via `deploy/README.md`.

**Spec:** `docs/specs/IDEA-241-stap-1.md` v0.6 (ProductDoc `specs/idea-241-stap-1`), goedgekeurd door JP op 8 oktober 2026 na review-loop (beide reviewers GO). Het plan beargumenteert vanuit de spec; executors lezen beide.

Versie 0.2 verwerkt ronde 1 van de review-loop (codex NO-GO 3 BLOCKER/1 MAJOR, claude NO-GO 1 BLOCKER/1 MAJOR/11 MINOR): DST-resolver met ±24-uurssampling, `readbackOwnEvents` met expliciete origin, legacy-readbacktest met vaste fixture, smoke-`aria-label` in P6, tijdzone-normalisatie die moderne IANA-namen bewaart, validatievolgorde, client/server-grens van het paneel, `agendaOverview`-aanroepers, cancelled-controle in de proef, geen parallelle lanes, `test:http` in P5, testbare datumhelpers, `robots` met `follow`, rollback via dump, en factory-details.

**Branch:** `claude/idea-241-stap-1` (bevat al spec, grill en dit plan). Alle taken committen daarop; één PR naar `main` aan het eind. Geen merge zonder opdracht van JP.

## Global Constraints

- Tests `npm test`, typecheck `npm run typecheck`, build `npm run build`; HTTP-proef `npm run test:http` (vereist `npm run test:db:up` en `W2W_TEST_DATABASE_URL=postgresql://postgres:w2w-local-test@127.0.0.1:55432/postgres`). CI (`.forgejo/workflows/ci.yml`) draait alles plus beide Docker-builds; A10.
- Secrets, databases en tokens blijven buiten Git en logs (`AGENTS.md`); geen tokens in evidence (A11).
- Deploy alleen de When2Watch-app via SSH naar max2; geen runnerwijzigingen. Geen merge, deploy of Cloud-Console-wijziging zonder aparte opdracht van JP.
- Alleen eigen, gemarkeerde agenda-items wijzigen: `assertOwned` in `sync.ts` en `calendar-probe.ts` blijven onaangetast; markers ongewijzigd.
- Google-scopes blijven `calendar.calendarlist.readonly` + `calendar.app.created` (`src/server/auth-policy.ts`); geen bredere scope.
- Taal: alle gebruikersgerichte tekst Engels; opmaak `en-GB`, 24-uurs (`hourCycle: "h23"`); datum-only waarden blijven in UTC opgemaakt (spec §3.1).
- Het syncvenster van 7 dagen en de bestaande reconciliatieregel blijven ongewijzigd (spec §2); geen "vanaf vandaag"-regel.
- Expand-only migratie; geen contract/destroy.
- Nieuwe UI-teksten in P1–P4 meteen in het Engels schrijven; bestaande Nederlandse teksten pas in P5–P7.

## Review Focus

Invoer die de spec impliceert maar waar geen bestaande test op staat; elke regel heeft zijn test in de genoemde taak.

1. Serie zonder `runtimeMinutes` onder Fixed time → afspraak van 60 minuten, niet 0 of een crash (P3, `episode-event.test.ts`).
2. `eventTime` in een DST-gat of -overlap (02:30 op 29 maart / 25 oktober 2026, `Europe/Amsterdam`) → één tijdstip volgens het vaste beleid, begin én einde (P3, `event-time.test.ts`).
3. Google geeft `dateTime` terug in de agendazone terwijl de afspraak een andere `timeZone` heeft → `eventDate` levert de datum in de afspraakzone, niet `slice(0,10)` (P3, `sync.test.ts`).
4. Een opgeslagen tijdzone die geen IANA-naam is (`+02:00`) → lader valt terug op `Europe/Amsterdam`, paneel waarschuwt, volgende save weigert (P2, `sync-settings.test.ts`; P1, `preferences.test.ts`).
5. Een oude `/uitnodiging#token=…`-link na de hernoeming → 307 naar `/invitation`, fragment behouden, token eenmalig bruikbaar (P6, smoke; handmatig in Safari/Chrome per A2).

## 1. Volgorde en afhankelijkheden

| Taak | Resultaat | Afhankelijk van | Omvang |
| --- | --- | --- | --- |
| P1 | Voorkeuren `eventMode`/`eventTime`, IANA-controle, export | — | M |
| P2 | Instellingenlader + factory, gedragsneutraal | P1 | M |
| P3 | Afspraakmodel: canonieke hash, offset/DST, `eventDate`, PATCH-contract, Engelse tekst, Fixed time, simulatoren | P2 | L |
| P4 | Proefevent met factory, inhoudscontrole, paneel | P3 | M |
| P5 | Engelse servermeldingen, labels, `DELETE`-contract | — | M |
| P6 | Engelse routes, redirects, navigatie, ankers | P5 | M |
| P7 | Engelse pagina's en panelen, datumopmaak, landing, privacy, A1-controle, smoke | P4, P6 | L |
| P8 | Runbook, evidence-sjabloon, README/deploy-notities | P7 | S |
| P9 | Uitrol, stap 0, praktijkbewijs, Production-consent (JP + agent) | P8 | — |

De taken zijn sequentieel: P5 raakt dezelfde bestanden als P1–P4 (`sync.ts:17`, `google-calendar.ts:38-45`, `calendar-probe.ts`, `privacy.ts`, de voorkeurenroute), dus parallelle lanes zijn niet veilig.

## 2. Taken

### P1 — Voorkeuren: `eventMode`, `eventTime`, IANA-tijdzone, export

**Doel:** de gebruiker kan All-day of Fixed time (met tijd) kiezen; tijdzones zijn IANA-namen; de export bevat de nieuwe velden (spec §4.4, §9, A5 deels, A12 deels).

**Bestanden**
- Wijzig: `prisma/schema.prisma` (model `UserPreferences`), `src/server/preferences.ts`, `src/app/api/settings/preferences/route.ts` (foutmelding), `src/app/settings/preferences-panel.tsx` (client component: ontvangt `invalidTimeZone: boolean` als prop, importeert geen servercode), `src/app/settings/page.tsx` (berekent `invalidTimeZone` server-side en geeft het door), `src/server/privacy.ts:19` (export-select), `src/server/calendar-settings.ts:6,114` (gebruikt `validTimeZone`).
- Maak: `prisma/migrations/20261008120000_idea241_event_style/migration.sql`, `src/lib/time-zone.ts` (Intl-only, bruikbaar in client en server), `tests/time-zone.test.ts`.
- Tests: `tests/preferences.test.ts` (shape-asserts op 11, 16, 17, 29 + nieuwe gevallen), `tests/user-isolation.test.ts:55`, `tests/privacy.test.ts:65`, `tests/calendar-settings.test.ts` (ongeldige zone bij aanmaak).

**Interfaces**
- Produceert (uit `src/server/preferences.ts`):
  ```ts
  export type EventMode = "ALL_DAY" | "FIXED_TIME";
  export type Preferences = { agendaMonths: AgendaMonths; timeZone: string; eventMode: EventMode; eventTime: string | null };
  // src/lib/time-zone.ts (re-exported by preferences.ts)
  export const EVENT_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
  /** IANA name as the user spelled it (case-corrected against Intl's list), or null for invalid input and offset forms (+02:00, UTC+2, GMT-5). */
  export function normalizeTimeZone(value: unknown): string | null;
  export const validTimeZone = (value: unknown): value is string => normalizeTimeZone(value) !== null;
  export async function getPreferences(userId: string, db?: PrismaClient): Promise<Preferences>;
  export async function savePreferences(userId: string, patch: unknown, db?: PrismaClient): Promise<Preferences>;
  ```

**Kwetsbaar contract (letterlijk overnemen)**
```ts
// src/lib/time-zone.ts
const known = new Map(Intl.supportedValuesOf("timeZone").map(z => [z.toLowerCase(), z]));
export function normalizeTimeZone(value: unknown): string | null {
  if (typeof value !== "string" || !value || value.length > 100 || value !== value.trim()) return null;
  let resolved: string;
  try { resolved = new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone; } catch { return null; }
  if (/^[+-]/.test(resolved) || /^(UTC|GMT)[+-]/.test(resolved)) return null;   // offset forms are not IANA names
  return known.get(value.toLowerCase()) ?? value;                                 // case-correct a known name; otherwise keep the user's spelling
}
```
Waarom zo: `resolvedOptions().timeZone` herschrijft moderne namen naar ICU-aliassen (`Asia/Kolkata` → `Asia/Calcutta`, `Europe/Kyiv` → `Europe/Kiev`, `Etc/UTC` → `UTC`); de gebruikersspelling gaat naar Google, dus die blijft bewaard. `Intl.supportedValuesOf` mist `UTC`, `Etc/UTC` en `Asia/Kolkata` op Node 24 en dient hier alleen voor hoofdlettercorrectie, nooit als geldigheidslijst. `tests/time-zone.test.ts`: `europe/amsterdam` → `Europe/Amsterdam`; `Asia/Kolkata`, `Europe/Kyiv`, `UTC`, `Etc/UTC` blijven zoals ingevoerd; `+02:00`, `UTC+2`, `GMT-5`, `Mars/Olympus` → `null`.

**Stappen**
1. Migratie: `CREATE TYPE "EventMode" AS ENUM ('ALL_DAY','FIXED_TIME'); ALTER TABLE "UserPreferences" ADD COLUMN "eventMode" "EventMode" NOT NULL DEFAULT 'ALL_DAY', ADD COLUMN "eventTime" TEXT;` plus de Prisma-velden `eventMode EventMode @default(ALL_DAY)` en `eventTime String?`. `npm run db:generate`.
2. `savePreferences`: eerst de vorm- en sleutelcontrole op de patch zelf, zónder database (zoals nu op `preferences.ts:19-23`; `tests/preferences.test.ts:22-23` roept zonder `db` aan en verwacht `INVALID_INPUT`, geen Prisma-initialisatie); daarna binnen `serializeCalendarMutation` de opgeslagen rij lezen en de **samengevoegde** toestand (`{ ...stored, ...patch }`) valideren: `agendaMonths` 1|2|3; `timeZone` via `normalizeTimeZone` (opslaan als genormaliseerde naam); `eventMode` in `ALL_DAY|FIXED_TIME`; `eventTime` `null` of `EVENT_TIME`; `FIXED_TIME` zonder `eventTime` → `INVALID_INPUT` (400). `eventTime` mag onder `ALL_DAY` gezet en bewaard blijven. Engelse foutmelding: "Choose a period of one, two or three months, a valid IANA time zone, and a time (HH:MM) for fixed-time events."
3. `getPreferences`: standaard `eventMode: "ALL_DAY"`, `eventTime: null`; opgeslagen zone ongewijzigd teruggeven (de lader in P2 valt terug).
4. Paneel: "Event style" met keuzerondjes All-day / Fixed time, `input type="time"` (standaard `20:00`, `step=60`), hulptekst uit spec §4.4; PATCH stuurt alle vier de sleutels; knop uit zolang niets wijzigt. `settings/page.tsx` berekent `invalidTimeZone = normalizeTimeZone(preferences.timeZone) === null` en geeft dat als prop; het paneel toont dan "Your saved time zone is not a valid IANA name; choose one from the list." Het paneel importeert alleen uit `@/lib/time-zone`, nooit uit `@/server/*` (anders trekt `npm run build` Prisma in de clientbundel).
5. Export (`privacy.ts:19`): `select: { agendaMonths, timeZone, eventMode, eventTime }`.
6. Tests: shape-asserts uitbreiden; nieuw: `+02:00` → 400, `UTC+2` → 400, `europe/amsterdam` → opgeslagen als `Europe/Amsterdam`, `UTC` geldig, `{ eventMode: "FIXED_TIME" }` zonder tijd → 400, `{ eventTime: "21:00" }` onder `ALL_DAY` → 200 en bewaard, terugwisselen behoudt `eventTime`, deelpatch `{ timeZone }` behoudt `eventMode`; agenda-aanmaak met `+02:00` → 400.

**Acceptatie:** A5 (400-gevallen), A12 (export). **Verificatie:** `npm test`, `npm run typecheck`, `npm run build`. **Commit:** `feat: event style and IANA time zone preferences`.

### P2 — Instellingenlader en afspraak-factory (gedragsneutraal)

**Doel:** één lader en één factory voor sync, proef en overzicht; origin op de servicegrens; geen gedragswijziging (spec §4.5, ronde-2/3-bevindingen).

**Bestanden**
- Maak: `src/server/sync-settings.ts`, `src/server/episode-event.ts`, `tests/sync-settings.test.ts`.
- Wijzig: `src/server/sync.ts` (verwijder `episodeEvent` en `markers`, importeer beide uit de factory-module; `SyncConfiguration` → `SyncSettings & { origin }`), `src/server/services.ts` (`currentSettings` vervangen), `src/server/overview.ts` (signatuur), `src/server/agenda.ts`, `src/app/page.tsx:14`, `src/app/volgen/page.tsx:13`, `src/app/api/shows/route.ts:24`, `src/server/calendar-probe.ts` (type), `scripts/migration/readback.ts:13,31,50` (`readbackOwnEvents` krijgt een `origin`-parameter; alleen `main` leest `config().origin`), `scripts/prove-calendar-recovery.ts:74`.
- Tests: iedere `SyncService`-, `CalendarProbeService`-, `overview(`- en `agendaOverview(`-aanroep in `tests/` (grep op alle vier; o.a. `sync.test.ts:39`, `shared-sync`, `banners.test.ts:43,91,92`, `agenda.test.ts:49,54,71,75`, `limited-calendar`, `idea219-acceptance`, `user-isolation`, `calendar-probe`, `admin-stats`, `migration/readback.test.ts:28,49`) krijgt volledige instellingen plus `origin: "https://when2watch.example.test"`; `cron.test.ts` construeert geen van deze.

**Interfaces**
- Produceert:
  ```ts
  // src/server/sync-settings.ts
  export type SyncSettings = { calendarId: string; timeZone: string; eventMode: EventMode; eventTime: string | null };
  /** Active binding (calendarId "" when none) + preferences; a stored non-IANA zone falls back to Europe/Amsterdam. */
  export async function loadSyncSettings(userId: string, db: PrismaClient): Promise<SyncSettings>;
  // src/server/episode-event.ts
  export const markers: (userId: string, showId: number, episodeId: number) => Record<string, string>;  // moved from sync.ts:16; sync.ts imports it (no cycle)
  export type EventContext = SyncSettings & { userId: string; origin: string };
  export type ShowFields = Pick<CatalogShow, "title" | "tvmazeId" | "platform" | "country" | "runtimeMinutes">;
  export type EpisodeFields = Pick<CatalogEpisode, "sourceId" | "title" | "season" | "number" | "airdate" | "sourceUrl">;
  export type Providers = { country: string; names: string[] } | null;
  export function desiredEpisodeEvent(ctx: EventContext, show: ShowFields, episode: EpisodeFields, eventId: string, providers?: Providers): CalendarEvent;
  // src/server/sync.ts
  export type SyncConfiguration = SyncSettings & { origin: string };
  // src/server/overview.ts
  export async function overview(userId: string, db: PrismaClient, now: Date, origin: string): Promise<Overview>;
  // src/server/agenda.ts
  export async function agendaOverview(userId: string, origin: string, now?: Date, db?: PrismaClient);
  // scripts/migration/readback.ts
  export async function readbackOwnEvents(db: PrismaClient, google: GoogleCalendar, userId: string, calendarId: string, origin: string): Promise<ReadbackReport>;
  ```
- Consumeert: `Preferences`, `normalizeTimeZone` (P1).

**Stappen**
1. `loadSyncSettings`: `getActiveBinding` + `getPreferences`; `timeZone = normalizeTimeZone(p.timeZone) ?? "Europe/Amsterdam"`; `eventMode = p.eventMode === "FIXED_TIME" && p.eventTime ? "FIXED_TIME" : "ALL_DAY"` (een rij zonder tijd kan door P1 niet ontstaan, maar de factory hoeft dan nooit met `eventTime: null` onder `FIXED_TIME` om te gaan).
2. `desiredEpisodeEvent` = verplaatste `episodeEvent` met **ongewijzigde** uitvoer (Nederlandse tekst, hele-dag); `providers` wordt genegeerd tot P3. `userId` uit `ctx`. `markers` verhuist mee naar `episode-event.ts`; `sync.ts` importeert het daar (geen importcyclus: de factory importeert niets uit `sync.ts`).
3. `services.ts`: `const settingsFor = (userId) => async () => ({ ...(await loadSyncSettings(userId, database())), origin: config().origin })`; `syncService`/`probeService` gebruiken dat. `SyncService`/`CalendarProbeService` typen hun config als `SyncConfiguration`.
4. `overview(userId, db, now, origin)` leest instellingen via `loadSyncSettings(userId, db)` en bouwt `linked` met `desiredEpisodeEvent({ ...settings, userId, origin }, s, e, l.eventId)`; geen standaardwaarden. Aanroepers geven `config().origin` mee; `agendaOverview` krijgt `origin` als parameter en geeft hem door.
5. `readback.ts`: `readbackOwnEvents(db, google, userId, calendarId, origin)` gebruikt lader + factory met de meegegeven `origin`; alleen de CLI-`main` leest `config().origin` (vereist `NEXTAUTH_URL` én `NEXTAUTH_SECRET`, beide in `.env` op max2; de runbooks geven `--env-file .env` mee). De twee testaanroepen (`readback.test.ts:28,49`) geven `"https://when2watch.example.test"` mee; Vitest heeft dus geen `NEXTAUTH_*` nodig. `prove-calendar-recovery.ts:74`: volledige instellingen + origin.
6. Tests: constructies en aanroepen bijwerken; `tests/sync-settings.test.ts`: fallback bij opgeslagen `+02:00`, `calendarId ""` zonder binding, `eventMode`/`eventTime` doorgegeven, `FIXED_TIME` zonder tijd → `ALL_DAY`. Bestaande sync-/overview-/readback-tests blijven inhoudelijk ongewijzigd groen.

**Acceptatie:** gedragsneutraal; A10 groen. **Verificatie:** `npm test`, `npm run typecheck`, `npm run build`. **Commit:** `refactor: shared sync settings loader and episode event factory`.

### P3 — Afspraakmodel: canonieke hash, offset en DST, `eventDate`, PATCH-contract, Engelse tekst, Fixed time

**Doel:** Fixed time werkt tegen Google (bevestiging, vormwissel, datumadministratie), de afspraaktekst is Engels met locatieveld, en bestaande hele-dagafspraken hashen identiek (spec §4.1–§4.3, A3, A4, A5, A12).

**Bestanden**
- Maak: `src/server/event-time.ts`, `tests/event-time.test.ts`, `tests/episode-event.test.ts`.
- Wijzig: `src/server/google-calendar.ts` (type, `safeEvent`, `patch`, `insert`), `src/server/episode-event.ts`, `src/server/sync.ts` (hash, `eventDate`, `confirm`, adoptie, kandidaatcontrole), `tests/simulated-calendar.ts`, `tests/calendar-probe.test.ts:35-39` (simulator), `tests/sync.test.ts` (129-130, 143 + nieuwe gevallen), `tests/shared-sync.test.ts`, `tests/migration/readback.test.ts` (bestaande asserts blijven; één nieuwe legacy-fixture-case).

**Interfaces**
- Produceert:
  ```ts
  // src/server/google-calendar.ts
  export type EventPart = { date?: string | null; dateTime?: string | null; timeZone?: string | null };
  export type CalendarEvent = { id: string; summary?: string; description?: string; location?: string | null; status?: string; etag?: string;
    transparency?: "transparent" | "opaque"; start: EventPart; end: EventPart; reminders: { useDefault: boolean; overrides?: Reminder[] };
    extendedProperties?: { private?: Record<string, string> } };
  export const patchBody: (e: CalendarEvent) => object;   // start/end always carry date, dateTime, timeZone (null for the unused form); location null when absent
  export const insertBody: (e: CalendarEvent) => object;  // null fields removed
  // src/server/event-time.ts
  export function offsetMinutes(instant: Date, timeZone: string): number;
  export function resolveWallTime(date: string, time: string, timeZone: string): Date;  // overlap → earliest instant; gap → shifted by the gap length
  export function formatInZone(instant: Date, timeZone: string): string;              // 2026-10-25T02:30:00+02:00
  export function localDateIn(instant: Date, timeZone: string): string;               // YYYY-MM-DD
  // src/server/sync.ts
  export const calendarEventHash: (event: CalendarEvent) => string;                   // canonical, legacy-compatible for all-day events without location
  export const eventDate: (event: CalendarEvent, fallbackZone: string) => string | null;
  ```

**Kwetsbare contracten (letterlijk overnemen)**
```ts
// event-time.ts
const parts = (instant: Date, timeZone: string) => {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p = Object.fromEntries(f.formatToParts(instant).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}:${p.second}` };
};
export function offsetMinutes(instant: Date, timeZone: string): number {
  const { date, time } = parts(instant, timeZone);
  return Math.round((Date.parse(`${date}T${time}Z`) - instant.getTime()) / 60_000);
}
const offsetString = (m: number) => `${m < 0 ? "-" : "+"}${String(Math.floor(Math.abs(m) / 60)).padStart(2, "0")}:${String(Math.abs(m) % 60).padStart(2, "0")}`;
export function resolveWallTime(date: string, time: string, timeZone: string): Date {
  const guess = Date.parse(`${date}T${time}:00Z`), day = 86_400_000;
  // Sample the offset a day before, at, and a day after the UTC reading of the wall time: that brackets the
  // transition for every zone (|offset| <= 14 h). A +/-3 h window misses it for zones far from UTC.
  const before = offsetMinutes(new Date(guess - day), timeZone);
  const offsets = [...new Set([before, offsetMinutes(new Date(guess), timeZone), offsetMinutes(new Date(guess + day), timeZone)])];
  const candidates = offsets.map(o => new Date(guess - o * 60_000))
    .filter(c => { const p = parts(c, timeZone); return p.date === date && p.time.slice(0, 5) === time; });
  if (candidates.length) return new Date(Math.min(...candidates.map(c => c.getTime())));   // overlap: earliest instant
  return new Date(guess - before * 60_000);                                                // gap: pre-transition offset = wall time shifted by the gap
}
export const formatInZone = (instant: Date, timeZone: string) => { const { date, time } = parts(instant, timeZone); return `${date}T${time}${offsetString(offsetMinutes(instant, timeZone))}`; };
export const localDateIn = (instant: Date, timeZone: string) => parts(instant, timeZone).date;
```
```ts
// sync.ts — canonical hash; the array equals today's for all-day events without location
const instantOf = (part?: EventPart | null): string | null => {
  if (!part?.dateTime) return null;
  const withOffset = /(Z|[+-]\d\d:\d\d)$/.test(part.dateTime);
  return (withOffset ? new Date(part.dateTime) : resolveWallTime(part.dateTime.slice(0, 10), part.dateTime.slice(11, 16), part.timeZone ?? "UTC")).toISOString();
};
export const calendarEventHash = (event: CalendarEvent) => createHash("sha256").update(JSON.stringify([
  event.summary ?? "", event.description ?? "", event.start?.date ?? null, instantOf(event.start),
  event.end?.date ?? null, instantOf(event.end), event.transparency ?? "opaque",
  event.reminders?.useDefault ?? false, event.reminders?.overrides ?? [],
  Object.entries(event.extendedProperties?.private ?? {}).sort(([a], [b]) => a.localeCompare(b)),
  ...(event.start?.dateTime ? [event.start.timeZone ?? null, event.end?.timeZone ?? null] : []),
  ...(event.location ? [event.location] : []),
])).digest("hex");
export const eventDate = (event: CalendarEvent, fallbackZone: string): string | null => {
  const iso = instantOf(event.start);
  return event.start?.date ?? (iso ? localDateIn(new Date(iso), event.start?.timeZone ?? fallbackZone) : null);
};
```
```ts
// google-calendar.ts
const part = (p?: EventPart | null) => ({ date: p?.date ?? null, dateTime: p?.dateTime ?? null, timeZone: p?.timeZone ?? null });
export const patchBody = (e: CalendarEvent) => ({ ...e, start: part(e.start), end: part(e.end), location: e.location ?? null });
export const insertBody = (e: CalendarEvent) => JSON.parse(JSON.stringify(e, (_k, v) => (v === null ? undefined : v)));
```

**Stappen**
1. Type en bodies in `google-calendar.ts`; `insert` stuurt `insertBody`, `patch` stuurt `patchBody`; `safeEvent` neemt `location` mee.
2. Factory-uitvoer per spec §4.2: `summary` `{title} · S{ss}E{ee} · {episodeTitle}`; `description` regels 1–5 (regel 6 alleen met `providers`); `location` alleen met `providers`; All-day ongewijzigd; Fixed time: `start = { dateTime: formatInZone(resolveWallTime(airdate, eventTime, timeZone), timeZone), timeZone }`, `end` = begin + (`runtimeMinutes ?? 60`) minuten, geformatteerd met `formatInZone`. `transparency: "transparent"`, `reminders: { useDefault: true }`, markers ongewijzigd.
3. `sync.ts`: `calendarEventHash` en `eventDate` zoals hierboven; `confirm` zet `lastDate: episode.airdate` (geef `episode` door aan `confirm`); adoptie (`:218`) `lastDate: eventDate(event, settings.timeZone)`; kandidaatcontrole (`:212`) `within(eventDate(e, settings.timeZone))`. Vergelijkingen op `:199`, `:250`, `:251` gebruiken de canonieke hash (geen code-wijziging buiten de hash zelf).
4. Simulatoren (`tests/simulated-calendar.ts`, `tests/calendar-probe.test.ts`): agendazone `Europe/Amsterdam`; opslag na POST/PATCH via geneste samenvoeging waarbij `null` een sleutel wist (voor `start`/`end` per sleutel; `location: null` verwijdert); readback zet `dateTime` om naar `formatInZone(new Date(dateTime), "Europe/Amsterdam")` en behoudt `timeZone`; POST laat `null`-velden vallen. Daarmee falen letterlijke vergelijkingen en ontbrekende `null`-velden zoals bij Google.
5. `readback.test.ts`: de bestaande asserts (`:29`, `:49`) blijven zoals ze zijn; `migratedOwner()` maakt zijn koppelingen met de actuele `SyncService` en blijft dus `unchanged` rapporteren. Nieuw: één case met een handmatig gezaaide koppeling met legacy-Nederlandse `desiredJson` en `confirmedRemoteHash`/`confirmedDesiredHash` berekend over de oude hele-dag-array (vaste hex uit de huidige tree), met een datum buiten het venster → `remoteChanged: 0`, `sourceChanged: 1`. `readbackOwnEvents` kent geen venster; `sourceChanged` zit niet in `readbackNeedsAttention` (`readback.ts:19-20`). Dit bewijst dat de nieuwe hash de opgeslagen `confirmedRemoteHash` niet ongeldig maakt.
6. Tests (nieuw): `event-time.test.ts`: `Europe/Amsterdam` 20:00 gewoon, 02:30 op 2026-10-25 → `2026-10-25T02:30:00+02:00` (00:30Z), 02:30 op 2026-03-29 → `2026-03-29T03:30:00+02:00`; `America/New_York` 03:30 op 2026-03-08 → `03:30:00-04:00`, 02:30 op 2026-11-01 → `02:30:00-05:00`, 02:30 op 2026-03-08 (gat) → `03:30:00-04:00`, 01:30 op 2026-11-01 (overlap) → `01:30:00-04:00`; `Australia/Sydney` 02:30 op 2026-10-04 (gat) → `03:30:00+11:00`, 02:30 op 2026-04-05 (overlap) → `02:30:00+11:00`, 20:00 op 2026-10-03 → `20:00:00+10:00`; `Pacific/Auckland` 20:00 op 2026-09-26 → `20:00:00+12:00`; einde = begin + 60 min over een overgang heen; `offsetMinutes`; `localDateIn` met `America/New_York`. (De ±24-uurssampling is op Node 24 gecontroleerd tegen een brute-force-check over alle DST-zones: nul afwijkingen; de ±3-uursvariant uit v0.1 had 776 afwijkingen in 56 zones.) `episode-event.test.ts`: All-day, Fixed time (met en zonder `runtimeMinutes`), ontbrekende platform/afleveringstitel/seizoen, `providers` → `location` en regel 6, origin in regel 4. `sync.test.ts`: (a) legacy-compat: hash van een hele-dagafspraak zonder locatie gelijk aan de oude implementatie (vaste verwachte hex uit de huidige tree vastleggen); (b) Fixed-time-sync: insert met offset, readback bevestigd, tweede sync nul writes; (c) vormwissel beide kanten met `null`-velden en gelijke ID's (test faalt zonder nulls door de simulator); (d) `eventDate` met afspraakzone `America/New_York` en agendazone Amsterdam; (e) verschoven tijdgebonden item waarvan de datum daarna wordt ingetrokken wordt verwijderd (`lastDate`); (f) `overview` toont `linked` waar na Fixed-time-sync, onwaar na voorkeurswissel, weer waar na sync; (g) bestaande links-fixture zonder bronwijziging: eerste sync alleen PATCHes, nul inserts/deletes (A4); (h) locatie-wijziging verandert de hash.

**Acceptatie:** A3, A4, A5 (sync-deel), A12. **Verificatie:** `npm test`, `npm run typecheck`, `npm run build`. **Commit:** `feat: canonical calendar events with fixed-time support and English text`.

### P4 — Proefevent met factory, inhoudscontrole en paneel

**Doel:** het proefitem toont precies wat echte afspraken doen; readback wordt canoniek en inhoudelijk gecontroleerd; het paneel toont vorm, locatie en `defaultReminders` (spec §5, A6).

**Bestanden**
- Wijzig: `src/server/calendar-probe.ts` (46–54 body, 75–76 controle, Engelse meldingen), `src/app/settings/trial-panel.tsx` (vorm, locatie, `defaultReminders`, Engelse tekst), `src/app/settings/page.tsx:32` (geef `eventMode`/`eventTime` mee).
- Tests: `tests/calendar-probe.test.ts` (+ beide vormen, offset-readback, alleen-locatie-mutatie, `EVENT_CHANGED` bij titelwijziging), `tests/google-probe-guards.test.ts` (ongewijzigd groen).

**Interfaces:** consumeert `desiredEpisodeEvent`, `calendarEventHash`, `patchBody`/`insertBody` (P2/P3). `POST /api/probe` blijft `{ date }`.

**Stappen**
1. Body: `desiredEpisodeEvent(ctx, { title: "Example Show", tvmazeId: 0, platform: "Example broadcaster", country: null, runtimeMinutes: 60 }, { sourceId: 0, title: "Example episode", season: 1, number: 1, airdate: date, sourceUrl: "" }, eventId, { country: "Netherlands", names: ["Example service A", "Example service B"] })`; daarna `summary` voorzetten met `[W2W TEST] `, `description` vervangen door de proeftekst uit spec §5, `extendedProperties.private` door de probe-markers.
2. Controle op `:76`: eigendom (ongewijzigd) + `event.status === "cancelled"` → `EVENT_CHANGED` (blijft) + `calendarEventHash({ ...event, reminders: request.reminders }) === calendarEventHash(request)` waarbij `request` de opgeslagen `requestJson` is; dat dekt `start`, `end`, `summary`, `location`, `description`. Verwijder alleen de `dateTime`-weigering.
3. Paneel: per proef "All-day" of "Fixed time 20:00", teruggelezen `location`, en de agenda-`defaultReminders` (leeg → waarschuwing "No default notification for timed events is set on this calendar; set one in Google Calendar before the probe"). Nieuwe tekst in het Engels.
4. Tests: proef onder `FIXED_TIME` → `dateTime` met offset in readback, `created`; alleen-locatie-mutatie op de simulator → `EVENT_CHANGED`; titelmutatie → `EVENT_CHANGED`; readback met `status: "cancelled"` en verder intacte velden → `EVENT_CHANGED`; All-day ongewijzigd; tweede proef op dezelfde datum geeft dezelfde proef terug.

**Acceptatie:** A6. **Verificatie:** `npm test`, `npm run typecheck`, `npm run build`. **Commit:** `feat: probe event follows the event style and verifies content`.

### P5 — Engelse servermeldingen, labels en `DELETE`-contract

**Doel:** alle `AppError`-meldingen, fallbacks en labels Engels; verwijderbevestiging `DELETE` (spec §3.1, §3.5).

**Bestanden**
- Wijzig: alle 28 bestanden met `new AppError(` onder `src/server/` en `src/app/api/` (113 aanroepen) plus `src/server/google-calendar.ts:38-45` (foutkaart), `src/server/errors.ts:14`, `src/server/sync.ts:17`, `src/server/catalog.ts:7`, `src/server/privacy.ts:9,61,65` (`deletionConfirmation = "DELETE"`), `src/lib/series-list.ts:4-6` (Running / Renewal undecided / Ended / Status unknown), `src/app/settings/privacy-panel.tsx:24-26` (DELETE).
- Tests: `tests/series-list.test.ts:26-29`, `tests/credentials.test.ts:20-21` (`/sleutel/` → `/key/`), `tests/shared-sync.test.ts:89` (`/broncontrole/` → `/source check/`), `tests/privacy.test.ts` (9× `VERWIJDEREN` → `DELETE`), `scripts/smoke-http.mjs:136-139` (`DELETE`).

**Stappen**
1. Vertaal per bestand; codes en HTTP-statussen ongewijzigd (grep `AppError("` vóór en na: gelijk aantal, gelijke codes).
2. Tests en smoke bijwerken; `npm test` groen.

**Acceptatie:** A1 (serverdeel). **Verificatie:** `npm test`, `npm run typecheck`, `npm run build`, `npm run test:http` (de smoke wijzigt in deze taak). **Commit:** `feat: English server messages and DELETE confirmation`.

### P6 — Engelse routes, redirects, navigatie en ankers

**Doel:** `/following`, `/invitation`, `/admin/users`, `/admin/series` met tijdelijke redirects; navigatie en ankers Engels (spec §3.2, A2).

**Bestanden**
- Verplaats: `src/app/volgen/` → `src/app/following/`, `src/app/uitnodiging/` → `src/app/invitation/`, `src/app/beheer/gebruikers/` → `src/app/admin/users/`, `src/app/beheer/series/` → `src/app/admin/series/`.
- Wijzig: `next.config.ts` (redirects), `src/app/navigation.tsx` (typen, paden, labels Agenda / Following / Settings / Users / Stats, `aria-label="Main navigation"`), `src/app/agenda-panel.tsx:14,17-18`, `src/app/invitation/invitation-entry.tsx:12` (`replaceState("/invitation")`), `src/server/invitations.ts:30` (`/invitation#token=`), `src/app/settings/preferences-panel.tsx:21` (`id="preferences"`), `src/app/settings/calendar-panel.tsx:38` (`id="calendar"`), `README.md` (routes).
- Tests: `tests/invitations.test.ts:53`; `scripts/smoke-http.mjs` regels 99-100, 155-168, 216, 221, 229-233 (nieuwe paden) én regel 231 (`aria-label="Hoofdnavigatie"` → `"Main navigation"`, want deze taak wijzigt `navigation.tsx`) + nieuwe asserts: oude paden → 307 met `Location` op het nieuwe pad.

**Kwetsbaar contract**
```ts
// next.config.ts
async redirects() { return [
  { source: "/volgen", destination: "/following", permanent: false },
  { source: "/uitnodiging", destination: "/invitation", permanent: false },
  { source: "/beheer/gebruikers", destination: "/admin/users", permanent: false },
  { source: "/beheer/series", destination: "/admin/series", permanent: false },
]; },
```
Browsers behouden het `#token=`-fragment bij een 307 (RFC 7231 §7.1.2); de smoke test controleert status en `Location`, de fragmentproef is handmatig (A2).

**Stappen**
1. `git mv` van de mappen; imports en `Navigation active=` bijwerken.
2. Redirects toevoegen; `invitations.ts:30` en `invitation-entry.tsx:12` aanpassen; ankers hernoemen.
3. Smoke en tests bijwerken; `npm run test:http` groen.
4. `deploy/README.md`: notitie "redirects verwijderen na 30 dagen of in stap 4".

**Acceptatie:** A2 (automatisch deel). **Verificatie:** `npm test`, `npm run typecheck`, `npm run build`, `npm run test:http`. **Commit:** `feat: English routes with temporary redirects`.

### P7 — Engelse pagina's en panelen, datumopmaak, landing, privacy, A1-controle

**Doel:** alle resterende UI-tekst Engels, `lang="en"`, `en-GB`-opmaak, landingpagina en privacybeleid per spec §6–§7, geautomatiseerde taalcontrole (spec §3.1, §3.4, §6, §7, A1, A8).

**Bestanden**
- Wijzig: `src/app/layout.tsx` (`lang="en"`, description, footer met contact uit `W2W_PRIVACY_CONTACT`), `src/app/manifest.ts`, `src/app/page.tsx` (landing + ingelogde tak + neutrale `?error=`-tekst + `generateMetadata` met `robots: { index: true, follow: true }` voor de onaangemelde tak; Next vervangt het geneste `robots`-object uit de layout in zijn geheel, dus beide sleutels expliciet), `src/app/privacy/page.tsx` (Engels, secties uit spec §7, `robots: { index: true, follow: true }`), `src/lib/dates.ts` (nieuwe geëxporteerde helpers `formatEpisodeDate(date: string): string` en `formatDayLabel(date: string, weekday?: boolean): string`, `en-GB`, altijd `timeZone: "UTC"` op de synthetische middagwaarde; `agenda-panel.tsx:4` en `series-panel.tsx:12` roepen die aan), `src/app/series-panel.tsx:11` (tijdstip: `en-GB`, `hourCycle: "h23"`, gebruikerszone), `src/app/admin/series/page.tsx:22`, `src/app/series-panel.tsx` (alle teksten, Follow/Try/Trying, `id={`show-${show.id}`}` op de rij), `src/app/settings/*.tsx`, `src/app/admin/users/admin-users-panel.tsx` (teksten + `data.error` i.p.v. `data.error?.message`), `src/app/invitation/*`, `src/app/auth-buttons.tsx`, `src/server/agenda.ts:14` en `src/lib/series-list.ts:11` (`localeCompare(…, "en")`), `src/app/settings/page.tsx`, `src/app/following/page.tsx`, `public/icons/*.svg` ongewijzigd.
- Maak: `tests/english.test.ts` (A1-controle), `tests/date-format.test.ts` (test de helpers uit `src/lib/dates.ts` rechtstreeks: `formatEpisodeDate("2026-10-09")` is "9 October" ongeacht `process.env.TZ`, ook met `TZ=Pacific/Auckland` gezet in de test).
- Tests: `scripts/smoke-http.mjs` (regel 224 linktekst "Read more on TVmaze"; asserts `lang="en"`, `aria-label="Main navigation"` (al Engels sinds P6), landingtekst "Access is by invitation for now", `<meta name="robots" content="index, follow">` op `/` en `/privacy`, `/privacy` toont beheerder en contact; omgevingsvariabelen `W2W_PRIVACY_CONTROLLER="Example Operator"` en `W2W_PRIVACY_CONTACT="privacy@example.test"` in `env` op regel 24-31); `tests/agenda.test.ts` (ongewijzigd).

**A1-controle (contract)**
`tests/english.test.ts` leest alle `src/**/*.{ts,tsx}`, laat importregels en de attribuutwaarden van `className`, `id`, `htmlFor`, `href`, `key` weg, verzamelt stringliterals en JSX-tekst, en eist nul hoofdletterongevoelige woordgrens-treffers op `instellingen, volgen, proberen, melding, opnieuw, bevestig, verwijder, uitnodiging, beheer, gegevens, probeer, niet, geen, je, jouw, het, een, kies, aflevering, serie, klaar`. Treffers worden als `bestand:regel: woord` gerapporteerd. `agenda` staat bewust niet op de lijst.

**Stappen**
1. Vertaal pagina's en panelen; nieuwe teksten uit spec §6 (landing) en §7 (privacy, inclusief de Google API Services User Data Policy-zin en de Limited Use-eisen).
2. Datumopmaak: helpers naar `src/lib/dates.ts`, alleen locale wijzigen; `tests/date-format.test.ts` bewijst dat `2026-10-09` als "9 October" (serie) en "9 October 2026" (dagkop) rendert, onafhankelijk van zone.
3. `tests/english.test.ts` toevoegen en groen krijgen; handmatige doorloop van alle pagina's vastleggen in `docs/evidence/idea-241-stap-1.md` (P8-sjabloon).
4. Smoke bijwerken; `npm run test:http` groen.

**Acceptatie:** A1, A8. **Verificatie:** `npm test`, `npm run typecheck`, `npm run build`, `npm run test:http`. **Commit:** `feat: English interface, landing page and privacy policy`.

### P8 — Runbook, evidence-sjabloon, notities

**Doel:** de beheerstappen en het bewijs zijn vooraf uitgeschreven (spec §5, §8, §12).

**Bestanden**
- Maak: `docs/runbooks/idea-241-production-consent.md` (spec §8 stappen 1–8 als checklist; uitnodigingstekst met de alinea over het waarschuwingsscherm en de doorklikroute "Advanced → Go to When2Watch"; budgettabel met kolommen datum, genodigde/accountwissel, teller, grens 50), `docs/evidence/idea-241-stap-1.md` (secties A1 handmatige doorloop, A2 fragmentproef, A4 eerste productiesync met `updated`/`created`/`deleted` per serie, A5 vormwissel-readback, A6/A7 proefprocedure stappen 1–7, A9 consentomschakeling en niet-testaccount; placeholder-regels, geen tokens).
- Wijzig: `README.md` (routes, voorkeuren), `deploy/README.md` (migratiestap voor `20261008120000_idea241_event_style`; rollback = `pg_dump` van vóór de migratie terugzetten én de vorige release starten, omdat `scripts/start.sh:10-13` weigert te starten zolang `prisma migrate status` een onbekende toegepaste migratie ziet; redirect-opruimnotitie; `W2W_PRIVACY_*` verplicht vóór publicatie), `docs/runbooks/idea-219-r2-cutover.md:100` en `idea-219-r1-cutover.md:53` (notitie: na stap 1 rapporteert een remote readback `sourceChanged` voor alle legacy-koppelingen met Nederlandse tekst; dat is verwacht en geen `readbackNeedsAttention`), `.env.example` (`W2W_PRIVACY_CONTROLLER=`, `W2W_PRIVACY_CONTACT=`), `docs/praktijkproef.md` (verwijzing naar de nieuwe evidence; `calendar.events` op regel 128 markeren als te verwijderen in §8 stap 2).

**Acceptatie:** documenten aanwezig en consistent met spec §5/§8. **Verificatie:** `npm test` (ongewijzigd), review. **Commit:** `docs: production consent runbook and step-1 evidence template`.

### P9 — Uitrol, stap 0, praktijkbewijs en Production-consent (JP + agent)

**Doel:** stap 1 in productie met vastgelegd bewijs (A4, A5, A7, A9). Iedere stap hieronder vereist een expliciete opdracht van JP; het plan autoriseert niets.

1. **Stap 0 (JP):** opnieuw inloggen, `APP_CREATED`-agenda aanmaken, eerste sync, ontvangen melding; vastleggen in `docs/evidence/idea-219-r2.md`. Zonder dit geen uitrol.
2. **PR en CI:** PR van `claude/idea-241-stap-1` naar `main`; CI groen (A10). Merge alleen op opdracht.
3. **Uitrol op max2** volgens `deploy/README.md`: release bouwen, `pg_dump -Fc`, migratie als aparte stap (`--profile migrate`), nieuwe web-container, health, `current` omzetten; `.env` bevat `W2W_PRIVACY_CONTROLLER`/`W2W_PRIVACY_CONTACT`. Rollback = dump terugzetten én vorige release starten (P8), en alleen zolang niemand Fixed time gebruikt (spec §9). Evidence: de teruggelezen `timeZone` van het proefitem is gelijk aan de verzonden (`Europe/Amsterdam`).
4. **Eerste sync (JP):** Sync now; `updated`/`created`/`deleted` per serie in de evidence (A4).
5. **Praktijkproef (JP, spec §5 stappen 1–7):** standaardmelding voor tijdgebonden afspraken instellen, Fixed time 20:00, proefitem, iPhone-waarneming, All-day-proef op andere datum, vormwissel op echte afspraken, opruimen (A6, A7, A5).
6. **Production-consent (JP, runbook):** scopes controleren, branding, Publish app, opnieuw verbinden, niet-testaccount, uitnodigingstekst, budget (A9).
7. **Afronding:** evidence compleet, Scrum4Me-status bijgewerkt; open punten uit spec §15 naar JP.

## 3. Zelfcontrole tegen de spec

| Spec | Taak |
| --- | --- |
| §2 besluiten (venster, TMDB later, anker, navigatie, regio) | P3 (venster ongewijzigd), P7 (anker `show-<id>`, geen TMDB-regels) |
| §3.1 taal/opmaak | P5, P7 |
| §3.2 routes | P6 |
| §3.4 correcties | P7 |
| §4.1 velden, offset, canonieke hash, zone-ID, datumadministratie | P1 (zone), P3 |
| §4.2 opbouw en schrijfcontract | P3 |
| §4.3 bestaande koppelingen | P3 (A4-test), P9 (evidence) |
| §4.4 voorkeur en export | P1 |
| §4.5 overzicht en lader | P2, P3 (test) |
| §5 proefevent en procedure | P4, P9 |
| §6 landing | P7 |
| §7 privacy | P7 |
| §8 consent | P8 (runbook), P9 |
| §9 migratie/rollback | P1, P8, P9 |
| §10 A1–A12 | A1 P5/P7; A2 P6; A3 P3; A4 P3/P9; A5 P1/P3/P9; A6 P4; A7 P9; A8 P7; A9 P9; A10 alle; A11 P8/P9; A12 P1/P3 |
| §11 tests | P1–P7 |
| §12 bestanden | P1–P8 |
| §15 open punt | buiten scope; P9 stap 7 |

Geen placeholders; typen en namen zijn over de taken heen gelijk (`SyncSettings`, `EventContext`, `markers`, `desiredEpisodeEvent`, `calendarEventHash`, `eventDate`, `patchBody`, `insertBody`, `normalizeTimeZone`, `resolveWallTime`, `formatInZone`, `localDateIn`, `readbackOwnEvents(…, origin)`, `formatEpisodeDate`, `formatDayLabel`).

## Review record

Review-loop volgens `~/.claude/skills/review-loop` (fase plan, maximaal 10 rondes, twee dispatch-jobs: codex en claude). In opdracht van JP, 8 oktober 2026.

### Ronde 1 — 8 oktober 2026, plan v0.1 op commit `d928a66eaa1cc25ad0e75de7620fe6988a06bc34`

Pins: plan v0.1 (sha256 `ff601e12…bf88f`), spec v0.6 (`b27efc7c…e0c5`), grill rev. 3, `AGENTS.md`; `repository.base_sha` = dezelfde commit.

| Slot | Request | root_message | Idempotency | Verdict |
| --- | --- | --- | --- | --- |
| codex (`runtime: CODEX`) | `8d20991e-6a44-4ea4-bc9b-832405ed8824` | `a2908210-398a-455e-a00d-59ca70e16ddd` | `6da33176-61de-482e-a6e0-3c833a99087a` | **NO-GO** — 3 BLOCKER, 1 MAJOR, 0 MINOR |
| claude (`runtime: CLAUDE`) | `4b8e6460-74ae-47e2-8df6-76679ff9c264` | `11daf0a5-ce27-47f4-bc3e-5b1e76b0d1c2` | `118b2185-6f58-4dc9-899b-efb9351f6ddb` | **NO-GO** — 1 BLOCKER, 1 MAJOR, 11 MINOR |

Triage (alle bevindingen tegen de tree gecontroleerd; geen afwijzingen):

| # | Bevinding (bron) | Controle | Remedie in v0.2 |
| --- | --- | --- | --- |
| 1 | BLOCKER (beiden): `resolveWallTime` sampelt ±3 u rond de UTC-lezing en mist de overgang in zones ver van UTC (New York, Sydney, Auckland) | bevestigd in Node 24: oude code geeft NY 03:30 → 04:30, Sydney-gat → 01:30+10:00; ±24-uursvariant correct in alle 10 testgevallen; claude: 0 afwijkingen in 4590 brute-force-gevallen | P3-contract met ±24 u; tests voor NY, Sydney, Auckland |
| 2 | BLOCKER (codex): `config().origin` in `readbackOwnEvents` maakt de directe tests afhankelijk van `NEXTAUTH_*` | bevestigd (`readback.ts:31`, `readback.test.ts:28,49`, `config.ts:5`) | `origin`-parameter; CLI-`main` leest `config()` (P2) |
| 3 | BLOCKER (codex): P6 wijzigt `aria-label` terwijl smoke-regel 231 pas in P7 wordt bijgewerkt | bevestigd (`smoke-http.mjs:231`) | regel 231 naar P6 |
| 4 | MAJOR (beiden): readback-testverwachting "sourceChanged in venster / unchanged erbuiten" klopt niet: fixture via live `SyncService`, classifier zonder venster | bevestigd (`readback.test.ts:15-29`, `readback.ts:37-52`) | SCHRAP; bestaande asserts blijven; legacy-fixture-case met vaste oude hashes (P3); notitie in runbooks (P8) |
| 5 | MINOR (claude): `resolvedOptions().timeZone` herschrijft moderne namen naar ICU-aliassen | bevestigd (`Asia/Kolkata` → `Asia/Calcutta`, `Etc/UTC` → `UTC`) | `normalizeTimeZone` bewaart de spelling, corrigeert hoofdletters via `supportedValuesOf` (P1) |
| 6 | MINOR (claude): validatievolgorde kan `preferences.test.ts:22-23` breken (geen `db`) | bevestigd | vormcontrole vóór databasetoegang, merged-state binnen het lock (P1) |
| 7 | MINOR (claude): paneel is client component; serverimport breekt de build | bevestigd (`preferences-panel.tsx:1`) | `src/lib/time-zone.ts`; `invalidTimeZone` als prop uit `page.tsx` (P1) |
| 8 | MINOR (claude): `agendaOverview`-aanroepers ontbreken; `cron` hoort er niet bij | bevestigd (`agenda.test.ts:49,54,71,75`, `banners.test.ts:43,91,92`) | P2-testlijst |
| 9 | MINOR (claude): P4 kan de `cancelled`-controle laten vallen | bevestigd (`calendar-probe.ts:76`) | expliciet behouden + test (P4) |
| 10 | MINOR (claude): parallelle lanes onjuist (P5 raakt dezelfde bestanden) | bevestigd | §1 |
| 11 | MINOR (claude): P5 wijzigt smoke zonder `test:http` | bevestigd | P5-verificatie |
| 12 | MINOR (claude): datumopmaaktest heeft geen seam | bevestigd (`agenda-panel.tsx:4`, `series-panel.tsx:12` privé) | helpers naar `src/lib/dates.ts` (P7) |
| 13 | MINOR (claude): `robots` zonder `follow` | bevestigd (`layout.tsx:5`) | `{ index: true, follow: true }` + smoke (P7) |
| 14 | MINOR (claude): rollback botst met de `migrate status`-startgate | plausibel (`start.sh:10-13`) | rollback = dump + vorige release (P8, P9) |
| 15 | MINOR (claude): factory-details (`markers`, `eventTime: null`, `NEXTAUTH_SECRET`) | bevestigd (`sync.ts:16`, `config.ts:5`) | P2 |

Scope-delta ronde 1: geen productwerk toegevoegd of verwijderd; `insertBody` blijft (door claude als optionele SCHRAP genoemd, door de spec §4.2 vereist); parallelle lanes geschrapt. Eerste bruikbare resultaat en praktijkbewijs ongewijzigd.
