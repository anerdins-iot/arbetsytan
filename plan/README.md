# Byggplan — ArbetsYtan (AY)

> **INSTRUKTION FÖR AGENTER:** Läs denna fil FÖRST. Läs sedan din tilldelade fas-fil (t.ex. `fas-01.md`).
> Läs ALLTID relevant `/workspace/docs/*.md` innan du skriver kod. Se `AGENTS.md` för projektregler. **OBS** - docs ligger i `/workspace/docs/`.

## Projektöversikt

ArbetsYtan — kommersiell multi-tenant SaaS-plattform för hantverkare.
Se `PROJEKT.md` för fullständig beskrivning, `AI.md` för AI-arkitektur, `UI.md` för designspråk.

## Generella regler (gäller ALLA faser)

Alla regler i `AGENTS.md` gäller — läs den först. Här kompletteras med plan-specifika regler:

- **Inga fallbacks eller workarounds**: Problem ska lösas i grunden — aldrig kringgås. Upptäcker du fel från en tidigare fas ska det dokumenteras i `DEVLOG.md` och rapporteras tillbaka. Fel får aldrig skjutas framåt.
- **Fel ska vara fel**: Tysta aldrig fel med fallbacks, try/catch som sväljer errors, eller default-värden som döljer problem. Om något går fel ska det synas tydligt — som ett explicit felmeddelande, ett build-fel eller en krasch. Inga tysta fallbacks som maskerar det verkliga problemet.
- **Rapportera tillbaka vid oklarheter**: Om du upptäcker avvikelser, konflikter mellan filer, eller oklarheter — avbryt och rapportera. Gissa aldrig.

## Verifieringskrav

Följande ska kontrolleras innan ett block anses klart:

### Build och TypeScript
- Koden bygger utan fel (`npm run build`)
- Inga TypeScript-fel (`npx tsc --noEmit`)

### Dev-server och Playwright-tester
- **Agenten som kör Playwright-tester ansvarar för att starta OCH stoppa dev-servern**
- **Starta:** Spara PID så att bara servern stoppas (aldrig pkill — det kan döda agentens egen process):
  - `cd /workspace/web && npm run dev & echo $! > .dev-server.pid`
  - Vänta tills servern svarar (t.ex. curl till localhost:3000)
- **Stoppa:** Döda endast den sparade processen (aldrig `pkill -f`):
  - `kill -TERM $(cat /workspace/web/.dev-server.pid) 2>/dev/null; rm -f /workspace/web/.dev-server.pid`
- Lämna ALDRIG servern igång efter testet — det blockerar framtida agenter
- Om servern redan körs (port upptagen): rapportera felet, försök INTE döda andras processer

### Dataisolering
- Alla databasanrop för tenant-data använder `tenantDb(tenantId)` — aldrig den globala `prisma`-klienten direkt
- Alla projektoperationer validerar åtkomst via `requireProject()`
- AI-konversationer: personlig AI scopad till `userId`, projekt-AI scopad via `requireProject()`

### Socket.IO (om blocket berör realtid)
- Autentisering vid anslutning — ogiltig session/JWT avvisas
- Rum hanteras av servern — klienten kan inte joina rum själv
- Emit sker till specifika rum — aldrig broadcast
- All data filtreras i backend innan emit — klienten får aldrig ofiltrerad data

### UI och internationalisering
- Alla UI-texter går via `next-intl` — inga hårdkodade strängar
- Inga hårdkodade färger — alla via CSS-variabler/Tailwind

### Säkerhet
- Auth-check i alla Server Actions
- Inga säkerhetshål

## Handoff mellan block

- **Input**: Vad som måste vara klart innan blocket kan starta
- **Output**: Vad blocket levererar (filer, funktioner, endpoints)
- **Verifiering**: Specifika kontroller som måste passera

Nästa block kan **inte** starta innan föregående blocks checkboxar är avbockade i fas-filen.

**Upptäckta fel från tidigare block/faser** ska dokumenteras i `DEVLOG.md` och rapporteras omedelbart.

## Faser

| Fas | Fil | Beskrivning | Block |
|-----|-----|-------------|-------|
| 1 | `fas-01.md` | Projektsetup och infrastruktur | 4 |
| 2 | `fas-02.md` | Autentisering och multi-tenant | 5 |
| 3 | `fas-03.md` | Dashboard, projekt, kanban, team, aktivitetslogg, sökning | 9 |
| 4 | `fas-04.md` | Filhantering | 4 |
| 5 | `fas-05.md` | AI-assistenter | 7 |
| 6 | `fas-06.md` | Notifikationer, realtid och påminnelser | 4 |
| 7 | `fas-07.md` | Inställningar och administration | 3 |
| 8 | `fas-08.md` | Tidrapportering och export | 2 |
| 9 | `fas-09.md` | Betalning (Stripe) | 2 |
| 10 | `fas-10.md` | Landningssida | 1 |
| 11 | `fas-11.md` | Mobilapp (Expo) | 4 |
| 12 | `fas-12.md` | Deploy och produktion | 2 |

## Fasordning och beroenden

```
Fas 1 (Setup) ──┬──→ Fas 2 (Auth) ──→ Fas 3 (Dashboard/Projekt)
                 │         │                    │
                 │         │              ┌─────┼─────┬─────┐
                 │         │              ▼     ▼     ▼     ▼
                 │         │           Fas 4  Fas 6  Fas 7  Fas 9
                 │         │           (Filer) (Notis) (Inställn.) (Stripe)
                 │         │              │     │
                 │         │              ▼     │
                 │         │           Fas 5    │
                 │         │           (AI)     │
                 │         │              │     │
                 │         │         ┌────┴─────┘
                 │         │         ▼
                 │         │      Fas 8 (Tidsrapp)
                 │         │
                 │         ├──→ Fas 11 (Mobil)
                 │         │
                 │         └──→ Fas 12 (Deploy) ← alla andra faser klara
                 │
                 └──→ Fas 10 (Landing)
```

> **Not:** Diagrammet visar övergripande fasberoenden. Exakta beroenden per block anges i varje blocks **Input**-rad i fas-filerna.
