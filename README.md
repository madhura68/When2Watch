# When2Watch

Eerste increment: Google-koppeling en een all-day meldingsproef met Slow Horses. Deploydoel: max2, `https://when2watch.jp-visser.nl`.

## Lokaal

Node.js 24 of nieuwer. Installeer met `npm ci`, kopieer `.env.example` naar `.env` en vul alleen de eigen OAuth-client en gekozen proefaccount/agenda in. Maak `data/` aan. Gebruik `RUST_LOG=info npm run db:deploy`, `npm run db:generate` en `npm run dev`.

Google OAuth-callback: `/api/auth/callback/google`. Lokale ontwikkeling vereist een afzonderlijk geregistreerde localhost redirect-URI. De gedeployde app vereist HTTPS.

## Controle

`npm test`, `npm run build`, `npm run typecheck` en daarna `npm run test:http`. Tests en HTTP-proef draaien op echte PostgreSQL 17: start een wegwerpserver met `npm run test:db:up` en zet `W2W_TEST_DATABASE_URL=postgresql://postgres:w2w-local-test@127.0.0.1:55432/postgres`. Alleen lokale hosts worden geaccepteerd; iedere test krijgt een eigen `w2w_test_*`-database. De oude SQLite-migraties staan gearchiveerd in `prisma/legacy-sqlite/` als herstelbasis en importbron (`scripts/migration/`); Google-antwoorden zijn expliciete simulaties. De HTTP-proef gebruikt synthetische sessies en doet geen Google-aanvragen. Zie [praktijkproef](docs/praktijkproef.md) voor de nog afzonderlijk te bewijzen echte OAuth- en notificatieresultaten en de max2-deploy/herstelroute.

Tokens blijven in de database op het privévolume. De browser krijgt alleen een sessiecookie en de gegevens voor het eigen proefscherm. Wijzigingen gebruiken de expliciet gekozen agenda en de eigen When2Watch-eventmarkeringen. Geen automatische seriesynchronisatie of cron in deze eerste proefversie.
