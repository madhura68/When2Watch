# When2Watch

Volg TV-series via TVmaze en zet hun uitzendingen als eigen, gemarkeerde items in een gekozen Google-agenda. Sinds IDEA-219 R2 is er één gedeelde seriecatalogus voor meerdere gebruikers, die via eenmalige uitnodigingen toegang krijgen. Deploydoel: max2, `https://when2watch.jp-visser.nl`; operationele details in [deploy/README.md](deploy/README.md).

## Lokaal

Node.js 24 of nieuwer en een PostgreSQL 17-database. Installeer met `npm ci`, kopieer `.env.example` naar `.env`, laat `DATABASE_URL` naar PostgreSQL wijzen en vul de eigen OAuth-client in. Google-tokens worden verzegeld opgeslagen: zet ook `W2W_CREDENTIAL_KEYS=<id>:<32 bytes base64>` (zonder sleutel weigert de app Google-toegang). Gebruik `npm run db:deploy`, `npm run db:generate` en `npm run dev`.

Google OAuth-callback: `/api/auth/callback/google`. Lokale ontwikkeling vereist een afzonderlijk geregistreerde localhost redirect-URI. De gedeployde app vereist HTTPS.

Huisstijl: de tokens in `src/app/globals.css` volgen het Vis-designsysteem (light en dark via `prefers-color-scheme`). De fonts Public Sans en Source Serif 4 staan gevendord in `src/app/fonts/` (SIL OFL) en worden via `next/font/local` geladen; de build heeft er geen netwerk voor nodig en de browser vraagt niets bij Google Fonts op. Voor een visuele controle met een ingelogde gebruiker zonder Google: `node scripts/dev/seed-owner.mjs` tegen een lokale database en de afgedrukte sessiecookie zetten.

## Controle

`npm test`, `npm run build`, `npm run typecheck` en daarna `npm run test:http`. Tests en HTTP-proef draaien op echte PostgreSQL 17: start een wegwerpserver met `npm run test:db:up` en zet `W2W_TEST_DATABASE_URL=postgresql://postgres:w2w-local-test@127.0.0.1:55432/postgres`. Alleen lokale hosts worden geaccepteerd; iedere test krijgt een eigen `w2w_test_*`-database. De oude SQLite-migraties staan gearchiveerd in `prisma/legacy-sqlite/` als herstelbasis en importbron (`scripts/migration/`); Google-antwoorden zijn expliciete simulaties. De HTTP-proef gebruikt synthetische sessies en doet geen Google-aanvragen. Zie [praktijkproef](docs/praktijkproef.md) voor de nog afzonderlijk te bewijzen echte OAuth- en notificatieresultaten en de max2-deploy/herstelroute.

Tokens staan verzegeld in de database; de sleutel staat buiten de database. De browser krijgt alleen een sessiecookie en de eigen gegevens. Wijzigingen gebruiken de expliciet gekozen agenda en de eigen When2Watch-eventmarkeringen. Een dagelijkse cron (`POST /api/cron/sync`, zie [deploy/README.md](deploy/README.md)) synchroniseert de gevolgde series en voert de retentie uit; `Sync now` gebruikt dezelfde syncfunctie.

## IDEA-241 stap 1

Engelse routes: `/following`, `/invitation`, `/admin/users`, `/admin/series`; publieke landing en `/privacy`. In Settings kies je Event style (All-day of Fixed time), een HH:MM-tijd en een IANA-timezone. De volgende sync past de voorkeur toe binnen het bestaande venster. Google Calendar beheert de herinneringen. Tijdstip en regio veranderen de oorspronkelijke release-kalenderdatum niet. Proeven volgen de voorkeur en tonen de eigen opgeslagen stijl en locatie.

Uitrol/consent alleen op opdracht: `deploy/README.md`, `docs/runbooks/idea-241-production-consent.md`; praktijkbewijs in `docs/evidence/idea-241-stap-1.md`.
