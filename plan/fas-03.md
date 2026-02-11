# Fas 3 — Dashboard och projekt

> Läs `plan/README.md` först för arbetsflöde och regler.
> Läs relevanta `/workspace/docs/*.md` innan implementation.

### Block 3.1: Dashboard
**Input:** Fas 1 + Fas 2 klara
**Output:** Fungerande dashboard-sida

- [x] Bygga dashboard-sida med tre sektioner: uppgifter, aktivitet, notifikationer
- [x] Hämta "mina uppgifter" via Server Action filtrerat på membership + tenantId
- [x] Visa uppgifter som lista med status, deadline och projektkoppling
- [x] Hämta senaste aktiviteten i användarens projekt
- [x] Visa notifikationer (olästa markerade)
- [x] Montörs-vy: förenklad dashboard med enbart "mina uppgifter idag"

**Verifiering:** Dashboard renderas, `tenantDb(tenantId)` på alla queries, montörs-vy visas för rätt roll, `npm run build` OK

### Block 3.2: Projektlista och skapande
**Input:** Fas 1 (layout) + Fas 2 (auth) klara
**Output:** Projektlista-sida med CRUD

- [x] Bygga projektlista-sida med kort för varje projekt
- [x] Server Action `getProjects` filtrerat på tenantId
- [x] Visa namn, status, antal uppgifter, senaste aktivitet per projekt
- [x] "Skapa nytt projekt"-knapp och modal/sida
- [x] Server Action `createProject` med Zod-validering + tenantId
- [x] Sökfunktion och statusfilter (aktiv, pausad, klar, arkiverad)

**Verifiering:** Projektlista visar data, filter fungerar, skapande fungerar, `tenantDb(tenantId)` på alla queries, `npm run build` OK

### Block 3.3: Projektvy — Översikt
**Input:** Block 3.2 klart
**Output:** Projektvy med flikar och översikt

- [x] Bygga projektvy med flik-navigation: Översikt, Uppgifter, Filer, AI
- [x] Översiktsflik visar projektnamn, status, adress, beskrivning
- [x] Visa antal uppgifter per status (todo, pågående, klart)
- [x] Visa projektmedlemmar med roller
- [x] Server Action `getProject` med tenantId-filter
- [x] Möjlighet att redigera projektinfo (namn, adress, status, beskrivning)
- [x] Server Action `updateProject` med auth + tenant-check

**Verifiering:** Projektvy renderas, fliknavigation fungerar, redigering sparas, `tenantDb(tenantId)` på alla queries, `requireProject()` för projektåtkomst, `npm run build` OK

### Block 3.4: Kanban-board
**Input:** Block 3.3 klart
**Output:** Fungerande kanban med uppgiftshantering

- [x] Bygga kanban-board med tre kolumner: Att göra, Pågående, Klart
- [x] Server Action `getTasks` filtrerat på projectId + tenantId
- [x] Drag-and-drop för att flytta uppgifter mellan kolumner
- [x] Server Action `updateTaskStatus` som uppdaterar status
- [x] Skapa ny uppgift — modal med titel, beskrivning, prioritet, deadline
- [x] Server Action `createTask` med Zod-validering
- [x] Tilldela uppgift till projektmedlem
- [x] Server Action `assignTask` som skapar TaskAssignment

**Verifiering:** Kanban renderas, drag-and-drop fungerar, uppgifter skapas/uppdateras, `tenantDb(tenantId)` på alla queries, `requireProject()` för projektåtkomst, `npm run build` OK

### Block 3.5: Uppgiftsdetalj och filtrering
**Input:** Block 3.4 klart
**Output:** Uppgiftsdetalj-vy med redigering och filtrering

- [x] Uppgiftsdetalj-vy med redigering av alla fält
- [x] Server Action `updateTask` och `deleteTask`
- [x] Filtrera uppgifter på tilldelad person, prioritet, status

**Verifiering:** Detaljvy renderas, redigering sparar, filtrering fungerar, `tenantDb(tenantId)` på alla queries, `requireProject()` för projektåtkomst, `npm run build` OK

### Block 3.6: Kommentarer
**Input:** Block 3.5 klart (uppgiftsdetalj finns)
**Output:** Kommentarsfunktionalitet på uppgifter

- [x] Bygga kommentarsfält i uppgiftsdetalj-vyn
- [x] Server Action `createComment` med Zod-validering + auth
- [x] Visa kommentarer kronologiskt med författare och tid
- [x] Server Action `updateComment` och `deleteComment` (bara egen kommentar)
- [x] Förbered notis-hook: anropa `createNotification()` vid ny kommentar (funktionen implementeras i Block 6.1 — skapa placeholder som loggar tills dess)

**Verifiering:** Kommentarer skapas/visas/raderas, auth-check, `tenantDb(tenantId)` på alla queries, `requireProject()` för projektåtkomst, `npm run build` OK

### Block 3.7: Teamhantering
**Input:** Block 3.3 klart (projektvy finns)
**Output:** Team-hantering i projektvyn

- [x] Visa projektmedlemmar i projektvyn
- [x] Lägga till befintliga teammedlemmar (från tenant) till projekt
- [x] Ta bort medlem från projekt
- [x] Server Actions med roller-check (bara admin/projektledare kan hantera)

**Verifiering:** Medlemmar visas/läggs till/tas bort, rollcheck fungerar, `tenantDb(tenantId)` på alla queries, `requireProject()` för projektåtkomst, `npm run build` OK

### Block 3.8: Aktivitetslogg
**Input:** Block 3.3 + 3.4 klara (projektvy + uppgifter)
**Output:** Aktivitetslogg-system

- [x] Logga alla viktiga händelser i ActivityLog: uppgift skapad/ändrad/klar, fil uppladdad, medlem tillagd, status ändrad
- [x] Visa aktivitetslogg i projektöversikten (senaste händelserna)
- [x] Fullständig aktivitetslogg-sida per projekt med filtrering och paginering
- [x] Server Action `getActivityLog` filtrerat på projectId + tenantId
- [x] Inkludera aktör (vem), action, entity och metadata i varje post

**Verifiering:** Händelser loggas vid alla CRUD-operationer, paginering fungerar, `tenantDb(tenantId)` på alla queries, `requireProject()` för projektåtkomst, `npm run build` OK

### Block 3.9: Global sökning
**Input:** Block 3.2 + 3.4 klara (projekt + uppgifter)
**Output:** Global sökfunktion

- [x] Bygga sökfält i topbar som söker över alla tillgängliga resurser
- [x] Sök i projektnamn och beskrivningar
- [x] Sök i uppgiftstitlar och beskrivningar
- [x] Server Action `globalSearch` filtrerat på tenantId + användarens projekt
- [x] Visa sökresultat grupperat per typ (projekt, uppgifter) med djuplänkar
- [x] Debounce och minst 2 tecken innan sökning triggas

**Verifiering:** Sökning returnerar resultat grupperade per typ, `tenantDb(tenantId)` på alla queries, debounce fungerar, `npm run build` OK

### Block 3.10: Playwright-test för Fas 3
**Input:** Block 3.1–3.9 klara
**Output:** Screenshots och verifiering av alla dashboard/projekt-flöden

- [ ] Starta dev-server med PID-fil
- [ ] Logga in med testanvändare
- [ ] Ta screenshot av dashboard (uppgifter, aktivitet, notifikationer)
- [ ] Navigera till projektlistan, ta screenshot
- [ ] Testa sökfunktionen och statusfilter
- [ ] Öppna ett projekt, ta screenshot av projektvyn med flikar
- [ ] Navigera till Uppgifter-fliken, ta screenshot av kanban-board
- [ ] Skapa en ny uppgift via modal
- [ ] Dra en uppgift mellan kolumner (om drag-and-drop fungerar)
- [ ] Öppna uppgiftsdetalj, ta screenshot
- [ ] Lägg till en kommentar
- [ ] Navigera till teamhantering, ta screenshot
- [ ] Testa global sökning i topbar
- [ ] Spara alla screenshots i `screenshots/fas-03/`
- [ ] Stoppa dev-server

**Verifiering:** Alla screenshots sparade, navigation fungerar, data visas korrekt, inga konsolfel
