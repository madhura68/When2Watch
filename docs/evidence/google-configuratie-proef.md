# B0 — Google-configuratieproef

Status op 24 september 2026: **echte login, kandidaataccount, agendacreatie,
herstart en itemverplaatsing bewezen; clientvervangingsproef nog open**.
T-8 / ST-004, sprint S-2026-09-24-2. A1/A2 zijn op max2 bewezen; B1/B2/C1 zijn
nog niet gestart. Dit document wordt aangevuld met echte uitkomsten.

## Afbakening

`scripts/prove-google-configuration.ts` start uitsluitend met de expliciete vlag
`--authorized-configuration-probe` en een absolute private configuratie via
`W2W_GOOGLE_PROBE_CONFIG`. Het luistert op localhost:3401, gebruikt een afzonderlijke
SQLite-database naast die configuratie en raakt de productieconfiguratie niet.
De configuratie heeft mode 0600; de map met proefstaat mode 0700. Tokens blijven
in die private map; foutuitvoer bevat alleen codes.

Het harnas gebruikt de gepinde NextAuth 4.24.15-verwerking, Prisma-adapter en
Google-provider met state en PKCE. Een eigenaar start een verbinding vanuit
zijn proefsessie; de callback moet diezelfde sessiebinding behouden. De eerste
login vraagt alleen identiteit. Calendar-scopes worden afzonderlijk gevraagd.
Nieuwe tokens worden eerst kandidaat, gekoppeld aan hun eigen OAuth-client.
Een nieuwe client wordt pas na readbacks met zowel oud als nieuw bevestigd.

De lokale probe is geen definitieve instellingen-UI. De onderstaande echte
browsercallbacks bewijzen een deel van het contract. De overige Google-responses
moeten de aannames nog bewijzen voordat B1 wordt gebouwd.

## Reproductie

Maak buiten Git een private JSON-configuratie, bijvoorbeeld:

```json
{
  "emails": ["eigenaar@example.test", "tweede@example.test"],
  "credentials": ["/private/huidige-webclient.json", "/private/nieuwe-webclient.json"]
}
```

De twee webclients moeten verschillend zijn en beide deze redirect hebben:
`http://localhost:3401/api/auth/callback/google`. Beide proefaccounts moeten
toegelaten zijn in het Google Cloud-project. Eén credentialpad volstaat voor
de eerste stappen; de tweede client is vereist voor de vervangingsproef.

```sh
W2W_GOOGLE_PROBE_CONFIG=/absolute/private/config.json \
  ./node_modules/.bin/tsx scripts/prove-google-configuration.ts \
  --authorized-configuration-probe
```

Open localhost:3401. Doorloop eigenaar-login, opnieuw verbinden, aanvullende
toestemming annuleren/weigeren, toestemming voor proefagenda's, koppelen van
het tweede account en clientvervanging. Controleer na iedere callback de interne
eigenaar en dat de actieve verbinding pas bij expliciete bevestiging verandert.
Maak uitsluitend de twee herkenbare proefagenda's via het harnas.

De agendalijst gebruikt pagina's van één item om echte paginering af te dwingen.
Agenda-aanmaak wordt vóór POST vastgelegd en nooit blind herhaald. Na onzekere
aanmaak eerst de uitkomst onderzoeken. Kalender-ID's worden teruggelezen via
CalendarList; geen keuze uitsluitend op naam en geen extra CalendarList-write.

Herstart het proefproces met dezelfde private configuratie en lees beide
agenda's opnieuw. Beproef vervolgens één synthetisch toekomstig item: bron
bevestigen, doel bevestigen, daarna bron verwijderen met markering en ETag.
De aparte opruimactie verwijdert alleen het bevestigde doelproefitem.
De proefagenda's blijven bestaan en worden hier expliciet vermeld zodra gemaakt.

De geschoonde echte Calendar-responses komen onder `tests/fixtures/google/`.
Identificatoren en persoonlijke tekst worden vervangen; veldtypen en aanwezige
velden blijven behouden. Callbackobservaties zijn afzonderlijke metingen, geen
nagemaakte providerresponses.

## Tot nu toe gecontroleerd

- Typecheck van het harnas geslaagd.
- Zonder expliciete operatorvlag weigert het script te starten.
- Lokale startpagina werkt met een afzonderlijke lege SQLite-database.
- Anonieme NextAuth-sessie is leeg; de Google-provider geeft exact de proefcallback.
- Een POST vanaf een andere origin wordt geweigerd.
- Chrome toont de lokale proefstartpagina.

Deze eerste controles waren lokaal; het onderstaande vervolg bevat echte
Google-callbacks en Calendar-responses. Er zijn twee proefagenda's aangemaakt.
Het synthetische proefitem en zijn doelkopie zijn na bevestiging opgeruimd.

### Vervolg op 24 september: gewenste proefeigenaar en aanmeldstart

De eigenaar verduidelijkte welk van de twee opgegeven accounts de proefeigenaar
moet zijn en bevestigde dat dit account als testgebruiker is toegevoegd. De
private configuratie is daarop aangepast. Eerst is geverifieerd dat de
proefdatabase nul gebruikers, accounts en sessies had; er zijn geen bestaande
eigenaarsgegevens verplaatst. De startpagina toont nu het gekozen account en
Google ontvangt dit account als login-hint.

Een losse/oude NextAuth-aanmeldpagina had geen bijbehorende proefaanvraag.
Een regressiecheck gaf eerst HTTP 200; na de correctie geeft zo'n ongekoppelde
aanmeld- of callbackroute HTTP 303 naar de proefstart. Drie tests controleren
vervaltijd, cookie-/sessiebinding en veilige foutclassificatie. De suite telt nu
107 geslaagde tests; typecheck slaagt.

De echte browser onthulde vervolgens dat de native formulier-POST werd
geweigerd: CSRF-token aanwezig en passend, maar Origin week af. Het harnas
stuurde `Referrer-Policy: no-referrer`; bij zulke formulieraanvragen maakt de
browser de Origin `null`. Dit is beschreven in de
[MDN-uitleg over Referrer-Policy en Origin](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy).
Na wijziging naar `same-origin` bereikte dezelfde browser via dezelfde knop de
echte NextAuth-aanmeldpagina en vervolgens Google. De Origin- en CSRF-controles
blijven vereist; het gaat niet om een uitzondering op die controles.

Google toonde aanvankelijk **HTTP 400 / `redirect_uri_mismatch`** voor
`http://localhost:3401/api/auth/callback/google`. Dit bevestigt dat de aangevraagde
proefredirect toen niet door de gebruikte webclient werd geaccepteerd. De
eigenaar heeft dit opgelost; de succesvolle callback hieronder bevestigt dat
de redirect inmiddels werkt. De oorspronkelijke drie
`OAuthCallback`-fouten hadden geen gedetailleerde foutregistratie; hun precieze
provideroorzaak is daarmee niet achteraf vastgesteld.

### Echte Chrome-callbacks op 24 september

Bronversie: `13c592e23a2f7d1e8b2e47583ce61a6011be5b72`. De door de eigenaar
aangewezen proefeigenaar logde in via Chrome. Alleen de afzonderlijke lokale
proefdatabase is gebruikt. Tijden in deze tabel zijn UTC.

| Tijd | Handeling | Werkelijke uitkomst |
| --- | --- | --- |
| 12:11:19 | Eerste login, alleen identiteit gevraagd | Eén interne gebruiker, één Google-account, één databasesessie. State- en PKCE-cookies aanwezig; refresh token ontvangen en uitsluitend privaat opgeslagen. |
| 12:16:23 | Dezelfde eigenaar opnieuw verbinden | Dezelfde interne gebruiker en één account behouden. Nieuwe tokens eerst als voorstel opgeslagen; actieve verbinding ongewijzigd. |
| 12:16:29 | Herverbinding afzonderlijk bevestigen | Proefverbinding omgezet naar het zojuist bewezen voorstel. |
| 12:17:28 | Aanvullende Calendar-toestemming annuleren | Echte callback met providerfout `access_denied`, zonder authorization code. Eigenaar, actieve verbinding en bestaande sessie bleven intact; de proefstart bleef ingelogd bruikbaar. |
| 12:18:36 | Drie gevraagde Calendar-rechten niet aanvinken, wel doorgaan | Google stuurde een succesvolle callback met uitsluitend identiteitsrechten. Dezelfde interne eigenaar behouden; actieve verbinding ongewijzigd. Geen kalenderaanmaak gestart. |
| 12:21:52 | Drie Calendar-rechten verlenen, na expliciete gebruikersbevestiging | Werkelijke callback bevat alle drie de gevraagde Calendar-scopes; dezelfde interne eigenaar en één account behouden. Daarna afzonderlijk bevestigd in het harnas. |
| 12:24:57 | Tweede account verbinden, met toestemming voor agenda-aanmaak | Dezelfde interne gebruiker, nu twee verschillende Google-subjects/accounts. Actieve verbinding bleef ongewijzigd; de nieuwe verbinding is vervolgens alleen als kandidaat bevestigd. |

De werkelijk verleende scopes bij de eerste drie succesvolle callbacks zijn steeds:

```text
openid
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/userinfo.profile
```

Dit toont dat een succesvolle OAuth-callback op zichzelf geen bewijs van
Calendar-toegang is. B1 moet de werkelijk verleende scopes afzonderlijk toetsen
en een ontbrekende agendatoestemming herstelbaar maken vanuit een geldige login.
Bij annulering toont de standaard NextAuth-route nu een generiek aanmeldbericht;
terugnavigeren naar de proefstart behoudt de sessie. De uiteindelijke instellingen
moeten een begrijpelijke terugkeer naar de bestaande configuratie bieden.

### Proefbronagenda en herstart

De callback voor agenda-aanmaak en die voor het kandidaataccount verleenden,
naast identiteit, precies:

```text
https://www.googleapis.com/auth/calendar.calendarlist.readonly
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/calendar.app.created
```

Op 12:22:21 UTC is **When2Watch proef source 2026-09-24 1e4c90** aangemaakt bij
de proefeigenaar, met `Europe/Amsterdam`. De opgeslagen aanvraag ging vóór de
externe POST. Google bevestigde de kalender-ID; de volgende CalendarList-lezing
bevatte diezelfde ID en de aparte controle bevestigde `accessRole: owner`.
Er is geen CalendarList-write uitgevoerd of extra scope daarvoor gevraagd.

Met `maxResults=1` en `minAccessRole=writer` kwamen **drie pagina's en twee
schrijfbare agenda's** terug. De eerste pagina had `items: []` én een
`nextPageToken`. B1 moet dus op de vervolgtoken blijven pagineren, ook bij een
lege pagina. De laatste pagina bevatte de nieuwe proefagenda. Geschoonde echte
responses staan in `tests/fixtures/google/calendar-created-source.json` en
`calendar-list-source-{1,2,3}.json`.

Het proefproces is normaal gestopt en opnieuw gestart met dezelfde private
configuratie en database. De bestaande browsersessie bleef geldig. Op 12:22:58
UTC bevestigden een nieuwe volledige lijst en ID-controle opnieuw dezelfde
proefagenda, schrijfrechten en tijdzone. Deze afzonderlijke responses staan in
`calendar-list-source-readback-{1,2,3}.json`.

### Kandidaataccount, doelagenda en itemverplaatsing

De echte NextAuth-callback koppelde het tweede account aan de ingelogde interne
gebruiker: **één User, twee Accounts met verschillende Google-subjects**. De
eigenaar-ID bleef gelijk, zonder `allowDangerousEmailAccountLinking`. Het
kandidaataccount verving de actieve bronverbinding niet. Dit is werkelijk
adaptergedrag van NextAuth 4.24.15, geen gemockte callback.

Op 12:25:27 UTC is bij dit tweede account **When2Watch proef target 2026-09-24
cc17cf** aangemaakt. Google bevestigde via vijf lijstpagina's met vier schrijfbare
agenda's de nieuwe ID, `accessRole: owner` en tijdzone `Europe/Amsterdam`. Ook
deze lijst begon met een lege pagina met vervolgtoken. Een tweede normale
procesherstart is gevolgd door afzonderlijke volledige lijsten en ID-controles
voor bron en doel (12:25:57–58 UTC); beide bleven bruikbaar via de opgeslagen
verbinding en bijbehorende client.

Voor **1 oktober 2026** maakte het harnas één herkenbaar synthetisch item met
hele-dagdatums en zonder meldingen. Bron- en doel-ID waren vooraf privaat
opgeslagen. Beide items zijn na schrijven teruggelezen en gecontroleerd op
datum, status, ETag en eigen markeringen (`app`, `probe`, interne eigenaar).

| Tijd UTC | Bevestigde stap |
| --- | --- |
| 12:26:08.803 | Doelitem teruggelezen en doelbevestiging opgeslagen. |
| 12:26:09.417 | Pas daarna bronitem met zijn ETag verwijderd; Google-readback heeft `status: cancelled`. |
| 12:26:24.379 | Ook het bevestigde doelproefitem gecontroleerd verwijderd en als `cancelled` teruggelezen. |

De geschoonde responses `event-confirmed-source.json`,
`event-confirmed-target.json` en `event-source-after-delete.json` bewaren de
echte veldvorm. De aparte doelopruimreadback is vastgelegd als private
proefobservatie. In totaal zijn 21 Calendar-responsefixtures vastgelegd en
gecontroleerd op geldige JSON, afwezigheid van e-mailadressen/tokens/secrets,
identieke kalender-ID's na sanitatie, lege vervolgpagina's, eventmarkeringen
en bevestigde bronverwijdering.

**Achtergebleven proefgegevens:** de twee hierboven genoemde proefagenda's
blijven bewust bestaan. Beide geschreven proefitems zijn opgeruimd. Bestaande
agenda's zijn niet als schrijfbestemming gebruikt. Er is geen melding gevraagd
of ontvangst geclaimd; de echte meldingsproef van de nieuwe installatie hoort
bij C1. Herstel na onderbroken eventwrites wordt hiermee evenmin als volledig
B2-bewijs geclaimd: deze B0-proef bewijst de normale bevestigingsvolgorde.

## Openstaande externe voorwaarden en metingen

- De eigenaar heeft twee proefaccounts aangewezen.
- De gewenste proefeigenaar is volgens de eigenaar toegevoegd als testgebruiker.
- De proefredirect werkt nu; eerste login en herverbinding zijn werkelijk bewezen.
- De Calendar-rechten zijn bij beide proefaccounts verleend. Bron- en doelagenda
  zijn aangemaakt en na procesherstart bevestigd; de itemproef is opgeruimd.
- Het pad naar een **tweede, verschillende OAuth-webclient** is nog nodig voor
  de vervangingsproef, met dezelfde callback
  `http://localhost:3401/api/auth/callback/google`. De bestaande client en
  tokens blijven behouden. Er wordt geen client uit een andere dienst gehaald.
- Nog te meten: herautorisatie van dezelfde eigenaar met deze nieuwe client en
  werkelijk bewijs dat de oude verbinding vóór bevestiging blijft werken.

B0 wordt pas afgerond op basis van deze echte uitkomsten. De administratieve
statusovergangen blijven bovendien geraakt door de bekende Scrum4Me ISS-7.

## Primaire bronnen

- [Google: secondary calendar aanmaken en toegestane scopes](https://developers.google.com/workspace/calendar/api/v3/reference/calendars/insert).
- [Google: CalendarList-paginering en schrijfrechten](https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/list).
- [Google: OAuth voor webservers](https://developers.google.com/identity/protocols/oauth2/web-server).
- Werkelijke callbacklogica van de geïnstalleerde `next-auth/core/lib/callback-handler.js`:
  een al ingelogde databasesessie kan een tweede account aan dezelfde gebruiker
  verbinden; dit is in deze proef met een echte browsercallback bevestigd.
