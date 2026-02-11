# Byggplan — ArbetsYtan (AY)

> **INSTRUKTION FÖR AGENTER:** Läs denna fil FÖRST. Läs sedan din tilldelade fas-fil (t.ex. `fas-01.md`).
> Läs ALLTID relevant `/docs/*.md` innan du skriver kod. Se `AGENTS.md` för projektregler.

## Projektöversikt

ArbetsYtan — kommersiell multi-tenant SaaS-plattform för hantverkare.
Se `PROJEKT.md` för fullständig beskrivning, `AI.md` för AI-arkitektur, `UI.md` för designspråk.

## Generella regler (gäller ALLA faser)

- **i18n**: Alla UI-texter via `next-intl` — aldrig hårdkodade strängar. Översättningar i `messages/sv.json` och `messages/en.json`. Varje ny sida/komponent ska ha översättningsnycklar för båda språken.
- **Multi-tenant**: Alla databasfrågor MÅSTE filtreras på `tenantId`. Ingen tenant får se annan tenants data.
- **Styling**: Inga hårdkodade färger eller spacing — alla via CSS-variabler/Tailwind. Ingen `@apply`.
- **TypeScript**: Strict mode. Ingen `any`. Inga TypeScript-fel.
- **Server Components**: Default. `'use client'` bara vid interaktivitet.
- **Server Actions**: Alla ska ha auth-check + tenant-check + Zod-validering.
- **Förbjudet**: Se "Förbjudet"-sektionen i `AGENTS.md` för komplett lista.

## Modellval per uppgiftstyp

| Uppgiftstyp | Provider / Modell | Notering |
|---|---|---|
| Enkel implementation (1-2 filer) | Gemini `gemini-3-flash-preview` | Snabb och billig |
| Komplex implementation (3+ filer, frontend↔backend) | Claude `opus` | Bäst kodkvalitet |
| Felsökning | Claude `opus` | Djup analys |
| Analys / research | Cursor `auto` (2 parallella) | Snabb utforskning |
| Verifiering / granskning | Gemini `gemini-3-pro-preview` | Grundlig kontroll |

## Arbetsflöde per agentblock

Varje agentblock genomförs i tre steg:

### 1. Analys
- Spawna 1-2 forskningsagenter (Cursor `auto`) som analyserar relevanta filer, scheman och existerande kod
- Resultatet ger implementationsagenten den kontext den behöver

### 2. Implementation
- Spawna implementationsagent med rätt modell (se tabell ovan)
- Agenten får blockets specifikation, input-filer och analysresultat
- Max ~5-8 steg per block

### 3. Verifiering
- Spawna verifieringsagent (Gemini `gemini-3-pro-preview`) som kontrollerar:
  - Koden bygger utan fel (`npm run build`)
  - Inga TypeScript-fel (`npx tsc --noEmit`)
  - Funktionaliteten matchar kraven i blockets specifikation
  - Multi-tenant-filter (`tenantId`) finns på alla databasanrop
  - Alla UI-texter går via `next-intl` — inga hårdkodade strängar
  - Inga hårdkodade färger — alla via CSS-variabler/Tailwind
  - Inga säkerhetshål (auth-check i alla Server Actions)

## Handoff mellan block

- **Input**: Vad som måste vara klart innan blocket kan starta
- **Output**: Vad blocket levererar (filer, funktioner, endpoints)
- **Verifiering**: Specifika kontroller som måste passera

Nästa block kan **inte** starta innan föregående blocks verifiering är godkänd. Om verifieringen misslyckas: åtgärda och verifiera igen.

## Faser

| Fas | Fil | Beskrivning | Steg | Block |
|-----|-----|-------------|------|-------|
| 1 | `fas-01.md` | Projektsetup och infrastruktur | 28 | 4 |
| 2 | `fas-02.md` | Autentisering och multi-tenant | 30 | 5 |
| 3 | `fas-03.md` | Dashboard, projekt, kommentarer, aktivitetslogg, sökning | 45 | 9 |
| 4 | `fas-04.md` | Filhantering | 23 | 4 |
| 5 | `fas-05.md` | AI-assistenter | 31 | 7 |
| 6 | `fas-06.md` | Notifikationer, realtid och påminnelser | 20 | 4 |
| 7 | `fas-07.md` | Inställningar och administration | 15 | 3 |
| 8 | `fas-08.md` | Tidrapportering och export | 12 | 2 |
| 9 | `fas-09.md` | Betalning (Stripe) | 13 | 2 |
| 10 | `fas-10.md` | Landningssida | 8 | 1 |
| 11 | `fas-11.md` | Mobilapp (Expo) | 14 | 4 |
| 12 | `fas-12.md` | Deploy och produktion | 11 | 2 |
| **Totalt** | | | **250** | **47** |

## Fasordning och beroenden

```
Fas 1 (Setup) ──→ Fas 2 (Auth) ──→ Fas 3 (Dashboard/Projekt)
                                          │
                                    ┌─────┼─────┐
                                    ▼     ▼     ▼
                              Fas 4    Fas 6   Fas 7
                              (Filer)  (Notis)  (Inställningar)
                                 │
                                 ▼
                              Fas 5 (AI) ──→ Fas 8 (Tidsrapp)
                                                │
                              Fas 9 (Stripe)    │
                              Fas 10 (Landing)  │
                                    │           │
                                    ▼           ▼
                              Fas 11 (Mobil) ──→ Fas 12 (Deploy)
```
