---
title: "IDEA-241 — Uitvoeringsplan stap 1: Engels, afspraakmodel, landing, privacy en proefevent"
status: draft
version: "0.1"
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

P1–P4 (afspraakmodel) en P5–P6 (taal/routes) raken verschillende bestanden en kunnen in twee lanes parallel, mits P7 pas start als beide klaar zijn. Sequentieel is de standaard.

## 2. Taken

### P1 — Voorkeuren: `eventMode`, `eventTime`, IANA-tijdzone, export

**Doel:** de gebruiker kan All-day of Fixed time (met tijd) kiezen; tijdzones zijn IANA-namen; de export bevat de nieuwe velden (spec §4.4, §9, A5 deels, A12 deels).

**Bestanden**
- Wijzig: `prisma/schema.prisma` (model `UserPreferences`), `src/server/preferences.ts`, `src/app/api/settings/preferences/route.ts` (foutmelding), `src/app/settings/preferences-panel.tsx`, `src/app/settings/page.tsx` (waarschuwing bij ongeldige opgeslagen zone), `src/server/privacy.ts:19` (export-select), `src/server/calendar-settings.ts:6,114` (gebruikt `validTimeZone`).
- Maak: `prisma/migrations/20261008120000_idea241_event_style/migration.sql`.
- Tests: `tests/preferences.test.ts` (shape-asserts op 11, 16, 17, 29 + nieuwe gevallen), `tests/user-isolation.test.ts:55`, `tests/privacy.test.ts:65`, `tests/calendar-settings.test.ts` (ongeldige zone bij aanmaak).

**Interfaces**
- Produceert (uit `src/server/preferences.ts`):
  ```ts
  export type EventMode = "ALL_DAY" | "FIXED_TIME";
  export type Preferences = { agendaMonths: AgendaMonths; timeZone: string; eventMode: EventMode; eventTime: string | null };
  export const EVENT_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
  /** Intl-normalised IANA name, or null for invalid input and for offset forms (+02:00, UTC+2, GMT-5). */
  export function normalizeTimeZone(value: unknown): string | null;
  export const validTimeZone = (value: unknown): value is string => normalizeTimeZone(value) !== null;
  export async function getPreferences(userId: string, db?: PrismaClient): Promise<Preferences>;
  export async function savePreferences(userId: string, patch: unknown, db?: PrismaClient): Promise<Preferences>;
  ```

**Kwetsbaar contract (letterlijk overnemen)**
```ts
export function normalizeTimeZone(value: unknown): string | null {
  if (typeof value !== "string" || !value || value.length > 100 || value !== value.trim()) return null;
  let resolved: string;
  try { resolved = new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone; } catch { return null; }
  return /^[+-]/.test(resolved) || /^(UTC|GMT)[+-]/.test(resolved) ? null : resolved;
}
```
`Intl.supportedValuesOf` niet gebruiken (mist `UTC`, `Etc/UTC`, `Asia/Kolkata` op Node 24). `UTC` en `Etc/*` blijven geldig; `Asia/Calcutta` blijft zoals ingevoerd.

**Stappen**
1. Migratie: `CREATE TYPE "EventMode" AS ENUM ('ALL_DAY','FIXED_TIME'); ALTER TABLE "UserPreferences" ADD COLUMN "eventMode" "EventMode" NOT NULL DEFAULT 'ALL_DAY', ADD COLUMN "eventTime" TEXT;` plus de Prisma-velden `eventMode EventMode @default(ALL_DAY)` en `eventTime String?`. `npm run db:generate`.
2. `savePreferences`: sleutels `agendaMonths`, `timeZone`, `eventMode`, `eventTime` toegestaan; valideer op de **samengevoegde** toestand (`{ ...stored, ...patch }`): `agendaMonths` 1|2|3; `timeZone` via `normalizeTimeZone` (opslaan als genormaliseerde naam); `eventMode` in `ALL_DAY|FIXED_TIME`; `eventTime` `null` of `EVENT_TIME`; `FIXED_TIME` zonder `eventTime` → `INVALID_INPUT` (400). `eventTime` mag onder `ALL_DAY` gezet en bewaard blijven. Engelse foutmelding: "Choose a period of one, two or three months, a valid IANA time zone, and a time (HH:MM) for fixed-time events."
3. `getPreferences`: standaard `eventMode: "ALL_DAY"`, `eventTime: null`; opgeslagen zone ongewijzigd teruggeven (de lader in P2 valt terug).
4. Paneel: "Event style" met keuzerondjes All-day / Fixed time, `input type="time"` (standaard `20:00`, `step=60`), hulptekst uit spec §4.4; PATCH stuurt alle vier de sleutels; knop uit zolang niets wijzigt. Waarschuwing "Your saved time zone is not a valid IANA name; choose one from the list." wanneer `normalizeTimeZone(preferences.timeZone) === null`.
5. Export (`privacy.ts:19`): `select: { agendaMonths, timeZone, eventMode, eventTime }`.
6. Tests: shape-asserts uitbreiden; nieuw: `+02:00` → 400, `UTC+2` → 400, `europe/amsterdam` → opgeslagen als `Europe/Amsterdam`, `UTC` geldig, `{ eventMode: "FIXED_TIME" }` zonder tijd → 400, `{ eventTime: "21:00" }` onder `ALL_DAY` → 200 en bewaard, terugwisselen behoudt `eventTime`, deelpatch `{ timeZone }` behoudt `eventMode`; agenda-aanmaak met `+02:00` → 400.

**Acceptatie:** A5 (400-gevallen), A12 (export). **Verificatie:** `npm test`, `npm run typecheck`, `npm run build`. **Commit:** `feat: event style and IANA time zone preferences`.

### P2 — Instellingenlader en afspraak-factory (gedragsneutraal)

**Doel:** één lader en één factory voor sync, proef en overzicht; origin op de servicegrens; geen gedragswijziging (spec §4.5, ronde-2/3-bevindingen).

**Bestanden**
- Maak: `src/server/sync-settings.ts`, `src/server/episode-event.ts`, `tests/sync-settings.test.ts`.
- Wijzig: `src/server/sync.ts` (verwijder `episodeEvent`, importeer factory; `SyncConfiguration` → `SyncSettings & { origin }`), `src/server/services.ts` (`currentSettings` vervangen), `src/server/overview.ts` (signatuur), `src/server/agenda.ts`, `src/app/page.tsx:14`, `src/app/volgen/page.tsx:13`, `src/app/api/shows/route.ts:24`, `src/server/calendar-probe.ts` (type), `scripts/migration/readback.ts:13,50`, `scripts/prove-calendar-recovery.ts:74`.
- Tests: iedere `SyncService`-, `CalendarProbeService`- en `overview(`-constructie in `tests/` (grep; o.a. `sync.test.ts:39`, `shared-sync`, `cron`, `banners`, `limited-calendar`, `idea219-acceptance`, `agenda`, `user-isolation`, `calendar-probe`, `admin-stats`, `migration/readback.test.ts`) krijgt volledige instellingen plus `origin: "https://when2watch.example.test"`.

**Interfaces**
- Produceert:
  ```ts
  // src/server/sync-settings.ts
  export type SyncSettings = { calendarId: string; timeZone: string; eventMode: EventMode; eventTime: string | null };
  /** Active binding (calendarId "" when none) + preferences; a stored non-IANA zone falls back to Europe/Amsterdam. */
  export async function loadSyncSettings(userId: string, db: PrismaClient): Promise<SyncSettings>;
  // src/server/episode-event.ts
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
  ```
- Consumeert: `Preferences`, `normalizeTimeZone` (P1).

**Stappen**
1. `loadSyncSettings`: `getActiveBinding` + `getPreferences`; `timeZone = normalizeTimeZone(p.timeZone) ?? "Europe/Amsterdam"`.
2. `desiredEpisodeEvent` = verplaatste `episodeEvent` met **ongewijzigde** uitvoer (Nederlandse tekst, hele-dag); `providers` wordt genegeerd tot P3. `userId` uit `ctx`.
3. `services.ts`: `const settingsFor = (userId) => async () => ({ ...(await loadSyncSettings(userId, database())), origin: config().origin })`; `syncService`/`probeService` gebruiken dat. `SyncService`/`CalendarProbeService` typen hun config als `SyncConfiguration`.
4. `overview(userId, db, now, origin)` leest instellingen via `loadSyncSettings(userId, db)` en bouwt `linked` met `desiredEpisodeEvent({ ...settings, userId, origin }, s, e, l.eventId)`; geen standaardwaarden. Aanroepers geven `config().origin` mee; `agendaOverview` krijgt `origin` als parameter en geeft hem door.
5. `readback.ts`/`prove-calendar-recovery.ts`: factory + lader; `origin` uit `config().origin` (vereist `NEXTAUTH_URL`, aanwezig in `.env` op max2).
6. Tests: constructies bijwerken; `tests/sync-settings.test.ts`: fallback bij opgeslagen `+02:00`, `calendarId ""` zonder binding, `eventMode`/`eventTime` doorgegeven. Bestaande sync-/overview-tests blijven ongewijzigd groen.

**Acceptatie:** gedragsneutraal; A10 groen. **Verificatie:** `npm test`, `npm run typecheck`, `npm run build`. **Commit:** `refactor: shared sync settings loader and episode event factory`.

### P3 — Afspraakmodel: canonieke hash, offset en DST, `eventDate`, PATCH-contract, Engelse tekst, Fixed time

**Doel:** Fixed time werkt tegen Google (bevestiging, vormwissel, datumadministratie), de afspraaktekst is Engels met locatieveld, en bestaande hele-dagafspraken hashen identiek (spec §4.1–§4.3, A3, A4, A5, A12).

**Bestanden**
- Maak: `src/server/event-time.ts`, `tests/event-time.test.ts`, `tests/episode-event.test.ts`.
- Wijzig: `src/server/google-calendar.ts` (type, `safeEvent`, `patch`, `insert`), `src/server/episode-event.ts`, `src/server/sync.ts` (hash, `eventDate`, `confirm`, adoptie, kandidaatcontrole), `tests/simulated-calendar.ts`, `tests/calendar-probe.test.ts:35-39` (simulator), `tests/sync.test.ts` (129-130, 143 + nieuwe gevallen), `tests/shared-sync.test.ts`, `tests/migration/readback.test.ts` (verwachting bij Nederlandse legacy-tekst: `sourceChanged` voor items in het venster).

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
  const guess = Date.parse(`${date}T${time}:00Z`);
  const before = offsetMinutes(new Date(guess - 3 * 3_600_000), timeZone), after = offsetMinutes(new Date(guess + 3 * 3_600_000), timeZone);
  const candidates = [...new Set([before, after])].map(o => new Date(guess - o * 60_000))
    .filter(c => { const p = parts(c, timeZone); return p.date === date && p.time.slice(0, 5) === time; });
  if (candidates.length) return new Date(Math.min(...candidates.map(c => c.getTime())));   // overlap: earliest
  return new Date(guess - before * 60_000);                                                // gap: pre-transition offset = shifted by the gap
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
5. `readback.test.ts`: na deze taak wijkt de Engelse gewenste tekst af van de legacy-`confirmedDesiredHash` voor items in het venster → verwachting `sourceChanged` voor die items, `remoteChanged: 0`, `unchanged` voor items buiten het venster. Dit bewijst de hashcompatibiliteit.
6. Tests (nieuw): `event-time.test.ts`: 20:00 gewoon; 02:30 op 2026-10-25 → `2026-10-25T02:30:00+02:00` (00:30Z); 02:30 op 2026-03-29 → `2026-03-29T03:30:00+02:00`; `offsetMinutes`; `localDateIn` met `America/New_York`. `episode-event.test.ts`: All-day, Fixed time (met en zonder `runtimeMinutes`), ontbrekende platform/afleveringstitel/seizoen, `providers` → `location` en regel 6, origin in regel 4. `sync.test.ts`: (a) legacy-compat: hash van een hele-dagafspraak zonder locatie gelijk aan de oude implementatie (vaste verwachte hex uit de huidige tree vastleggen); (b) Fixed-time-sync: insert met offset, readback bevestigd, tweede sync nul writes; (c) vormwissel beide kanten met `null`-velden en gelijke ID's (test faalt zonder nulls door de simulator); (d) `eventDate` met afspraakzone `America/New_York` en agendazone Amsterdam; (e) verschoven tijdgebonden item waarvan de datum daarna wordt ingetrokken wordt verwijderd (`lastDate`); (f) `overview` toont `linked` waar na Fixed-time-sync, onwaar na voorkeurswissel, weer waar na sync; (g) bestaande links-fixture zonder bronwijziging: eerste sync alleen PATCHes, nul inserts/deletes (A4); (h) locatie-wijziging verandert de hash.

**Acceptatie:** A3, A4, A5 (sync-deel), A12. **Verificatie:** `npm test`, `npm run typecheck`, `npm run build`. **Commit:** `feat: canonical calendar events with fixed-time support and English text`.

### P4 — Proefevent met factory, inhoudscontrole en paneel

**Doel:** het proefitem toont precies wat echte afspraken doen; readback wordt canoniek en inhoudelijk gecontroleerd; het paneel toont vorm, locatie en `defaultReminders` (spec §5, A6).

**Bestanden**
- Wijzig: `src/server/calendar-probe.ts` (46–54 body, 75–76 controle, Engelse meldingen), `src/app/settings/trial-panel.tsx` (vorm, locatie, `defaultReminders`, Engelse tekst), `src/app/settings/page.tsx:32` (geef `eventMode`/`eventTime` mee).
- Tests: `tests/calendar-probe.test.ts` (+ beide vormen, offset-readback, alleen-locatie-mutatie, `EVENT_CHANGED` bij titelwijziging), `tests/google-probe-guards.test.ts` (ongewijzigd groen).

**Interfaces:** consumeert `desiredEpisodeEvent`, `calendarEventHash`, `patchBody`/`insertBody` (P2/P3). `POST /api/probe` blijft `{ date }`.

**Stappen**
1. Body: `desiredEpisodeEvent(ctx, { title: "Example Show", tvmazeId: 0, platform: "Example broadcaster", country: null, runtimeMinutes: 60 }, { sourceId: 0, title: "Example episode", season: 1, number: 1, airdate: date, sourceUrl: "" }, eventId, { country: "Netherlands", names: ["Example service A", "Example service B"] })`; daarna `summary` voorzetten met `[W2W TEST] `, `description` vervangen door de proeftekst uit spec §5, `extendedProperties.private` door de probe-markers.
2. Controle op `:76`: eigendom (ongewijzigd) + `calendarEventHash({ ...event, reminders: request.reminders }) === calendarEventHash(request)` waarbij `request` de opgeslagen `requestJson` is; dat dekt `start`, `end`, `summary`, `location`, `description`. Verwijder de `dateTime`-weigering.
3. Paneel: per proef "All-day" of "Fixed time 20:00", teruggelezen `location`, en de agenda-`defaultReminders` (leeg → waarschuwing "No default notification for timed events is set on this calendar; set one in Google Calendar before the probe"). Nieuwe tekst in het Engels.
4. Tests: proef onder `FIXED_TIME` → `dateTime` met offset in readback, `created`; alleen-locatie-mutatie op de simulator → `EVENT_CHANGED`; titelmutatie → `EVENT_CHANGED`; All-day ongewijzigd; tweede proef op dezelfde datum geeft dezelfde proef terug.

**Acceptatie:** A6. **Verificatie:** `npm test`, `npm run typecheck`, `npm run build`. **Commit:** `feat: probe event follows the event style and verifies content`.

### P5 — Engelse servermeldingen, labels en `DELETE`-contract

**Doel:** alle `AppError`-meldingen, fallbacks en labels Engels; verwijderbevestiging `DELETE` (spec §3.1, §3.5).

**Bestanden**
- Wijzig: alle 28 bestanden met `new AppError(` onder `src/server/` en `src/app/api/` (113 aanroepen) plus `src/server/google-calendar.ts:38-45` (foutkaart), `src/server/errors.ts:14`, `src/server/sync.ts:17`, `src/server/catalog.ts:7`, `src/server/privacy.ts:9,61,65` (`deletionConfirmation = "DELETE"`), `src/lib/series-list.ts:4-6` (Running / Renewal undecided / Ended / Status unknown), `src/app/settings/privacy-panel.tsx:24-26` (DELETE).
- Tests: `tests/series-list.test.ts:26-29`, `tests/credentials.test.ts:20-21` (`/sleutel/` → `/key/`), `tests/shared-sync.test.ts:89` (`/broncontrole/` → `/source check/`), `tests/privacy.test.ts` (9× `VERWIJDEREN` → `DELETE`), `scripts/smoke-http.mjs:136-139` (`DELETE`).

**Stappen**
1. Vertaal per bestand; codes en HTTP-statussen ongewijzigd (grep `AppError("` vóór en na: gelijk aantal, gelijke codes).
2. Tests en smoke bijwerken; `npm test` groen.

**Acceptatie:** A1 (serverdeel). **Verificatie:** `npm test`, `npm run typecheck`, `npm run build`. **Commit:** `feat: English server messages and DELETE confirmation`.

### P6 — Engelse routes, redirects, navigatie en ankers

**Doel:** `/following`, `/invitation`, `/admin/users`, `/admin/series` met tijdelijke redirects; navigatie en ankers Engels (spec §3.2, A2).

**Bestanden**
- Verplaats: `src/app/volgen/` → `src/app/following/`, `src/app/uitnodiging/` → `src/app/invitation/`, `src/app/beheer/gebruikers/` → `src/app/admin/users/`, `src/app/beheer/series/` → `src/app/admin/series/`.
- Wijzig: `next.config.ts` (redirects), `src/app/navigation.tsx` (typen, paden, labels Agenda / Following / Settings / Users / Stats, `aria-label="Main navigation"`), `src/app/agenda-panel.tsx:14,17-18`, `src/app/invitation/invitation-entry.tsx:12` (`replaceState("/invitation")`), `src/server/invitations.ts:30` (`/invitation#token=`), `src/app/settings/preferences-panel.tsx:21` (`id="preferences"`), `src/app/settings/calendar-panel.tsx:38` (`id="calendar"`), `README.md` (routes).
- Tests: `tests/invitations.test.ts:53`; `scripts/smoke-http.mjs` regels 99-100, 155-168, 216, 221, 229-233 (nieuwe paden) + nieuwe asserts: oude paden → 307 met `Location` op het nieuwe pad.

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
- Wijzig: `src/app/layout.tsx` (`lang="en"`, description, footer met contact uit `W2W_PRIVACY_CONTACT`), `src/app/manifest.ts`, `src/app/page.tsx` (landing + ingelogde tak + neutrale `?error=`-tekst + `generateMetadata` met `robots: { index: true }` voor de onaangemelde tak), `src/app/privacy/page.tsx` (Engels, secties uit spec §7, `robots: index`), `src/app/agenda-panel.tsx:4` en `src/app/series-panel.tsx:11-12` (locale `en-GB`; datum-only blijft `timeZone: "UTC"`; tijdstip `hourCycle: "h23"`), `src/app/admin/series/page.tsx:22`, `src/app/series-panel.tsx` (alle teksten, Follow/Try/Trying, `id={`show-${show.id}`}` op de rij), `src/app/settings/*.tsx`, `src/app/admin/users/admin-users-panel.tsx` (teksten + `data.error` i.p.v. `data.error?.message`), `src/app/invitation/*`, `src/app/auth-buttons.tsx`, `src/server/agenda.ts:14` en `src/lib/series-list.ts:11` (`localeCompare(…, "en")`), `src/app/settings/page.tsx`, `src/app/following/page.tsx`, `public/icons/*.svg` ongewijzigd.
- Maak: `tests/english.test.ts` (A1-controle), `tests/date-format.test.ts` (Auckland).
- Tests: `scripts/smoke-http.mjs` (regel 224 linktekst "Read more on TVmaze"; asserts `lang="en"`, `aria-label="Main navigation"`, landingtekst "Access is by invitation for now", `/privacy` toont beheerder en contact; omgevingsvariabelen `W2W_PRIVACY_CONTROLLER="Example Operator"` en `W2W_PRIVACY_CONTACT="privacy@example.test"` in `env` op regel 24-31); `tests/agenda.test.ts` (ongewijzigd).

**A1-controle (contract)**
`tests/english.test.ts` leest alle `src/**/*.{ts,tsx}`, laat importregels en de attribuutwaarden van `className`, `id`, `htmlFor`, `href`, `key` weg, verzamelt stringliterals en JSX-tekst, en eist nul hoofdletterongevoelige woordgrens-treffers op `instellingen, volgen, proberen, melding, opnieuw, bevestig, verwijder, uitnodiging, beheer, gegevens, probeer, niet, geen, je, jouw, het, een, kies, aflevering, serie, klaar`. Treffers worden als `bestand:regel: woord` gerapporteerd. `agenda` staat bewust niet op de lijst.

**Stappen**
1. Vertaal pagina's en panelen; nieuwe teksten uit spec §6 (landing) en §7 (privacy, inclusief de Google API Services User Data Policy-zin en de Limited Use-eisen).
2. Datumopmaak: alleen locale wijzigen bij de datum-only helpers; `tests/date-format.test.ts` bewijst dat `2026-10-09` als "9 October 2026" rendert met voorkeur `Pacific/Auckland`.
3. `tests/english.test.ts` toevoegen en groen krijgen; handmatige doorloop van alle pagina's vastleggen in `docs/evidence/idea-241-stap-1.md` (P8-sjabloon).
4. Smoke bijwerken; `npm run test:http` groen.

**Acceptatie:** A1, A8. **Verificatie:** `npm test`, `npm run typecheck`, `npm run build`, `npm run test:http`. **Commit:** `feat: English interface, landing page and privacy policy`.

### P8 — Runbook, evidence-sjabloon, notities

**Doel:** de beheerstappen en het bewijs zijn vooraf uitgeschreven (spec §5, §8, §12).

**Bestanden**
- Maak: `docs/runbooks/idea-241-production-consent.md` (spec §8 stappen 1–8 als checklist; uitnodigingstekst met de alinea over het waarschuwingsscherm en de doorklikroute "Advanced → Go to When2Watch"; budgettabel met kolommen datum, genodigde/accountwissel, teller, grens 50), `docs/evidence/idea-241-stap-1.md` (secties A1 handmatige doorloop, A2 fragmentproef, A4 eerste productiesync met `updated`/`created`/`deleted` per serie, A5 vormwissel-readback, A6/A7 proefprocedure stappen 1–7, A9 consentomschakeling en niet-testaccount; placeholder-regels, geen tokens).
- Wijzig: `README.md` (routes, voorkeuren), `deploy/README.md` (migratiestap voor `20261008120000_idea241_event_style`, redirect-opruimnotitie, `W2W_PRIVACY_*` verplicht vóór publicatie), `.env.example` (`W2W_PRIVACY_CONTROLLER=`, `W2W_PRIVACY_CONTACT=`), `docs/praktijkproef.md` (verwijzing naar de nieuwe evidence; `calendar.events` op regel 128 markeren als te verwijderen in §8 stap 2).

**Acceptatie:** documenten aanwezig en consistent met spec §5/§8. **Verificatie:** `npm test` (ongewijzigd), review. **Commit:** `docs: production consent runbook and step-1 evidence template`.

### P9 — Uitrol, stap 0, praktijkbewijs en Production-consent (JP + agent)

**Doel:** stap 1 in productie met vastgelegd bewijs (A4, A5, A7, A9). Iedere stap hieronder vereist een expliciete opdracht van JP; het plan autoriseert niets.

1. **Stap 0 (JP):** opnieuw inloggen, `APP_CREATED`-agenda aanmaken, eerste sync, ontvangen melding; vastleggen in `docs/evidence/idea-219-r2.md`. Zonder dit geen uitrol.
2. **PR en CI:** PR van `claude/idea-241-stap-1` naar `main`; CI groen (A10). Merge alleen op opdracht.
3. **Uitrol op max2** volgens `deploy/README.md`: release bouwen, `pg_dump -Fc`, migratie als aparte stap (`--profile migrate`), nieuwe web-container, health, `current` omzetten; `.env` bevat `W2W_PRIVACY_CONTROLLER`/`W2W_PRIVACY_CONTACT`. Rollback alleen zolang niemand Fixed time gebruikt (spec §9).
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

Geen placeholders; typen en namen zijn over de taken heen gelijk (`SyncSettings`, `EventContext`, `desiredEpisodeEvent`, `calendarEventHash`, `eventDate`, `patchBody`, `insertBody`, `normalizeTimeZone`, `resolveWallTime`, `formatInZone`, `localDateIn`).

## Review record

Review-loop volgens `~/.claude/skills/review-loop` (fase plan, maximaal 10 rondes, twee dispatch-jobs: codex en claude). In opdracht van JP, 8 oktober 2026.
