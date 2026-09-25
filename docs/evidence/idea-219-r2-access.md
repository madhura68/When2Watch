# IDEA-219 R2 — toegangsmatrix private endpoints

Stand na P6 (T-22). P9 voegt zijn routes toe. `requireUser` en `requireAdmin` (`src/server/user-access.ts`) lezen bij elk verzoek de actuele `User.accessStatus`/`role` uit de database. BLOCKED of UNCLAIMED geeft 401, ook met een geldige sessie. Een `userId` in body of query wordt nooit gebruikt: het object wordt altijd gezocht op de sessiegebruiker, dus een object van een ander geeft een neutrale 404.

| Endpoint | Methode | Toegang | Objecteigendom | Cache |
|---|---|---|---|---|
| `/api/shows` | GET | ACTIVE | overzicht op sessie-userId | private, no-store |
| `/api/shows` | POST | ACTIVE + same-origin | serie wordt aan sessie-userId toegevoegd | private, no-store |
| `/api/shows` | PATCH | ACTIVE + same-origin | `updateMany` op userId+tvmazeId; ander → 404 | private, no-store |
| `/api/shows/search` | GET | ACTIVE | geen persoonlijke data | private, no-store |
| `/api/sync` | POST | ACTIVE + same-origin | eigen actieve binding en account | private, no-store |
| `/api/probe` | POST/DELETE | ACTIVE + same-origin | eigen binding; verwijderen alleen eigen probe, anders 404 | private, no-store |
| `/api/calendar/verify` | POST | ACTIVE + same-origin | eigen actieve binding | private, no-store |
| `/api/settings/preferences` | GET/PATCH | ACTIVE (+ same-origin) | eigen voorkeuren | private, no-store |
| `/api/settings/google` | GET | ACTIVE | eigen login-, agenda-account en agenda; geen tokens/secrets | private, no-store |
| `/api/settings/google` | POST calendar/candidate | ACTIVE + same-origin | poging gebonden aan eigen sessie-hash; alleen `calendarlist.readonly` + `app.created`, `include_granted_scopes=false`; candidate deactiveert de binding van het oude account (historie blijft) | private, no-store |
| `/api/settings/google` | POST replace-client | **ADMIN** + same-origin | centrale OAuth-client; niet-admin 403 | private, no-store |
| `/api/settings/calendars` | GET/POST | ACTIVE (+ same-origin) | eigen `UserConnection`-account; lijst toont alleen bewezen app-agenda's, `?name=` toont naamgenoten (alleen bewezen herbruikbaar); POST create (NAME_TAKEN/NAME_REUSABLE) of abandon van eigen onbevestigde aanvraag | private, no-store |
| `/api/settings/calendar` | POST | ACTIVE + same-origin | schrijft alleen de eigen binding; alleen bewezen app-agenda (NOT_APP_CALENDAR); wissel alleen met `switch` + `acknowledgeOldItems` (anders 409/400) | private, no-store |
| `/api/account/export` | GET | ACTIVE | alleen eigen gegevens via whitelist; geen tokens, sessies, uitnodigingshashes of andere gebruikers | private, no-store, attachment |
| `/api/account/delete` | POST | ACTIVE + same-origin + login ≤ 10 min + "VERWIJDEREN" | alleen het eigen account; laatste admin 409; geen admin- of bulkvariant; journaal vóór verwijderen | private, no-store |
| `/privacy` | GET | publiek | geen persoonsgegevens | — |
| `/api/invitations/exchange` | POST | anoniem, same-origin, max. 10 per 10 min per client | token alleen in POST-body; ruilt voor 15-minuten-browserflow (HttpOnly-cookie), claimt niets | private, no-store, no-referrer |
| `/api/admin/invitations` | GET/POST/DELETE | **ADMIN** (+ same-origin) | lijst zonder tokens; link één keer getoond; intrekken | private, no-store |
| `/api/admin/users` | GET/PATCH | **ADMIN** (+ same-origin) | alleen naam/e-mail/rol/status; blokkeren onder gebruikerslock, laatste admin 409 | private, no-store |
| `/api/auth/*` | GET/POST | NextAuth | login alleen voor een Google-subject van een ACTIVE gebruiker; geen vrije registratie (`createUser` geweigerd); met uitnodigingsflow: in `callbacks.signIn` één transactie (uitnodiging claimen, gebruiker activeren/aanmaken, identiteit koppelen), geweigerd als al een andere gebruiker is ingelogd | — |
| `/api/cron/sync` | POST | CRON_SECRET | tot P8 alleen de ACTIVE installatie-eigenaar | — |

Pagina's (`/`, `/volgen`, `/settings`, `/beheer/gebruikers` alleen ADMIN; `/uitnodiging` publiek zonder externe assets) zijn `force-dynamic` en gebruiken `currentUser()` met dezelfde databasecontrole.

Bewijs: `tests/user-access.test.ts` (ACTIVE/BLOCKED/UNCLAIMED, admin-403, login-identiteit zonder merge op e-mail), `tests/user-isolation.test.ts` (A/B voor agendakeuze, binding, instellingen, probe-404, voorkeuren, series, andermans Google-identiteit, OAuth-client alleen admin) `tests/invitations.test.ts` (hash-opslag, fragmentlink, neutrale fouten, echte NextAuth 4.24.15-volgorde, race met één activering, geen vrije registratie), `tests/admin-users.test.ts` en `scripts/smoke-http.mjs` (173 HTTP-asserties, waaronder de sentinel-token die nooit in serverlogs verschijnt, waaronder UNCLAIMED-sessie 401 op elk privaat endpoint, no-store-headers en niet-admin 403).

P9: een legacy-binding (niet door de app aangemaakt) of een account zonder beide smalle rechten pauzeert sync en probe; lokaal volgen blijft werken, stoppen verwijdert dan niets op afstand. Bewijs: `tests/limited-calendar.test.ts`.

P10: alle opgeslagen Google-secrets (tokens, clientsecret, lopende koppeltokens) staan versleuteld met AES-256-GCM, gebonden aan record en veld. Bewijs: `tests/credentials.test.ts` (inclusief een plaintextscan van de hele testdatabase), `tests/privacy.test.ts` (export, verwijderen, journaal, herstel) en `tests/retention.test.ts`.
