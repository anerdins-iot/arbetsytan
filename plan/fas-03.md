# Fas 3 — Dashboard och projekt

> Läs `plan/README.md` först för arbetsflöde och regler.
> Läs relevanta `/docs/*.md` innan implementation.

### Block 3.1: Dashboard
**Input:** Fas 1 + Fas 2 klara
**Output:** Fungerande dashboard-sida

- [ ] Bygga dashboard-sida med tre sektioner: uppgifter, aktivitet, notifikationer
- [ ] Hämta "mina uppgifter" via Server Action filtrerat på membership + tenantId
- [ ] Visa uppgifter som lista med status, deadline och projektkoppling
- [ ] Hämta senaste aktiviteten i användarens projekt
- [ ] Visa notifikationer (olästa markerade)
- [ ] Montörs-vy: förenklad dashboard med enbart "mina uppgifter idag"

**Verifiering:** Dashboard renderas, data filtreras på tenantId, montörs-vy visas för rätt roll, `npm run build` OK

### Block 3.2: Projektlista och skapande
**Input:** Fas 2 klar (auth + layout)
**Output:** Projektlista-sida med CRUD

- [ ] Bygga projektlista-sida med kort för varje projekt
- [ ] Server Action `getProjects` filtrerat på tenantId
- [ ] Visa namn, status, antal uppgifter, senaste aktivitet per projekt
- [ ] "Skapa nytt projekt"-knapp och modal/sida
- [ ] Server Action `createProject` med Zod-validering + tenantId
- [ ] Sökfunktion och statusfilter (aktiv, pausad, klar, arkiverad)

**Verifiering:** Projektlista visar data, filter fungerar, skapande fungerar, tenantId-filter på alla queries, `npm run build` OK

### Block 3.3: Projektvy — Översikt
**Input:** Block 3.2 klart
**Output:** Projektvy med flikar och översikt

- [ ] Bygga projektvy med flik-navigation: Översikt, Uppgifter, Filer, AI
- [ ] Översiktsflik visar projektnamn, status, adress, beskrivning
- [ ] Visa antal uppgifter per status (todo, pågående, klart)
- [ ] Visa projektmedlemmar med roller
- [ ] Server Action `getProject` med tenantId-filter
- [ ] Möjlighet att redigera projektinfo (namn, adress, status, beskrivning)
- [ ] Server Action `updateProject` med auth + tenant-check

**Verifiering:** Projektvy renderas, fliknavigation fungerar, redigering sparas, tenantId-filter, `npm run build` OK

### Block 3.4: Kanban-board
**Input:** Block 3.3 klart
**Output:** Fungerande kanban med uppgiftshantering

- [ ] Bygga kanban-board med tre kolumner: Att göra, Pågående, Klart
- [ ] Server Action `getTasks` filtrerat på projectId + tenantId
- [ ] Drag-and-drop för att flytta uppgifter mellan kolumner
- [ ] Server Action `updateTaskStatus` som uppdaterar status
- [ ] Skapa ny uppgift — modal med titel, beskrivning, prioritet, deadline
- [ ] Server Action `createTask` med Zod-validering
- [ ] Tilldela uppgift till projektmedlem
- [ ] Server Action `assignTask` som skapar TaskAssignment

**Verifiering:** Kanban renderas, drag-and-drop fungerar, uppgifter skapas/uppdateras, tenantId-filter, `npm run build` OK

### Block 3.5: Uppgiftsdetalj och filtrering
**Input:** Block 3.4 klart
**Output:** Uppgiftsdetalj-vy med redigering och filtrering

- [ ] Uppgiftsdetalj-vy med redigering av alla fält
- [ ] Server Action `updateTask` och `deleteTask`
- [ ] Filtrera uppgifter på tilldelad person, prioritet, status

**Verifiering:** Detaljvy renderas, redigering sparar, filtrering fungerar, `npm run build` OK

### Block 3.6: Kommentarer
**Input:** Block 3.5 klart (uppgiftsdetalj finns)
**Output:** Kommentarsfunktionalitet på uppgifter

- [ ] Bygga kommentarsfält i uppgiftsdetalj-vyn
- [ ] Server Action `createComment` med Zod-validering + auth
- [ ] Visa kommentarer kronologiskt med författare och tid
- [ ] Server Action `updateComment` och `deleteComment` (bara egen kommentar)
- [ ] Trigga notis till tilldelade personer vid ny kommentar

**Verifiering:** Kommentarer skapas/visas/raderas, auth-check, tenantId-filter, `npm run build` OK

### Block 3.7: Teamhantering
**Input:** Block 3.3 klart (projektvy finns)
**Output:** Team-hantering i projektvyn

- [ ] Visa projektmedlemmar i projektvyn
- [ ] Lägga till befintliga teammedlemmar (från tenant) till projekt
- [ ] Ta bort medlem från projekt
- [ ] Server Actions med roller-check (bara admin/projektledare kan hantera)

**Verifiering:** Medlemmar visas/läggs till/tas bort, rollcheck fungerar, `npm run build` OK

### Block 3.8: Aktivitetslogg
**Input:** Block 3.3 + 3.4 klara (projektvy + uppgifter)
**Output:** Aktivitetslogg-system

- [ ] Logga alla viktiga händelser i ActivityLog: uppgift skapad/ändrad/klar, fil uppladdad, medlem tillagd, status ändrad
- [ ] Visa aktivitetslogg i projektöversikten (senaste händelserna)
- [ ] Fullständig aktivitetslogg-sida per projekt med filtrering och paginering
- [ ] Server Action `getActivityLog` filtrerat på projectId + tenantId
- [ ] Inkludera aktör (vem), action, entity och metadata i varje post

**Verifiering:** Händelser loggas vid alla CRUD-operationer, paginering fungerar, tenantId-filter, `npm run build` OK

### Block 3.9: Global sökning
**Input:** Block 3.2 + 3.4 klara (projekt + uppgifter)
**Output:** Global sökfunktion

- [ ] Bygga sökfält i topbar som söker över alla tillgängliga resurser
- [ ] Sök i projektnamn och beskrivningar
- [ ] Sök i uppgiftstitlar och beskrivningar
- [ ] Server Action `globalSearch` filtrerat på tenantId + användarens projekt
- [ ] Visa sökresultat grupperat per typ (projekt, uppgifter) med djuplänkar
- [ ] Debounce och minst 2 tecken innan sökning triggas

**Verifiering:** Sökning returnerar resultat grupperade per typ, tenantId-filter, debounce fungerar, `npm run build` OK
