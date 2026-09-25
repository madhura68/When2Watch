# IDEA-219 P1 — runbook preflight en beperkte Google-proef

Doel: vóór de bouw bewijzen of When2Watch werkt met alleen `calendar.calendarlist.readonly` + `calendar.app.created`, en de SQLite-bron precies kennen. Productiegrants en de productieagenda worden niet gewijzigd.

## SQLite-preflightbackup

Alleen lezen van de productiedatabase; schrijft één nieuwe privékopie in `db-backups` (0600). Uitvoer bevat uitsluitend aantallen, typen en checksums.

```bash
ssh janpeter@192.168.0.158 'umask 077; python3 - <<"PY"
import sqlite3, hashlib, os, datetime
src="/srv/apps/when2watch/data/when2watch.db"
dst="/srv/apps/when2watch/db-backups/idea219-preflight-"+datetime.datetime.now(datetime.UTC).strftime("%Y%m%dT%H%M%SZ")+".db"
s=sqlite3.connect(f"file:{src}?mode=ro",uri=True); print("journal_mode",s.execute("pragma journal_mode").fetchone()[0])
d=sqlite3.connect(dst); s.backup(d); d.close(); s.close()
c=sqlite3.connect(f"file:{dst}?mode=ro",uri=True)
print("backup",dst,oct(os.stat(dst).st_mode&0o777),"sha256",hashlib.sha256(open(dst,"rb").read()).hexdigest())
print("integrity",c.execute("pragma integrity_check").fetchall(),"fk_violations",len(c.execute("pragma foreign_key_check").fetchall()))
for (t,) in c.execute("select name from sqlite_master where type=\"table\" and name not like \"sqlite_%\" order by name").fetchall():
  print("\n##",t,"rows",c.execute(f"select count(*) from \"{t}\"").fetchone()[0])
  for col in c.execute(f"pragma table_info(\"{t}\")").fetchall():
    dist=dict(c.execute(f"select typeof(\"{col[1]}\"),count(*) from \"{t}\" group by 1").fetchall())
    shape=c.execute(f"select min(length(\"{col[1]}\")),max(length(\"{col[1]}\")) from \"{t}\" where typeof(\"{col[1]}\") in (\"integer\",\"text\")").fetchone() if col[2].upper()=="DATETIME" else ""
    print(" ",col[1],col[2],dist,shape)
PY'
```

Verwacht: `integrity [('ok',)]`, `fk_violations 0`, en per DATETIME-kolom één opslagtype. Leg aantallen en typen vast in `docs/evidence/idea-219-preflight.md`; bij een onverwacht type eerst het conversiecontract aanpassen, niet de importer laten raden.

## Beperkte Google-proef

### Voorbereiding (JP)

1. Maak in Google Cloud een **apart proef-OAuth-client** (type Web) met redirect-URI `http://localhost:3401/api/auth/callback/google`. Niet de productieclient: de proef mag grants intrekken.
2. Gebruik een proefaccount dat als testgebruiker is toegevoegd. Zet in een private map (0700) `config.json` (0600):

```json
{ "accounts": ["<proefaccount>@gmail.com"], "credentials": "/abs/pad/probe-client.json",
  "probeClientIsNotProduction": true, "calendarPrefix": "When2Watch proef",
  "existingCalendarId": "<id van een bestaande niet-app-agenda van dat account, alleen gelezen>" }
```

### Uitvoering

```bash
W2W_LIMITED_PROBE_CONFIG=/abs/pad/config.json npx tsx scripts/prove-limited-calendar.ts --authorized-limited-calendar-probe
```

Open `http://localhost:3401/`, kies **Autoriseer (include_granted_scopes=false)** en geef toestemming met het proefaccount. Het script voert daarna zelf uit:

| Stap | Bewijs |
|---|---|
| `authorize` | account op allowlist, `email_verified` |
| `grant-narrow` | tokeninfo toont effectief alleen identity + beide smalle scopes; anders FAIL met de extra scopes |
| `list-paginated` | agendalijst met pagina's van 1 volledig gelezen |
| `calendar-created` | agenda met vrije naam aangemaakt en teruggevonden in de lijst |
| `event-crud` | proefevent insert/get/patch (If-Match)/delete; tweede insert met dezelfde ID geeft 409 |
| `calendar-renamed` | rename, ID ongewijzigd in readback |
| `token-refresh` | refresh-token werkt; scope van het nieuwe token vastgelegd |
| `lost-create-reconciled` | POST-antwoord bewust weggegooid; exact één nieuwe agenda met nonce teruggevonden, geen tweede POST |
| `legacy-readonly-checked` | bestaande niet-app-agenda: alleen GET-statuscodes (verwacht: lijst leesbaar, events 403/404) |

Staat en geschoonde responsvormen staan in `limited-calendar-state/` naast de config (privé). Bij een onderbreking hervat `--resume` met het opgeslagen token; afgeronde stappen worden niet herhaald en een verzonden aanmaak wordt nooit opnieuw gestuurd.

**Grants smaller na herautorisatie?** Faalt `grant-narrow` doordat eerder bredere scopes zijn meegekomen: trek alleen de toegang van het *proefclient* in (myaccount.google.com → Beveiliging → Apps van derden), verwijder `limited-calendar-state/state.json` en autoriseer opnieuw. Noteer in het bewijs dat intrekken nodig was. Herhaal daarna eenmaal met `include_granted_scopes=true` en noteer of de oude scopes terugkomen.

### Afronding

Neem `outcome` (PASSED/BLOCKED/FAILED + oorzaak) en de geschoonde `shapes` over in `docs/evidence/idea-219-preflight.md`. Controleer dat er geen e-mailadressen, agenda-ID's of tokens in staan. De proefagenda's mogen blijven staan of handmatig door JP worden verwijderd; het script verwijdert geen agenda's.

FAILED of BLOCKED blokkeert P9 en R2, niet de providerwissel van R1.
