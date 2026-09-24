# B0 — Google-configuratieproef

Status op 24 september 2026: **harnas gereed; Google-aanvraag geblokkeerd op de proefredirect**.
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

De lokale probe is geen definitieve instellingen-UI. De echte browsercallbacks
en Google-responses moeten de aannames nog bewijzen voordat B1 wordt gebouwd.

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

Dit zijn lokale controles, **geen bewijs van werkende Google-koppelingen**.
Er is nog geen nieuwe Google-toestemming verleend, geen proefagenda aangemaakt
en geen proefevent geschreven.

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

Google toont nu concreet **HTTP 400 / `redirect_uri_mismatch`** voor
`http://localhost:3401/api/auth/callback/google`. Dit bevestigt dat de aangevraagde
proefredirect nog niet door de gebruikte webclient wordt geaccepteerd. Geen
succesvolle callback of nieuwe toestemming geclaimd. De oorspronkelijke drie
`OAuthCallback`-fouten hadden geen gedetailleerde foutregistratie; hun precieze
provideroorzaak is daarmee niet achteraf vastgesteld.

## Openstaande externe voorwaarden en metingen

- De eigenaar heeft twee proefaccounts aangewezen.
- De gewenste proefeigenaar is volgens de eigenaar toegevoegd als testgebruiker.
- Google weigert de proefredirect nog met `redirect_uri_mismatch`; de exacte
  callback moet bij Authorized redirect URIs van de gebruikte webclient staan.
- Het pad naar een tweede OAuth-webclient is gevraagd voor de vervangingsproef.
- Nog te meten: echte callbacks met behoud van interne eigenaar, annuleren/
  gedeeltelijke toestemming, verleende scopes, create/list/readback na herstart,
  doelbevestiging vóór bronverwijdering en oude client bruikbaar tot bevestiging.

B0 wordt pas afgerond op basis van deze echte uitkomsten. De administratieve
statusovergangen blijven bovendien geraakt door de bekende Scrum4Me ISS-7.

## Primaire bronnen

- [Google: secondary calendar aanmaken en toegestane scopes](https://developers.google.com/workspace/calendar/api/v3/reference/calendars/insert).
- [Google: CalendarList-paginering en schrijfrechten](https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/list).
- [Google: OAuth voor webservers](https://developers.google.com/identity/protocols/oauth2/web-server).
- Werkelijke callbacklogica van de geïnstalleerde `next-auth/core/lib/callback-handler.js`:
  een al ingelogde databasesessie kan een tweede account aan dezelfde gebruiker
  verbinden; het harnas moet dit met echte browsercallbacks bevestigen.
