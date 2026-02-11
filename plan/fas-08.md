# Fas 8 — Tidrapportering och export

> Läs `plan/README.md` först för arbetsflöde och regler.
> Läs relevanta `/workspace/docs/*.md` innan implementation.

### Block 8.1: Tidrapportering
**Input:** Fas 3 klar (projekt + uppgifter)
**Output:** Fungerande tidrapporteringssystem

- [ ] Bygga tidrapporteringsvy i projektet (ny flik eller del av uppgiftsvyn)
- [ ] Snabb tidsregistrering: välj uppgift, ange minuter/timmar, datum och valfri beskrivning
- [ ] Server Action `createTimeEntry` med Zod-validering + auth
- [ ] Visa tidslista per projekt med summa per dag/vecka
- [ ] Visa tidslista per användare (mina tider)
- [ ] Server Action `updateTimeEntry` och `deleteTimeEntry` (bara egna poster)
- [ ] Summering: totalt per projekt, per uppgift, per person

**Verifiering:** Tider registreras/uppdateras/raderas, summering korrekt, `tenantDb(tenantId)` på alla queries, `requireProject()` för projektåtkomst, `npm run build` OK

### Block 8.2: Export och rapporter
**Input:** Block 8.1 + Fas 4 + Fas 5 klara (tidsdata + MinIO + AI-verktyg)
**Output:** Export-funktionalitet

- [ ] Exportera projektsammanställning som PDF (uppgifter, status, tider, medlemmar)
- [ ] Exportera tidrapport som Excel (filtrerat på period, projekt, person)
- [ ] Exportera uppgiftslista som Excel
- [ ] AI-verktyg: generera sammanfattande projektrapport (text + data)
- [ ] Nedladdning via presigned URL från MinIO (genererade filer sparas)

**Verifiering:** PDF och Excel genereras korrekt, nedladdning fungerar, `tenantDb(tenantId)` på alla queries, `requireProject()` för projektåtkomst, `npm run build` OK

### Block 8.3: Playwright-test för Fas 8
**Input:** Block 8.1–8.2 klara
**Output:** Screenshots och verifiering av tidrapportering

- [ ] Starta dev-server med PID-fil
- [ ] Logga in och navigera till ett projekt
- [ ] Öppna tidrapporteringsvyn, ta screenshot
- [ ] Registrera tid på en uppgift
- [ ] Verifiera att tid visas i listan
- [ ] Ta screenshot av summering (per dag/vecka)
- [ ] Testa export till Excel, verifiera nedladdning
- [ ] Testa export till PDF, verifiera nedladdning
- [ ] Spara alla screenshots i `screenshots/fas-08/`
- [ ] Stoppa dev-server

**Verifiering:** Alla screenshots sparade, export fungerar, inga konsolfel
