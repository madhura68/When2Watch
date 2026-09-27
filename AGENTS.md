# When2Watch

## Scrum4Me-product
- Naam: When2Watch
- product_id: `cmud1npa000rykh7rlhlhojd3`
- Code: TV
- Repo: https://git.jp-visser.nl/janpeter/When2Watch.git (Forgejo)
- Definition of Done: een serie toevoegen, automatisch uitzendschema ophalen en een werkelijk ontvangen melding in de gekozen Google-agenda.

Werk volgens de meegegeven Scrum4Me-methodiek. Context is geen nieuwe opdracht.
Start met `get_context(product_id)` en geef `agent: {runtime, model_id}` mee (CLAUDE/CODEX + exact model-ID, alleen als die bekend zijn); volg de meegeleverde `agent_guide`. Ontbreekt die, gebruik `get_agent_guide` met dezelfde agentinvoer.
De specificatie staat in `docs/specs/IDEA-216-specificatieplan.md`.
De eerste uitvoering is ST-001.1: Google-koppeling en reminderproef op max2.
Taken 2 en 3 volgen pas als hun afhankelijkheden werkelijk bewezen zijn.

Tests: `npm test`. Typecheck: `npm run typecheck`. Build: `npm run build`.
Secrets, databases en tokens blijven buiten Git en logs.
Deploy alleen de When2Watch-app via SSH naar max2; geen runnerwijzigingen.
Geen merge zonder opdracht. Alleen eigen, gemarkeerde agenda-items wijzigen.
