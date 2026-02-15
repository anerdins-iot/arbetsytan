# Dirigent-instruktioner för WebSocket-refaktorering

> **KRITISKT:** Denna fil styr hur orkestern (huvudagenten) ska koordinera arbetet.
> Alla sub-agenter ska följa dessa regler strikt.

---

## 0. Projektkontext (OBLIGATORISK LÄSNING)

### Vad är ArbetsYtan?

ArbetsYtan är en **multi-tenant SaaS-plattform för hantverkare** (elektriker, VVS, byggare, målare). Plattformen erbjuder projektledning med AI-assistans — användare kan hantera projekt, uppgifter, filer, anteckningar och tidrapporter.

### Tech Stack

| Komponent | Teknologi |
|-----------|-----------|
| Framework | Next.js 16 (App Router) |
| Databas | PostgreSQL + Prisma 7 |
| Realtid | Socket.IO |
| Auth | Auth.js v5 |
| Styling | Tailwind CSS v4 + shadcn/ui |
| AI | Claude, OpenAI (Vercel AI SDK) |

### Viktiga koncept

1. **Multi-tenant:** Varje företag (tenant) har isolerad data
   - `tenantDb(tenantId)` — Prisma-klient som automatiskt filtrerar på tenant
   - `userDb(userId)` — Prisma-klient för personliga data (filer, notes utan projekt)

2. **Server Actions:** All CRUD-logik i `/workspace/web/src/actions/`
   - Varje action börjar med `requireAuth()` eller `requireRole()`
   - Använder `tenantDb()` eller `userDb()` för databasåtkomst

3. **WebSocket-rum:** Socket.IO organiserar klienter i rum
   - `tenant:X` — Alla i samma företag
   - `project:X` — Alla som har projektet öppet
   - `user:X` — Specifik användare (för personliga data)

### Dokumentation att läsa

| Fil | Beskrivning |
|-----|-------------|
| `/workspace/AGENTS.md` | **OBLIGATORISK** — Projektregler, konventioner, förbjudet |
| `/workspace/PROJEKT.md` | Projektöversikt och affärslogik |
| `/workspace/DEVLOG.md` | **OBLIGATORISK** — Dokumenterade problem och lösningar |
| `/workspace/UI.md` | Designspråk (för UI-arbete) |
| `/workspace/docs/*.md` | Teknisk dokumentation per område |

### Varför denna refaktorering?

**Problem:** WebSocket-events emittas manuellt. Utvecklare glömmer att anropa `emitTaskCreated()` etc., vilket leder till att UI inte uppdateras i realtid.

**Lösning:** Automatisk emit via Prisma extension. När `db.task.create()` körs, emittas eventet automatiskt — ingen kan glömma.

---

## 1. Arbetsflöde per block

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   DESIGN        │ ──▶ │ IMPLEMENTATION  │ ──▶ │  VERIFIERING    │
│   (Opus)        │     │ (Opus/Gemini)   │     │  (Gemini Flash) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                      │                       │
         ▼                      ▼                       ▼
    UI.md + AGENTS.md      Kod-ändringar           Build + tsc
    Designbeslut                                        │
                                                        ▼
                                               ┌─────────────────┐
                                               │  PLAYWRIGHT TEST│
                                               │  (Haiku + MCP)  │
                                               └─────────────────┘
                                                        │
                                                        ▼
                                               Screenshots + rapport
         │                      │                       │
         └──────────────────────┴───────────────────────┘
                                │
                                ▼
                    ┌─────────────────────┐
                    │      COMMIT         │
                    │   (Dirigenten)      │
                    └─────────────────────┘
                                │
                                ▼
                    ┌─────────────────────┐
                    │  CHECKBOX UPDATE    │
                    │   (Dirigenten)      │
                    └─────────────────────┘
```

---

## 2. Modellval

| Uppgift | Provider | Modell |
|---------|----------|--------|
| **Design/arkitektur** | Claude | `opus` |
| **Frontend** (UI, React, CSS) | Claude | `opus` |
| **Backend/infrastruktur** | Gemini | `gemini-3-flash-preview` |
| **Verifiering** (build/tsc) | Gemini | `gemini-3-flash-preview` |
| **Playwright-test** | Claude | `haiku` |
| **Fallback** (om Gemini misslyckas) | Cursor | `auto` |

---

## 3. Agenttyper och ansvar

### Design-agent
**Provider:** Claude | **Modell:** opus

**Prompt-mall:**
```
Du är en ARKITEKT. Din uppgift är att designa [SPECIFIK UPPGIFT].

LÄS FÖRST:
- /workspace/UI.md (designspråk)
- /workspace/AGENTS.md (projektregler)
- /workspace/PROJEKT.md (projektöversikt)
- /workspace/DEVLOG.md (tidigare lösningar)
- Relevanta /workspace/docs/*.md

LEVERERA:
- Teknisk design med TypeScript-typer
- Komponentstruktur (om UI)
- API/dataflöde
- Edge cases att hantera

DU FÅR INTE:
- Skriva produktionskod
- Ändra filer
- Hoppa över att läsa dokumentationen
```

### Implementation-agent
**Frontend (UI/React/CSS):** Claude | opus
**Backend/övrigt:** Gemini | gemini-3-flash-preview
**Fallback:** Cursor | auto

**Prompt-mall:**
```
Du är en IMPLEMENTATÖR. Din uppgift är att implementera [SPECIFIK UPPGIFT].

LÄS FÖRST (OBLIGATORISKT):
- /workspace/AGENTS.md (projektregler — LÄS HELA)
- /workspace/DEVLOG.md (dokumenterade problem — LÄS HELA)
- /workspace/plan/websocket-refactor/fas-XX.md (aktuellt block)
- Relevanta /workspace/docs/*.md

REGLER:
1. Implementera ENDAST det som specificeras i blocket
2. Om kod saknas som du behöver — RAPPORTERA som avvikelse, gissa inte
3. Om du stöter på fel — RAPPORTERA och föreslå lösning, fixa inte annat
4. Följ projektets konventioner exakt (se AGENTS.md)
5. Inga egna förbättringar utanför scope

VID AVVIKELSER:
- Beskriv problemet
- Ange vilken fil/rad som berörs
- Föreslå lösning
- AVBRYT om det blockerar arbetet

LEVERERA:
- Ändrade filer (lista)
- Eventuella avvikelser
- "Klart för verifiering" eller "Blockerad: [anledning]"
```

### Verifierings-agent
**Provider:** Gemini | **Modell:** gemini-3-flash-preview
**Fallback:** Cursor | auto

**Prompt-mall:**
```
Du är en GRANSKARE. Du får INTE ändra några filer.

LÄS FÖRST:
- /workspace/AGENTS.md (projektregler)
- /workspace/plan/websocket-refactor/fas-XX.md (vad som skulle implementeras)

VERIFIERA:
1. Läs ändrade filer och kontrollera mot specifikationen
2. Kör: cd /workspace/web && npm run build
3. Om UI ändrats: Be dirigenten spawna en Haiku test-agent med MCP Playwright

RAPPORTERA:
- GODKÄNT: Alla krav uppfyllda, bygger, tester passerar
- UNDERKÄNT: Lista avvikelser med fil:rad

DU FÅR INTE:
- Ändra kod
- Fixa problem du hittar
- Föreslå förbättringar utanför scope
```

### Test-agent (MCP Playwright)
**Provider:** Claude | **Modell:** haiku

> **VIKTIGT:** Vi kör INTE `npx playwright test` eller spec-filer.
> Test-agenter använder MCP Playwright-verktyg direkt för interaktiv testning.
> Detta ger visuell verifiering med screenshots och möjlighet att reagera på
> faktiskt UI-tillstånd.

**MCP-verktyg som test-agenten använder:**
- `mcp__playwright__browser_navigate` — Navigera till URL
- `mcp__playwright__browser_snapshot` — Accessibility snapshot (hitta element)
- `mcp__playwright__browser_click` — Klicka på element (via ref från snapshot)
- `mcp__playwright__browser_type` — Skriv text i fält
- `mcp__playwright__browser_fill_form` — Fyll i formulär
- `mcp__playwright__browser_take_screenshot` — Ta screenshot (sparas till fil)
- `mcp__playwright__browser_wait_for` — Vänta på text/element

**Prompt-mall:**
```
Du är en TESTARE. Din uppgift är att verifiera [SPECIFIK FUNKTION] via MCP Playwright.

FÖRUTSÄTTNINGAR:
- Servern körs redan på http://localhost:3000
- Du behöver INTE starta eller stoppa servern
- Dirigenten ansvarar för server-livscykeln

TESTFLÖDE:
1. Navigera till http://localhost:3000/sv/login
2. Logga in med browser_fill_form:
   - E-post: admin@example.com
   - Lösenord: password123
3. Vänta på dashboard: browser_wait_for text="Dashboard" eller liknande
4. Navigera till rätt sida
5. Utför teståtgärden
6. Verifiera resultat med browser_snapshot
7. Ta screenshots med browser_take_screenshot

TESTANVÄNDARE:
| E-post | Lösenord | Roll |
|--------|----------|------|
| admin@example.com | password123 | ADMIN |
| fredrik@anerdins.se | password123 | ADMIN |
| pm@example.com | password123 | PROJECT_MANAGER |
| montor@example.com | password123 | WORKER |

SCREENSHOTS:
- Spara till: /workspace/screenshots/websocket-refactor/fas-XX/
- Namngivning: XX-beskrivning.png (01-initial-state.png, 02-after-action.png)
- Ta före och efter varje viktigt steg

RAPPORTERA:
- GODKÄNT: Funktion fungerar som förväntat + screenshot-sökvägar
- UNDERKÄNT: Beskriv vad som gick fel + screenshot-sökvägar
```

---

## 4. Dirigentens ansvar

### Innan varje block
1. Läs fas-filen för aktuellt block
2. Spawna rätt agenttyp med rätt prompt
3. Vänta på resultat (polla ALDRIG)

### Efter implementation
1. Spawna verifieringsagent
2. Om UNDERKÄNT → spawna fix-agent med avvikelserna
3. Om GODKÄNT → fortsätt till test (om tillämpligt)

### Efter verifiering — om Playwright-test krävs
1. **Dirigenten** startar servern: `bash /workspace/web/scripts/start-server.sh`
2. Spawna Haiku test-agent med MCP Playwright
3. Vänta på resultat + screenshots
4. **Dirigenten** stoppar servern: `bash /workspace/web/scripts/stop-server.sh`

> **OBS:** Servern startas/stoppas av dirigenten — INTE av test-agenten.
> Test-agenten förutsätter att servern redan körs på localhost:3000.

### Efter allt godkänt
1. Committa ändringarna (dirigenten gör detta själv)
2. Uppdatera fas-filen med [x] på genomförda punkter
3. Gå vidare till nästa block

---

## 5. Commit-regler

**Format:**
```
<type>: <kort beskrivning>

- Punkt 1
- Punkt 2

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

**Typer:**
- `feat:` — Ny funktionalitet
- `fix:` — Buggfix
- `refactor:` — Kodförbättring utan ny funktion
- `test:` — Tester
- `docs:` — Dokumentation

**Regler:**
- Committa ENDAST efter godkänd verifiering
- Inkludera ALDRIG ocommittade filer från andra arbeten
- Checka av checkboxar i fas-filen som del av commit

---

## 6. Screenshot-struktur

```
/workspace/screenshots/
└── websocket-refactor/
    ├── fas-01/
    │   ├── 01-initial-state.png
    │   ├── 02-after-change.png
    │   └── 03-final-result.png
    ├── fas-02/
    │   └── ...
    └── fas-05/
        └── ...
```

**Namngivning:**
- `XX-beskrivning.png`
- Använd löpnummer (01, 02, 03...)
- Kort beskrivande text på engelska

---

## 7. Avvikelsehantering

### Nivåer

1. **Varning** — Något avviker men blockerar inte
   - Logga i rapporten
   - Fortsätt arbetet

2. **Fel** — Något går inte att genomföra
   - Beskriv problemet tydligt
   - Föreslå lösning
   - Vänta på dirigentens beslut

3. **Kritiskt** — Arbetet måste avbrytas
   - Avbryt omedelbart
   - Rapportera till dirigenten
   - Dirigenten fattar beslut om nästa steg

### Rapporteringsformat

```
## Avvikelse

**Nivå:** Varning / Fel / Kritiskt
**Block:** X.X
**Fil:** /workspace/web/src/...
**Rad:** XX

**Problem:**
[Beskrivning]

**Orsak:**
[Om känd]

**Förslag:**
[Lösning]
```

---

## 8. Kontext som ALLA agenter ska få

Varje agent-prompt ska börja med:

```
## Projektkontext

Detta är ArbetsYtan — en multi-tenant SaaS för hantverkare med AI-assistans.

LÄS DESSA FILER FÖRST (OBLIGATORISKT):
1. /workspace/AGENTS.md — Projektregler och konventioner
2. /workspace/PROJEKT.md — Projektöversikt
3. /workspace/DEVLOG.md — Dokumenterade problem och lösningar
4. /workspace/plan/websocket-refactor/README.md — Övergripande plan
5. /workspace/plan/websocket-refactor/fas-XX.md — Aktuellt block

VIKTIGA REGLER:
- Tenant-isolering via tenantDb()/userDb() — ALDRIG global prisma för tenant-data
- UI-texter via next-intl — aldrig hårdkodade strängar
- Server Components som default — 'use client' bara vid interaktivitet
- Alla actions har auth-check via requireAuth/requireRole
```

---

## 9. Mobil-överväganden

Socket.IO fungerar för både webb och mobil. Vid ändringar:

1. Testa att events når mobilappen (om möjligt)
2. Payload-format ska vara konsistent
3. Autentisering via JWT-token för mobil, session-cookie för webb

---

## 10. Parallellisering

**Tillåtet:**
- Flera oberoende faser kan förberedas parallellt (design)
- Olika modeller kan implementeras parallellt om de inte delar filer

**Förbjudet:**
- Parallella ändringar i samma fil
- Implementation innan design är godkänd
- Test innan verifiering är godkänd
