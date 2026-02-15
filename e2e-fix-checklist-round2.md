# Åtgärdsplan Round 2

**Datum:** 2026-02-15
**Baserat på:** E2E-test med 8 Haiku-agenter

---

## Problem 1: updateProjectNote serverfel

**Symptom:** AI returnerar "Det verkar ha uppstått ett fel" vid uppdatering av projektanteckningar.

**Testresultat:**
- `createNote` ✅ fungerar
- `updateNote` ⛔ serverfel

**Relevant kod:**
- `/workspace/web/src/lib/ai/tools/personal-tools.ts` (updateProjectNote)

### Checklista

- [ ] **Analys:** Läs `updateProjectNote` funktionen — vad är felet i try/catch?
- [ ] **Analys:** Kolla serverloggar för att se exakt felmeddelande
- [ ] **Analys:** Jämför med fungerande `createProjectNote`
- [ ] **Åtgärd:** Fixa det underliggande felet
- [ ] **Test:** Kör `updateNote` via AI-chat, verifiera att det fungerar

---

## Problem 2: createTimeEntry sparar inte data

**Symptom:** AI säger "Klart! Jag har loggat 2 timmar..." men tidsposten finns INTE i databasen.

**Testresultat:**
- AI returnerar success
- Tidsposten syns INTE på sidan
- Efter refresh: fortfarande 0 min

**Relevant kod:**
- `/workspace/web/src/lib/ai/tools/personal-tools.ts` (createTimeEntry)

### Checklista

- [ ] **Analys:** Läs `createTimeEntry` funktionen
- [ ] **Analys:** Kontrollera om verktyget har rätt projektId/taskId
- [ ] **Analys:** Verifiera Prisma-query — skapas posten verkligen?
- [ ] **Analys:** Kolla om det finns tyst fel som döljs
- [ ] **Åtgärd:** Fixa felande logik
- [ ] **Test:** Kör `createTimeEntry` via AI-chat, verifiera att tidspost sparas

---

## Problem 3: Task realtid (INCONCLUSIVE)

**Symptom:** Agent kunde inte testa pga UI-problem med AI-chatten.

**Status:** Kräver manuell verifiering eller omtest.

### Checklista

- [ ] **Manuell test:** Logga in, gå till projekt, öppna AI-chat, skapa task
- [ ] **Verifiera:** Syns uppgiften i Kanban utan refresh?
- [ ] **Om FAIL:** Analysera `createTask` i personal-tools.ts

---

## Verifierade OK (Round 2)

| Område | Verktyg | Status |
|--------|---------|--------|
| Project | createProject | ✅ PASS |
| ProjectMember | addMember | ✅ PASS |
| Comments | createComment | ✅ PASS |
| Invitations | sendInvitation | ✅ PASS |
| Personal Notes | createPersonalNote | ✅ PASS |

---

## Arbetsordning

1. **Problem 1 (updateProjectNote)** — Analysera först, troligen enkel fix
2. **Problem 2 (createTimeEntry)** — Analysera, kan vara mer komplex
3. **Problem 3 (Task)** — Manuell verifiering först

---

## Relevant kod

| Fil | Innehåll |
|-----|----------|
| `/workspace/web/src/lib/ai/tools/personal-tools.ts` | AI-verktyg (alla CRUD) |
| `/workspace/web/src/actions/time.ts` | Server actions för tidsrapportering |
| `/workspace/web/src/actions/notes.ts` | Server actions för anteckningar |
