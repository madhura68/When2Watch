# Vis-designsysteem toegepast — bewijs

Status 8 oktober 2026: **gebouwd en lokaal geverifieerd; PR naar `main` open, geen merge of deploy.** Sprint S-2026-10-08-2, PBI-9, ST-014, taken T-38 t/m T-41.

Bron: Design System-artifact **Vis** (https://claude.ai/artifact/1GANGeE2h1sJdb7sC3drwU), `project/tokens.json` versie 1, `project/README.md` en de component-README's (Button, Card, Chip, StatusPill, TextField, Link). Basis `origin/main` `c35cd1a` (IDEA-241 gemerged).

## Commits

| Commit | Taak | Inhoud |
|---|---|---|
| `6006dec` | T-38 | Vis-tokens light + dark, gevendorde fonts via `next/font/local`, basistypografie, theme_color |
| `c28ece6` | T-39 | Pill-knoppen, product-/feature-cards, chips, statuspills, notices, inputs, navigatie |
| `0f8bc7f` | T-40 | Polish na visuele controle; dev-seed; screenshots |
| `830e3a7` | T-41 | Evidence en README |
| `8764d39` | review | Reviewfixes: seed-guard, resterende tokens, Vis-artwork voor icoon en banner |

## Verificatie (lokaal, 8 oktober 2026)

- `npm run typecheck`: geslaagd na elke taak.
- `npm test`: 317/317 in 43 bestanden (lokale PostgreSQL 17, `w2w-test-pg`), inclusief `tests/english.test.ts`.
- `npm run build`: geslaagd; fonts komen uit `src/app/fonts/` (geen verzoek naar fonts.googleapis.com of fonts.gstatic.com).
- Visueel in de ingebouwde browser met `npm run dev`, lokale database `w2w_vis_dev` en de synthetische ADMIN-owner uit `scripts/dev/seed-owner.mjs` (sessiecookie, twee series, afleveringen, calendar binding). Geen Google-aanvragen.

## Schermen

| Scherm | Light | Dark | 375px |
|---|---|---|---|
| Landing `/` | `vis-design/landing-light.jpg` | gecontroleerd | gecontroleerd |
| Privacy | gecontroleerd | `vis-design/privacy-dark.jpg` | gecontroleerd |
| Invitation | `vis-design/invitation-light.jpg` | gecontroleerd | gecontroleerd |
| Agenda | `vis-design/agenda-light.jpg` | `vis-design/agenda-dark.jpg` | `vis-design/agenda-mobile-375.jpg` |
| Following | `vis-design/following-light.jpg` | `vis-design/following-dark.jpg` | `vis-design/following-mobile-375.jpg` |
| Settings | `vis-design/settings-light.jpg` | `vis-design/settings-dark.jpg` | `vis-design/settings-mobile-375.jpg`, `-calendar.jpg` |
| Admin users | `vis-design/admin-users-light.jpg` | gecontroleerd | gecontroleerd |
| Admin stats | `vis-design/admin-series-light.jpg` | gecontroleerd | gecontroleerd |

Op 375px is `scrollWidth` gelijk aan `innerWidth`: geen horizontale paginascroll.

## Ember per scherm

| Scherm | Ember (`.primary`) |
|---|---|
| Landing | Sign in with Google |
| Invitation | Accept invitation with Google |
| Following | Sync now |
| Admin users | Create invitation |
| Agenda, Settings, Privacy, Admin stats | geen; submits zijn dark |

## Bevindingen en herstel in T-40

- Radio- en checkbox-inputs kregen `width: 100%` uit `.settings-form`; nu 18px.
- Navigatiepills liepen op 375px buiten beeld; pills lopen nu om.

## Bewuste afwijkingen en uitbreidingen op Vis

- **Fonts gevendord** in plaats van `next/font/google`: Turbopack in Next 16.3.6 faalt op `next/font/google` ("next/font/google queries have exactly one entry"). Public Sans en Source Serif 4 (latin, SIL OFL) staan in `src/app/fonts/`; de build heeft daardoor geen netwerk nodig.
- `button.danger` is outlined in `status-danger`; Vis kent geen danger-knop.
- `.notice` (info) is een dust-callout zonder rand; success/error zijn statusregels met teken.
- De merkpunt na "When2Watch" staat in ink, niet in accent.

## Reviewronde 1 (s4m-codex-reviewer, 8 oktober 2026, 2 BLOCKER)

1. **Seed-guard matchte een substring in de hele DSN.** Bevestigd: `postgresql://user:localhost@db.example.invalid/production` werd geaccepteerd. Nu wordt de URL vóór Prisma geparsed: scheme `postgres(ql):`, hostname exact in {localhost, 127.0.0.1, ::1, [::1]} en databasenaam `w2w_*`. Regressiecontrole met vier foute DSN's (hostnaam-substring in wachtwoord, `localhost.example.invalid`, loopback met productiedatabase, verkeerd scheme): alle vier geweigerd.
2. **Resterende niet-token-waarden.** Bevestigd. Alle `padding`/`gap`/`margin` in `globals.css` staan nu op `--spacing-*` (afgerond naar de dichtstbijzijnde stap); de 4px-radii van zoekresultaatafbeeldingen en poster-placeholder op `--radius-ghostbutton`; de agenda-daglabel op weight 500. De 58px-inspringing van de match-acties is `calc(44px + var(--spacing-12))` (posterbreedte plus gap). Uitgezonderd: de 8px-statusmarkering en de 2px-radius van de diamant, dat zijn markvormen, geen spacing. Agenda, following en settings opnieuw bekeken na de wijziging.

## Artwork in Vis-stijl (op opdracht van JP, na de sprint)

- `public/icons/when2watch-scherm.svg` en `-maskable.svg`: paper-achtergrond (`surface-canvas`), ink-scherm met paper-W's, voet in `ink-tertiary`, één ember-lampje (`accent`). PNG's gerenderd met `scripts/dev/render-icons.mjs` (sharp): 16, 32, 180, 192, 512 en de maskable-varianten.
- `public/images/when2watch-banner.svg`: dust-vlak met `surface-high`-ringen, lijnwerk in `ink-tertiary`, ember-afspeelteken. Een `prefers-color-scheme: dark`-blok in de SVG schakelt naar de dark-tokens; `agenda-banner-light.jpg` en `agenda-banner-dark.jpg` tonen beide.

## Buiten scope, bewust niet gewijzigd

- Copy en flows zijn ongewijzigd.
- De calendar-status op de screenshots toont "Syncing is paused" omdat de synthetische account geen Google-rechten heeft; dat is seed-gedrag, geen regressie.

## Niet bewezen

- Weergave op een echte iPhone als PWA en na deploy op max2. Dat volgt alleen op opdracht.
