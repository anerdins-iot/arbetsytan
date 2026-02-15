# Service Layer Refactor — Erfarenhetslogg

> Dokumentera problem, losningar och avvikelser under arbetet.
> Uppdatera denna fil lopande under varje fas.

---

## Sammanfattning

**Projekt:** Skapa gemensamt service layer for att eliminera duplicerad kod mellan Actions och AI-verktyg.

**Omfattning (uppdaterad):**
- **8 service-filer** med 15 funktioner
- **14 duplicerade lasoperationer** att migrera
- **15 skrivavvikelser** att fixa (AI -> Actions)
- **12 nya AI-verktyg** att lagga till (CRUD-gap)
- **10 faser, 32 block**

**Arkitektur:** Actions och AI-verktyg ar "thin layers" som transformerar data. Services innehaller karnlogik (DB-queries, validering).

---

## Format for loggposter

```
### [Datum] — [Fas X.X] Kort beskrivning
**Problem:** Vad gick fel?
**Losning:** Hur lostes det?
**Larding:** Vad bor framtida agenter veta?
```

---

## Logg

### 2026-02-15 — Plan skapad
**Analys:** Alla Actions-filer och personal-tools.ts genomlasta. Identifierade 14 duplicerade lasoperationer, 15 skrivavvikelser och 12 CRUD-gap.

### [Datum] — [Fas X.X] Mallpost
**Problem:** [Beskriv problemet]
**Losning:** [Beskriv losningen]
**Larding:** [Vad bor framtida agenter veta?]

---

## Avvikelser fran planen

| Fas | Block | Planerat | Faktiskt | Anledning |
|-----|-------|----------|----------|-----------|
| | | | | |

---

## Statistik

| Matetal | Fore | Efter |
|---------|------|-------|
| `findMany` i personal-tools.ts | ~30 | |
| `create/update/delete` i personal-tools.ts | ~15 | |
| Service-anrop i Actions | 0 | |
| Service-anrop i AI-verktyg | 0 | |
| AI-verktyg totalt | ~50 | |
| Duplicerade lasoperationer | 14 | |
| AI-skrivningar med egen DB | 15 | |
| Saknade AI-verktyg | 12 | |

---

## Arkitekturval

### Alternativ som overvagdes

1. **Actions anropar services, AI anropar services** (VALD)
   - Pro: Tydlig separation, latt att testa
   - Con: Nytt lager = mer kod

2. **AI anropar actions direkt**
   - Pro: Mindre kod
   - Con: Actions har UI-specifik logik (URLs, revalidation)

3. **Behall som det ar**
   - Pro: Inget arbete
   - Con: Fortsatt duplicering, svart underhall

### Varfor alternativ 1 valdes

- Actions och AI har **olika behov** (URLs vs previews)
- Gemensam karna undviker duplicering
- Tydligare separation of concerns

---

## Rekommendationer for framtiden

### Vid tillagg av nya entiteter

1. Skapa service FORST
2. Implementera Actions som anropar service
3. Implementera AI-verktyg som anropar service
4. Uppdatera `services/index.ts`

### Underhall

- Schema-andringar: Uppdatera BARA services, inte actions/AI
- Validering: Lagg till i `services/types.ts`
- Nya falt: Lagg till i service-typer, sedan i transformations

---

## Status

| Fas | Beskrivning | Status | Commit |
|-----|-------------|--------|--------|
| 1 | Infrastructure + types | Ej paborjad | - |
| 2 | Project & Task services | Ej paborjad | - |
| 3 | File & Note services | Ej paborjad | - |
| 4 | Comment, Time, Member services | Ej paborjad | - |
| 5 | Migrera Actions till services | Ej paborjad | - |
| 6 | Migrera AI-verktyg till services | Ej paborjad | - |
| 7 | Fixa skrivavvikelser | Ej paborjad | - |
| 8 | Saknade AI-verktyg | Ej paborjad | - |
| 9 | Ta bort duplicerad kod | Ej paborjad | - |
| 10 | Test och verifiering | Ej paborjad | - |
