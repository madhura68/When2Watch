# When2Watch

Eerste increment: Google-koppeling en een all-day meldingsproef met Slow Horses. Deploydoel: max2, `https://when2watch.jp-visser.nl`.

## Lokaal

Node.js 24 of nieuwer. Installeer met `npm ci`, kopieer `.env.example` naar `.env` en vul alleen de eigen OAuth-client en gekozen proefaccount/agenda in. Maak `data/` aan. Gebruik `RUST_LOG=info npm run db:deploy`, `npm run db:generate` en `npm run dev`.

Google OAuth-callback: `/api/auth/callback/google`. Lokale ontwikkeling vereist een afzonderlijk geregistreerde localhost redirect-URI. De gedeployde app vereist HTTPS.

## Controle

`npm test`, `npm run typecheck`, `npm run build`. Tests maken tijdelijke SQLite-databases; Google-antwoorden zijn expliciete simulaties. Zie [praktijkproef](docs/praktijkproef.md) voor de nog afzonderlijk te bewijzen echte OAuth- en notificatieresultaten en de max2-deploy/herstelroute.

Tokens blijven in de database op het privévolume. De browser krijgt alleen een sessiecookie en de gegevens voor het eigen proefscherm. Wijzigingen gebruiken de expliciet gekozen agenda en de eigen When2Watch-eventmarkeringen. Geen automatische seriesynchronisatie of cron in deze eerste proefversie.
