# Fas 8 — Tidrapportering och export

> Läs `plan/README.md` först för arbetsflöde och regler.
> Läs relevanta `/workspace/docs/*.md` innan implementation.

### Block 8.1: Tidrapportering
**Input:** Fas 3 klar (projekt + uppgifter)
**Output:** Fungerande tidrapporteringssystem

- [x] Bygga tidrapporteringsvy i projektet (ny flik eller del av uppgiftsvyn)
- [x] Snabb tidsregistrering: välj uppgift, ange minuter/timmar, datum och valfri beskrivning
- [x] Server Action `createTimeEntry` med Zod-validering + auth
- [x] Visa tidslista per projekt med summa per dag/vecka
- [x] Visa tidslista per användare (mina tider)
- [x] Server Action `updateTimeEntry` och `deleteTimeEntry` (bara egna poster)
- [x] Summering: totalt per projekt, per uppgift, per person

**Verifiering:** Tider registreras/uppdateras/raderas, summering korrekt, `tenantDb(tenantId)` på alla queries, `requireProject()` för projektåtkomst, `npm run build` OK

### Block 8.2: Export och rapporter
**Input:** Block 8.1 + Fas 4 + Fas 5 klara (tidsdata + MinIO + AI-verktyg)
**Output:** Export-funktionalitet

- [x] Exportera projektsammanställning som PDF (uppgifter, status, tider, medlemmar)
- [x] Exportera tidrapport som Excel (filtrerat på period, projekt, person)
- [x] Exportera uppgiftslista som Excel
- [ ] AI-verktyg: generera sammanfattande projektrapport (text + data) — **HOPPADE ÖVER** (saknar API-nycklar)
- [x] Nedladdning via presigned URL från MinIO (genererade filer sparas)

**Verifiering:** PDF och Excel genereras korrekt, nedladdning fungerar, `tenantDb(tenantId)` på alla queries, `requireProject()` för projektåtkomst, `npm run build` OK

### Block 8.3: Playwright-test för Fas 8
**Input:** Block 8.1–8.2 klara
**Output:** Screenshots och verifiering av tidrapportering

- [ ] Starta dev-server med PID-fil
- [x] Logga in och navigera till ett projekt
- [x] Öppna tidrapporteringsvyn, ta screenshot
- [x] Registrera tid på en uppgift
- [x] Verifiera att tid visas i listan
- [x] Ta screenshot av summering (per dag/vecka)
- [x] Testa export till Excel, verifiera nedladdning
- [x] Testa export till PDF, verifiera nedladdning
- [x] Spara alla screenshots i `screenshots/fas-08/`
- [ ] Stoppa dev-server

**Verifiering:** Alla screenshots sparade, export fungerar, inga konsolfel
