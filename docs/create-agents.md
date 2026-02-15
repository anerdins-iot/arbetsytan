---
title: AGENTS.md
description: Guide for att skapa AGENTS.md - projektinstruktioner for AI-agenter
tags: [agents, ai, conventions, project-setup]
---

## Syfte

`AGENTS.md` ar projektets "README for maskiner". Den ger AI-agenter den tysta kunskap som manskliga utvecklare har — arkitektur, konventioner, kommandon och regler — utan att slosa kontextfonster.

Filen ska vara **stabil och sallan behova uppdateras**. Hanvisa till mappar och filer for detaljer istallet for att hardkoda innehall.

---

## Principer

1. **Kort och karnfull** — Max 150-300 rader. Punktlistor, inga narrativ.
2. **Stabil** — Beskriv arkitektur med mappar, inte enskilda filer/routes.
3. **Progressive disclosure** — Beratta VAR info finns, dumpa inte allt.
4. **Single source of truth** — Referera till `/workspace/docs/`, duplicera inte.
5. **Maskinlasbar** — Markdown med tydliga rubriker, kodblock for kommandon.

---

## Obligatoriska sektioner

### 1. Oversikt

Vad projektet ar, vem det ar for, och vad det gor. Max 3 meningar.

```markdown
## Oversikt

Bokningssystem for [Foretagsnamn], en frisorsalong i Goteborg.
Kunder bokar tider online, personal hanterar schema via admin-panel.
```

### 2. Tech Stack

Lista teknologier med hanvisning till docs. Inga versionsnummer — docs ar single source of truth.

```markdown
## Tech Stack

| Komponent | Teknologi | Docs |
|-----------|-----------|------|
| Framework | Next.js | `/workspace/docs/nextjs.md` |
| Databas | PostgreSQL + Prisma | `/workspace/docs/prisma.md` |
| Auth | Auth.js | `/workspace/docs/auth.md` |
| Styling | Tailwind CSS | `/workspace/docs/tailwind.md` |
| Deploy | Docker + Coolify | `/workspace/docs/docker.md` |
```

### 3. Kommandon

De viktigaste kommandona for att starta, bygga och verifiera.

```markdown
## Kommandon

| Kommando | Beskrivning |
|----------|-------------|
| `docker compose up -d` | Starta databaser |
| `npm run dev` | Starta dev-server |
| `npm run build` | Bygg for produktion |
| `npx prisma migrate dev` | Kor migrations |
| `npx prisma studio` | Oppna DB-gui |
```

**Dev-server nar agenter kor Playwright:** Agenten som startar dev-servern maste kunna stoppa den utan att doda sig sjalv. Anvand alltid PID-baserad stopp (spara PID i `.dev-server.pid` vid start, `kill` endast den PID:en vid stopp). Aldrig `pkill -f`. Se `/workspace/docs/docker.md` avsnitt "Dev-server i agent- och testmiljo (Playwright)".

### 4. Arkitektur

Beskriv mappstruktur och var logik ska ligga. Hanvisa till mappar — lista inte enskilda filer.

```markdown
## Arkitektur

```
src/
├── app/           # Next.js App Router (sidor, layouts)
├── components/    # UI-komponenter
│   ├── ui/        # shadcn/ui baskomponenter
│   └── [feature]/ # Feature-specifika komponenter
├── lib/           # Hjalpar, databas, auth-config
├── actions/       # Server Actions (all CRUD-logik)
└── types/         # TypeScript-typer
```

- **Server Actions** (`src/actions/`) — All databaslogik. Validera med Zod, kontrollera auth.
- **Komponenter** (`src/components/`) — Folj shadcn/ui-monster. Se styleguide-sidan.
- **Sidor** (`src/app/`) — Server Components som default. `'use client'` bara vid interaktivitet.
```

### 5. Konventioner

Projektspecifika regler som inte fangas av linters.

```markdown
## Konventioner

- Svenska i UI-texter och kommentarer
- Server Components som default — `'use client'` bara vid interaktivitet
- All data fran databasen via Server Actions — aldrig hardkodad
- Design tokens fran `tokens.css` — inga hardkodade farger/spacing
- Alla Server Actions har auth-check + Zod-validering
- Referera till `/workspace/docs/` for tekniska detaljer och breaking changes
```

### 6. Regler (Forbjudet)

Saker som ALDRIG ska goras. Hjalper agenten undvika vanliga misstag.

```markdown
## Forbjudet

- Hardkodade farger eller spacing (anvand tokens)
- `useEffect` for data fetching (anvand `use()` + Suspense)
- Mock-data i UI-komponenter (all data fran DB)
- CHANGE_ME eller platshallare i `.env`
- Committa `.env.local` eller hemligheter
- Direkt DOM-manipulation
```

---

## Valfria sektioner

### Testkonton

```markdown
## Testkonton

| Roll | E-post | Losenord |
|------|--------|----------|
| Admin | admin@example.com | [genererat] |
| User | user@example.com | [genererat] |
```

### Viktiga filer

Bara for filer som ar svara att hitta eller har speciell betydelse.

```markdown
## Viktiga filer

- `src/lib/auth.ts` — Auth.js-konfiguration
- `src/lib/db.ts` — Prisma-klient
- `tokens.css` — Alla design tokens (farger, spacing)
- `prisma/schema.prisma` — Databasschema
- `prisma/seed.ts` — Seed-data
```

### Deployment

```markdown
## Deployment

Appen deployas via Coolify med Dockerfile. Se `/workspace/docs/coolify.md`.
Databaser och Redis konfigureras som separata tjanster i Coolify-projektet.
```

---

## DEVLOG.md — Lopande erfarenhetslogg

`DEVLOG.md` ar ett komplement till `AGENTS.md`. Medan AGENTS.md ar stabil och sallan andras, ar DEVLOG.md en **levande logg** som vaxer under hela bygget.

### Syfte

- **Dokumentera problem och losningar** — allt som inte gick enligt plan
- **Dela erfarenheter mellan agenter** — en agent som lost ett problem sparar andra fran att gora samma misstag
- **Underlag for regeluppdateringar** — efter projektet kan DEVLOG.md analyseras for att forbattra prompter och docs

### Regler

1. **Alla agenter MASTE lasa DEVLOG.md** innan de borjar arbeta
2. **Alla agenter ska skriva till DEVLOG.md** nar de stoter pa och loser problem
3. Skriv kortfattat — max 3-5 rader per post
4. Inkludera alltid: datum, fas, problem, losning
5. Huvudagenten laser DEVLOG.md efter varje fas for att fanga monster

### Format

```markdown
# DEVLOG

Lopande logg over problem, losningar och lardomar under bygget.
Alla agenter MASTE lasa denna fil innan de borjar och skriva till den vid problem.

---

## Fas 1: Setup

### Prisma migration misslyckades
- **Problem:** `npx prisma migrate dev` gav "database does not exist"
- **Orsak:** Docker-containern hade inte hunnit starta klart
- **Losning:** La till `sleep 3` efter `docker compose up -d` innan migration
- **Larosom:** Vanta alltid pa healthcheck innan databaskommandon

### TypeScript strict mode
- **Problem:** `npm run build` gav 12 type errors efter auth-setup
- **Orsak:** Auth.js returnerar `Session | null`, inte `Session`
- **Losning:** La till null-check i alla Server Actions: `if (!session) throw...`
- **Larosom:** Hantera alltid nullable session

---

## Fas 2: Design System

### Kontrast i dark mode
- **Problem:** `--muted-foreground` hade bara 2.8:1 kontrast mot `--background` i dark mode
- **Losning:** Justerade fran `hsl(240 5% 55%)` till `hsl(240 5% 65%)`
- **Larosom:** Kontrollera kontrast i BADA teman, inte bara light mode
```

### Instruktioner till agenter

Lagg till i varje agents task-beskrivning:

```
Las DEVLOG.md innan du borjar — den innehaller erfarenheter fran tidigare steg.
Om du stoter pa problem som inte ar triviala, dokumentera dem i DEVLOG.md med:
- Problem, orsak, losning och larosom (max 3-5 rader).
```

### Efter projektet

Nar projektet ar klart, ga igenom DEVLOG.md och:
1. Identifiera aterkommande problem → uppdatera `/workspace/docs/` med losningar
2. Hitta monsterproblem → lagg till regler i prompter/docs
3. Dokumentera projektspecifika larosor i projektets README

---

## Struktur for stora projekt

For monorepos eller stora projekt, anvand nested `AGENTS.md`:

```
projekt/
├── AGENTS.md              # Oversikt, stack, gemensamma regler
├── src/
│   ├── app/
│   │   └── AGENTS.md      # Routing, layouts, sidstruktur
│   ├── components/
│   │   └── AGENTS.md      # Komponentkonventioner, tokens
│   └── actions/
│       └── AGENTS.md      # Server Action-monster, validering
```

Narmaste `AGENTS.md` vinner — agenten laser den som ar mest relevant for sin nuvarande uppgift.

---

## Vanliga misstag

| Misstag | Battre |
|---------|--------|
| Lista alla API-routes | Hanvisa till `src/app/api/` |
| Kopiera in konfiguration | Referera till filen (`se next.config.ts`) |
| Skriva som en linter | Lat ESLint skota formatteringsregler |
| Vaga instruktioner ("Skriv bra kod") | Specifika regler ("Anvand tidig return") |
| Hardkoda versionsnummer | Hanvisa till `/workspace/docs/` |
| For lang fil (500+ rader) | Max 150-300 rader, bryt ut till nested filer |

---

## Mall

Komplett mall att fylla i for nya projekt:

```markdown
# AGENTS.md

## Oversikt

[Vad projektet ar, for vem, och huvudfunktion — max 3 meningar]

## Tech Stack

| Komponent | Teknologi | Docs |
|-----------|-----------|------|
| Framework | Next.js | `/workspace/docs/nextjs.md` |
| Databas | PostgreSQL + Prisma | `/workspace/docs/prisma.md` |
| Auth | Auth.js | `/workspace/docs/auth.md` |
| Styling | Tailwind CSS | `/workspace/docs/tailwind.md` |
| Deploy | Docker + Coolify | `/workspace/docs/docker.md` |

## Kommandon

| Kommando | Beskrivning |
|----------|-------------|
| `docker compose up -d` | Starta databaser |
| `npm run dev` | Dev-server |
| `npm run build` | Produktionsbygg |
| `npx prisma migrate dev` | Migrations |

## Arkitektur

[Mappstruktur med korta beskrivningar]

## Konventioner

- [Projektspecifika regler]

## Forbjudet

- [Saker som aldrig ska goras]

## Testkonton

| Roll | E-post | Losenord |
|------|--------|----------|
| Admin | admin@example.com | [genererat] |
```
