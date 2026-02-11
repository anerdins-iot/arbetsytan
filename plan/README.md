# Byggplan — ArbetsYtan (AY)

> **INSTRUKTION FÖR AGENTER:** Läs denna fil FÖRST. Läs sedan din tilldelade fas-fil (t.ex. `fas-01.md`).
> Läs ALLTID relevant `/docs/*.md` innan du skriver kod. Se `AGENTS.md` för projektregler.

## Projektöversikt

ArbetsYtan — kommersiell multi-tenant SaaS-plattform för hantverkare.
Se `PROJEKT.md` för fullständig beskrivning, `AI.md` för AI-arkitektur, `UI.md` för designspråk.

## Generella regler (gäller ALLA faser)

Alla regler i `AGENTS.md` gäller — läs den först. Här kompletteras med plan-specifika regler:

- **Inga rollbacks eller workarounds**: Problem ska lösas i grunden — aldrig kringgås. Upptäcker en agent fel från en tidigare fas ska det dokumenteras i `DEVLOG.md` och åtgärdas innan arbetet fortsätter. Fel får aldrig skjutas framåt.
- **Fel ska vara fel**: Tysta aldrig fel med fallbacks, try/catch som sväljer errors, eller default-värden som döljer problem. Om något går fel ska det synas tydligt — som ett explicit felmeddelande, ett build-fel eller en krasch. Inga tysta fallbacks som maskerar det verkliga problemet.

## Modellval per uppgiftstyp

| Uppgiftstyp | Provider / Modell | Fallback | Notering |
|---|---|---|---|
| Frontend och UI | Claude `opus` | Cursor `gpt-5.3-codex` | Komponenter, sidor, styling, layout |
| Backend, API och databas | Cursor `auto` | Gemini `gemini-3-flash-preview` | Server Actions, Prisma-queries, API-routes |
| Analys och research | Cursor `auto` | — | Parallella agenter för kodanalys innan implementation |
| Verifiering och granskning | Gemini `gemini-3-flash-preview` | Cursor `auto` | Kontrollerar build, TypeScript, krav |
| Felsökning (analys) | Gemini `gemini-3-flash-preview` + Cursor `auto` | — | Parallella agenter som analyserar utan att ändra |
| Felsökning (fix) | Cursor `auto` | — | Separat agent som fixar baserat på analysen |
| Test (Playwright) | Claude `haiku` | — | MCP Playwright-navigering med screenshots |

## Arbetsflöde per agentblock

Varje agentblock genomförs i fyra steg:

### 1. Analys
- Spawna 1-2 forskningsagenter (Cursor `auto`) som analyserar relevanta filer, scheman och existerande kod
- Resultatet ger implementationsagenten den kontext den behöver

### 2. Implementation
- Bedöm blockets karaktär och välj modell enligt tabellen ovan (frontend → Claude Opus, backend → Cursor Auto, etc.)
- Agenten får blockets specifikation, input-filer och analysresultat

### 3. Verifiering
- Spawna verifieringsagent (Gemini `gemini-3-flash-preview`, fallback Cursor `auto`) som kontrollerar:
  - Koden bygger utan fel (`npm run build`)
  - Inga TypeScript-fel (`npx tsc --noEmit`)
  - Funktionaliteten matchar kraven i blockets specifikation
  - Multi-tenant-filter (`tenantId`) finns på alla databasanrop
  - Alla UI-texter går via `next-intl` — inga hårdkodade strängar
  - Inga hårdkodade färger — alla via CSS-variabler/Tailwind
  - Inga säkerhetshål (auth-check i alla Server Actions)

### 4. Test
- Spawna testagent (Claude `haiku`) som kör MCP Playwright-tester
- Navigera genom blockets sidor och flöden, ta screenshots vid varje steg
- Spara screenshots i `screenshots/fas-XX/block-X.X/` med namngivning: `01-steg.png`, `02-steg.png`, etc.
- Tidiga faser (1-2): Fokus på build, API-svar, routing
- Mellanfaser (3-9): Fullständig navigering med screenshots
- Sena faser (10-12): Visuell kontroll och responsivitet

## Handoff mellan block

- **Input**: Vad som måste vara klart innan blocket kan starta
- **Output**: Vad blocket levererar (filer, funktioner, endpoints)
- **Verifiering**: Specifika kontroller som måste passera

Nästa block kan **inte** starta innan föregående blocks checkboxar är avbockade i fas-filen. Om en checkbox inte är ifylld är steget inte klart. Kontrollera alltid fas-filen innan du börjar ett nytt block. Om verifieringen misslyckas: åtgärda och verifiera igen.

**Upptäckta fel från tidigare block/faser** ska dokumenteras i `DEVLOG.md` och åtgärdas omedelbart — innan det aktuella blocket fortsätter. Fel får aldrig ignoreras eller kringgås.

## Faser

| Fas | Fil | Beskrivning | Steg | Block |
|-----|-----|-------------|------|-------|
| 1 | `fas-01.md` | Projektsetup och infrastruktur | 29 | 4 |
| 2 | `fas-02.md` | Autentisering och multi-tenant | 33 | 5 |
| 3 | `fas-03.md` | Dashboard, projekt, kanban, team, aktivitetslogg, sökning | 50 | 9 |
| 4 | `fas-04.md` | Filhantering | 29 | 4 |
| 5 | `fas-05.md` | AI-assistenter | 42 | 7 |
| 6 | `fas-06.md` | Notifikationer, realtid och påminnelser | 21 | 4 |
| 7 | `fas-07.md` | Inställningar och administration | 16 | 3 |
| 8 | `fas-08.md` | Tidrapportering och export | 12 | 2 |
| 9 | `fas-09.md` | Betalning (Stripe) | 14 | 2 |
| 10 | `fas-10.md` | Landningssida | 8 | 1 |
| 11 | `fas-11.md` | Mobilapp (Expo) | 19 | 4 |
| 12 | `fas-12.md` | Deploy och produktion | 13 | 2 |
| **Totalt** | | | **286** | **47** |

## Fasordning och beroenden

```
Fas 1 (Setup) ──→ Fas 2 (Auth) ──→ Fas 3 (Dashboard/Projekt)
                       │                    │
                       │              ┌─────┼─────┬─────┐
                       │              ▼     ▼     ▼     ▼
                       │           Fas 4  Fas 6  Fas 7  Fas 9
                       │           (Filer) (Notis) (Inställn.) (Stripe)
                       │              │     │
                       │              ▼     │
                       │           Fas 5    │
                       │           (AI)     │
                       │              │     │
                       │         ┌────┴─────┘
                       │         ▼
                       │      Fas 8 (Tidsrapp)
                       │
                       ├──→ Fas 10 (Landing)
                       │
                       ├──→ Fas 11 (Mobil)
                       │
                       └──→ Fas 12 (Deploy) ← alla andra faser klara
```

> **Not:** Diagrammet visar övergripande fasberoenden. Exakta beroenden per block anges i varje blocks **Input**-rad i fas-filerna.
