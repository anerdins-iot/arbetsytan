# Fas 8 — Tidrapportering och export

> Läs `plan/README.md` först för arbetsflöde och regler.
> Läs relevanta `/docs/*.md` innan implementation.

### Block 8.1: Tidrapportering
**Modell:** Claude `opus` (komplex, UI + CRUD + summering)
**Input:** Fas 3 klar (projekt + uppgifter)
**Output:** Fungerande tidrapporteringssystem

- [ ] Bygga tidrapporteringsvy i projektet (ny flik eller del av uppgiftsvyn)
- [ ] Snabb tidsregistrering: välj uppgift, ange minuter/timmar, datum och valfri beskrivning
- [ ] Server Action `createTimeEntry` med Zod-validering + auth
- [ ] Visa tidslista per projekt med summa per dag/vecka
- [ ] Visa tidslista per användare (mina tider)
- [ ] Server Action `updateTimeEntry` och `deleteTimeEntry` (bara egna poster)
- [ ] Summering: totalt per projekt, per uppgift, per person

**Verifiering:** Tider registreras/uppdateras/raderas, summering korrekt, tenantId-filter, `npm run build` OK

### Block 8.2: Export och rapporter
**Modell:** Claude `opus` (komplex, PDF/Excel-generering + MinIO)
**Input:** Block 8.1 + Fas 4 klara (tidsdata + MinIO)
**Output:** Export-funktionalitet

- [ ] Exportera projektsammanställning som PDF (uppgifter, status, tider, medlemmar)
- [ ] Exportera tidrapport som Excel (filtrerat på period, projekt, person)
- [ ] Exportera uppgiftslista som Excel
- [ ] AI-verktyg: generera sammanfattande projektrapport (text + data)
- [ ] Nedladdning via presigned URL från MinIO (genererade filer sparas)

**Verifiering:** PDF och Excel genereras korrekt, nedladdning fungerar, tenantId-filter, `npm run build` OK
