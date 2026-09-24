# When2Watch — max2-uitrol 24 september 2026

Op expliciete opdracht van JP is de gemergede PWA-release uit PR #3 uitgerold.

- Bron: `fb7a690723d17fea75e53eb636038930e8bc68ce` (main).
- Vorige release: `c04812c`; image en release bewaard.
- Nieuwe release: `/srv/apps/when2watch/releases/fb7a690`.
- Git-archive van de vastgelegde commit, Docker-build op max2 geslaagd.
- Alleen `when2watch-web-1` gestopt/vervangen; geen runner-, proxy- of ops-agentwijzigingen.
- Na stop consistente SQLite-backup met backup-API en integrity_check=ok:
  `/srv/apps/when2watch/db-backups/pre-fb7a690-20260924T192257Z.db`, mode 0600.
- Configbackup: `/srv/apps/when2watch/config-backups/.env.20260924T192257Z.before-fb7a690`.
- Startup heeft migratie `20260924200000_series_trying` toegepast.
- Vergelijking van alle bestaande kolomwaarden in 15 applicatietabellen vóór/na de upgrade: identiek. Geen secrets of rijen opgenomen in bewijs.
- Behouden: 22 series, 469 afleveringen, 23 agendakoppelingen.
- Database-integriteit na upgrade: ok; trying-kolom aanwezig.
- Container healthy; publieke HTTPS-health 200.
- `current` en `RELEASE_TAG` verwijzen naar fb7a690.
- Publiek PWA-manifest heeft standalone, root-scope en goedgekeurde iconen; Apple-touch-icon-180.png geeft HTTP 200.
- Geschoond machinebewijs: `/srv/apps/when2watch/deploy-fb7a690-evidence.json`.

De deployroute is de bestaande SSH/Compose-procedure uit deploy/README.md.
De onderzochte Ops-dashboard-route gebruikt vaste YAML-flows en command_keys;
When2Watch heeft daar nog geen registratie. Het voorstel daarvoor staat in
`docs/plans/2026-09-24-dashboard-deploy.md`.

CI toegevoegd in PR #4. Verse lokale verificatie: 153 tests / 19 bestanden,
productiebuild, typecheck en 154 HTTP-asserties geslaagd. Docker-image voor de
gedeployde applicatiebron op max2 gebouwd. De echte Forgejo-run wordt apart
gerapporteerd in de PR; lokale checks zijn niet hetzelfde als een groene CI-run.

Dit bewijs vervangt de oudere vermelding dat deployment nog niet was toegestaan/uitgevoerd.
Fysieke iPhone/iPad-installatie, standalone Google-login en heropenen/uitloggen
zijn nog niet bevestigd. De overgang van een eerder geïnstalleerde PWA naar
een volgende release vraagt nu een volgende releaseproef. Geen nieuwe Google-
meldingsproef uitgevoerd. T-13–T-16 blijven op review en T-11 blijft in de wacht.
