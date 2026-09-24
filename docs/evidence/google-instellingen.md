# B1 — Eigenaarsinstellingen en eerste agendakeuze

T-9 / ST-004, sprint S-2026-09-24-2. Uitgevoerd op 24 september 2026.
Deze code bouwt voort op de echte B0-proef. Een andere geselecteerde agenda of
actieve Google-identiteit overnemen hoort bij B2; een lege installatie bij C1.

## Opgeslagen configuratie en controles

De toevoegende migratie bewaart bestaande eigenaar-, account-, sessie-, serie-,
aflevering- en eventkoppelingen. Een bestaande installatie wordt eenmaal
geïmporteerd met haar expliciete oude e-mailallowlist en enige Google-account.
Ambigue gegevens worden geweigerd. Daarna bepalen opgeslagen identiteit,
OAuth-client, agenda en voorkeuren de werking, ook na gewijzigde envwaarden.

Login controleert het actieve Google-subject en een geverifieerd profiel.
Calendar-toestemming wordt afzonderlijk beoordeeld. Nieuwe verbindingen zijn
vijftien minuten geldig, aan de initiërende sessie gebonden en eerst kandidaat.
Bevestigen doet een echte tokenvernieuwing met de bijbehorende client en leest
de Google-agendalijst. Tokens van de oude client worden niet aan een nieuwe
client gekoppeld. Normale login overschrijft bevestigde Calendar-tokens niet.

Alle wijzigingen gebruiken de bestaande eigenaaruitsluiting; synchronisatie
haalt haar configuratie pas binnen die uitsluiting op. Zonder gekozen agenda
bewaart toevoegen de serie en afleveringen met `calendarState: unconfigured` en
nul agendawrites. De UI benoemt dat expliciet.

De agendalijst verwerkt alle pagina's, ook een lege pagina met vervolgtoken.
Alleen schrijfbare agenda's worden getoond; selectie wordt op volledige ID
teruggelezen. Een aanmaakintentie staat vóór de Google-POST in SQLite. Een
onzekere uitkomst blokkeert een tweede POST, ook na herstart of een nieuw
request-ID. De gebruiker wijst de bedoelde agenda aan via de lijst of exacte ID.

De tijdzone is wijzigbaar en wordt gebruikt voor overzicht, huidige dag,
synchronisatie en proefdatums. Een afwijkende Google-tijdzone wordt getoond;
de externe voorkeuren blijven behouden. Proefteksten zijn algemeen en verwijzen
naar meldingstijd in de agenda-app.

## Automatische verificatie

- 123 tests met onder meer tijdelijke echte SQLite-databases, toevoegende
  migratie, sessiebinding, scopeweigering, clientvervanging, gepagineerde
  B0-responses, onzekere aanmaak en configuratie lezen na wachten op de lock.
- Typecheck en productiebuild geslaagd.
- 112 HTTP-asserties met echte Next/SQLite en synthetische sessies. Nieuwe routes
  weigeren anonieme/andere eigenaren en vreemde origins; ontbrekende rechten
  blijven herstelbaar. Instellingenresponses, HTML en logs bevatten geen
  synthetische tokens/secrets. Een echte procesherstart met gewijzigde oude
  envwaarden behoudt opgeslagen eigenaar, agenda en voorkeuren.

## Echte lokale browser- en Google-proef

Een afzonderlijke private B1-database werd gevuld met de bestaande proefeigenaar
en diens in B0 bevestigde client-1-verbinding. Dit is een gecontroleerde
upgradeproef, geen schone installatie. De B0-database blijft bewaard. Er werd
geen browsersessie gemaakt of geïnjecteerd: Chrome doorliep de echte Google-login.

- 13:15 UTC: login met de proefeigenaar slaagt; interne eigenaar blijft gelijk
  en het eerdere Calendar-refresh-token is ongewijzigd.
- 13:16:28–29 UTC: Slow Horses via Volgen toegevoegd zonder gekozen agenda;
  36 afleveringen, nul eventkoppelingen en expliciet lokaal succes zonder
  agendawrites. De browser toont de bijbehorende uitleg.
- De echte lijst toont de persoonlijke agenda en de bestaande herkenbare
  B0-bronproefagenda. Alleen die bronproefagenda is gekozen; Google bevestigt
  haar volledige ID, `owner`-rechten en `Europe/Amsterdam`.
- Tijdzone naar `Pacific/Auckland` gezet: het verschil met Google wordt getoond
  en de proefgrens verschuift naar de volgende lokale dag. Daarna hersteld naar
  `Europe/Amsterdam`; de proefdatum volgt direct, zonder pagina te herladen.
- Echte herverbinding onthulde dat NextAuth in `events.signIn` een genormaliseerd
  profiel zonder `email_verified` geeft. De eerste kandidaat werd veilig
  afgewezen, actieve tokens bleven behouden. Een regressietest faalde op deze
  exacte profielovergang. Na herstel bewaart de handler het in dezelfde request
  geverifieerde OAuth-profiel; die test en de echte herhaalde callback slagen.
- 13:22–24 UTC: callback toont de kandidaat ter bevestiging. Bevestigen vernieuwt
  werkelijk het token en leest Google opnieuw. Status `confirmed`, kandidaat-
  tokens gewist, één eigenaar/account/sessie, juiste clientreferentie.
- Desktop en 375 px visueel gecontroleerd, ook het uitgeklapte OAuth-formulier.
  Documentbreedte en viewport zijn beide 375 px. Schermmaat daarna hersteld.

Deze B1-proef schreef geen externe agenda-items en maakte geen extra agenda.
De nieuwe-agenda-API en herstartreadback zijn werkelijk in B0 beproefd;
B1 toetst de persistente aanmaaklogica aanvullend met SQLite/providerfixtures.
Er wordt geen ontvangen melding of voltooide B2/C1-proef geclaimd.

## max2

De app-uitrol en bewaarcontrole volgen na deze codecommit; nog niet afgerond
bij het vastleggen van dit eerste bewijs. De bestaande productieverbinding
wordt geïmporteerd, niet vervangen door de lokale proefcredentials.

Scrum4Me ISS-7 blokkeert nog de taakstatusmutatie. Voortgang, tests en commits
worden wel gelogd; geen directe statuswrite of MCP-herstart wordt gebruikt.
