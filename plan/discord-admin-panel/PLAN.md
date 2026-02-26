# Plan: Full Discord admin panel

## Syfte

Bygga en fullständig Discord-adminpanel i webb-UI så att administratörer kan:
- Synka projekt mot Discord-kanaler (redan delvis; utöka med per-kanal-styrning)
- Konfigurera uppgifter mot kanaler (vilka kanaler får task-notiser, på/av per kanaltyp)
- Hantera projekt↔kanal-kopplingar (slå på/av synk per kanal, avkoppla kanal)

## Bakgrund

- **Nuvarande:** Inställningar → Discord med DiscordSetup, LinkedUsersTable, ProjectSyncSection (lista projekt, synced/not, kanaltyper, "Synka alla" / "Synka projekt"). Kategorier och roller har egna undersidor.
- **Modell:** `DiscordProjectChannel` per projekt med `channelType` (general, tasks, files, activity), `syncEnabled`, `lastSyncedAt`, `discordChannelId`.
- **Bot:** Lyssnar på `discord:sync-projects`, skapar/uppdaterar kanaler; task/activity-synk använder `syncEnabled: true` för respektive kanaltyp.

## Krav

1. **Projekt ↔ kanaler (utöka ProjectSyncSection)**
   - Visa per projekt: för varje kanaltyp (general, tasks, files, activity) – Discord-kanal-ID (truncerat), Synk på/av (syncEnabled), Senast synkad, Åtgärd "Avkoppla" (ta bort koppling).
   - Nya Server Actions: `setProjectChannelSyncEnabled(projectId, discordChannelId, enabled)`, `unlinkProjectChannel(projectId, discordChannelId)`.
   - Vid avkoppling: ta bort `DiscordProjectChannel`-raden; publicera event `discord:channel-unlinked` (tenantId, projectId, discordChannelId) så boten kan arkivera/renamna kanalen om ni vill (annars bara DB-cleanup).

2. **Uppgifter ↔ kanaler**
   - Tydliggör i UI att "Uppgifter"-kanalen (`channelType: tasks`) är den som får task-notiser (skapa, tilldela, klar, etc.).
   - Per-projekt: synk på/av för "uppgifter"-kanalen = redan `syncEnabled` på den kanalen. Inget nytt fält – bara tydligare etiketter/help-text (t.ex. "Task-notiser skickas hit när synk är på").

3. **UI/UX**
   - Behåll tabellvy för projekt; antingen expanderbara rader (per projekt visa underliggande kanaler) eller en "Konfigurera"-knapp som öppnar Sheet/Dialog med kanallista för det projektet (kanaltyp, ID, sync toggle, unlink).
   - Alla texter via next-intl (sv.json, en.json).
   - Touch targets minst 44px; följ UI.md och befintlig Discord-sida.

4. **Ingen bot-ändring krävs för minimum**
   - Om `discord:channel-unlinked` inte hanteras av boten idag, det räcker att webben tar bort DB-raden; boten behöver inte ta bort kanalen (kan implementeras senare).

## Filer att ändra/skapa

- `web/src/actions/discord.ts` – lägg till `setProjectChannelSyncEnabled`, `unlinkProjectChannel`; ev. utöka `ProjectSyncData` med `id` per kanal för stabil unlink.
- `web/src/components/discord/ProjectSyncSection.tsx` – utöka med per-kanal-rad eller Sheet med toggles + unlink; anropa nya actions.
- `web/messages/sv.json` och `web/messages/en.json` – nycklar för "Synk", "Avkoppla", "Task-notiser", hjälptexter.
- `web/src/lib/redis-pubsub.ts` – exportera/använd `publishDiscordEvent` för `discord:channel-unlinked` (om redan generisk, inget att ändra).

## Verifiering

- Bygg: `cd web && npm run build`
- Manuell: som Admin, öppna Inställningar → Discord; synka ett projekt; växla "Synk" för en kanal; avkoppla en kanal; kontrollera att tabell/UI uppdateras och att inga fel i konsol.

## Status

- [ ] Actions: setProjectChannelSyncEnabled, unlinkProjectChannel
- [ ] ProjectSyncSection: per-kanal-vy med toggles + unlink
- [ ] Översättningar
- [ ] Build och snabb manuell verifiering
