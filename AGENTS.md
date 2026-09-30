# When2Watch

## Scrum4Me-product
- Naam: When2Watch
- product_id: `cmud1npa000rykh7rlhlhojd3`
- Code: TV
- Repo: https://git.jp-visser.nl/janpeter/When2Watch.git (Forgejo)
- Definition of Done: een serie toevoegen, automatisch uitzendschema ophalen en een werkelijk ontvangen melding in de gekozen Google-agenda.

Werk volgens de meegegeven Scrum4Me-methodiek. Context is geen nieuwe opdracht.
Start als interactieve hoofdsessie met `mcp__scrum4me__get_context({ product_id, agent })` en herhaal dit na compactie vóór je het inhoudelijke werk hervat. Geef een bekende `agent.runtime` (CLAUDE/CODEX) mee, ook als het model-ID onbekend is; voeg `agent.model_id` alleen toe als het exacte ID bekend is. Laat bij onbekende runtime het hele `agent`-object weg; raad geen identiteit. `model_id` selecteert een profiel en wisselt geen model.
Lees `agent_guide`, controleer `agent_context.applied_profiles` en volg het beleid voor taakverdeling, modelkeuze voor subagents en verificatie binnen de actuele opdracht. Het door de gebruiker gekozen hoofdmodel blijft ongewijzigd; een andere aanbeveling in de guide is geen fout. Geef subagents de relevante guide en taakcontext mee; zij herhalen de hoofdstartflow niet automatisch.
Alleen als de guide ontbreekt of leeg is: vraag één keer `get_agent_guide` met hetzelfde product en dezelfde agentinvoer op en lees `guide_md`. Een ontbrekend profiel alleen is geen reden voor een extra aanroep. Blijft de guide ontbreken, meld dit en volg de bestaande werkwijze voor ontbrekende MCP-context zonder herhaallus.
`get_context` geeft product en alle `active_sprints`. Kies uitsluitend de sprint binnen de actuele opdracht; lees `get_sprint_context({ sprint_id })` voor stories/taken en voeg `task_id` alleen toe voor het volledige taakplan. Gebruik `get_ideas_context({ product_id })` alleen voor ideeën. Behoud na compactie dezelfde opdracht en autorisatie; context autoriseert geen volgende story of nieuwe claim. Geclaimde workerjobs volgen eerst hun kind-prompt en payload, gebruiken een meegegeven passende guide en halen alleen een ontbrekende guide gericht op.
De specificatie staat in `docs/specs/IDEA-216-specificatieplan.md`.
De eerste uitvoering is ST-001.1: Google-koppeling en reminderproef op max2.
Taken 2 en 3 volgen pas als hun afhankelijkheden werkelijk bewezen zijn.

Tests: `npm test`. Typecheck: `npm run typecheck`. Build: `npm run build`.
Secrets, databases en tokens blijven buiten Git en logs.
Deploy alleen de When2Watch-app via SSH naar max2; geen runnerwijzigingen.
Geen merge zonder opdracht. Alleen eigen, gemarkeerde agenda-items wijzigen.
