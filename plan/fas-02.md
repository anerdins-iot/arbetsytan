# Fas 2 — Autentisering och multi-tenant

> Läs `plan/README.md` först för arbetsflöde och regler.
> Läs relevanta `/workspace/docs/*.md` innan implementation.

### Block 2.1: Auth.js-konfiguration
**Input:** Fas 1 klar, `/workspace/docs/auth.md`
**Output:** Fungerande Auth.js med session-hantering

- [x] Installera och konfigurera Auth.js v5 med Credentials-provider
- [x] Skapa `web/src/lib/auth.config.ts` (edge-kompatibel, inga DB-imports) — exporterar providers och callbacks
- [x] Skapa `web/src/lib/auth.ts` med full konfiguration (PrismaAdapter + auth.config)
- [x] Skapa `web/proxy.ts` som importerar ENDAST från auth.config (ej auth.ts) enligt Next.js 16-mönster
- [x] Implementera lösenordshashning med bcrypt vid registrering
- [x] Konfigurera session-strategi (cookies för webb)
- [x] Lägga till `tenantId` och `role` i session via callbacks
- [x] Konfigurera JWT-strategi för mobil: kort access token (15 min) + refresh token (30 dagar), signerad med server-secret

**Verifiering:** Auth-config laddar utan fel, session-callbacks returnerar tenantId/role, `npm run build` OK

### Block 2.2: Registrering och inloggning
**Input:** Block 2.1 klart
**Output:** Fungerande registrering och inloggningssidor

- [x] Bygga registreringssida med formulär: namn, e-post, lösenord, företagsnamn
- [x] Skapa Server Action `registerUser` — validering med Zod, skapa User + Tenant + Membership(ADMIN)
- [x] Hantera felmeddelanden på svenska (e-post redan registrerad, valideringsfel)
- [x] Automatisk inloggning efter registrering
- [x] Redirect till dashboard
- [x] Bygga inloggningssida med e-post och lösenord
- [x] Skapa Server Action `loginUser` med Zod-validering
- [x] Felhantering: felaktiga uppgifter
- [x] Felhantering: låst konto — lägg till `lockedAt DateTime?` och `failedLoginAttempts Int @default(0)` i User-modellen, lås konto efter 5 misslyckade försök
- [x] Redirect till dashboard efter lyckad inloggning
- [x] "Glömt lösenord"-länk (placeholder — implementeras i Block 2.4)

**Verifiering:** Registrering skapar User+Tenant+Membership, inloggning fungerar, redirect till dashboard, alla texter via i18n, `npm run build` OK

### Block 2.3: Session, skyddade routes och tenant-isolering
**Input:** Block 2.1 + 2.2 klara
**Output:** Auth-wrappers, skyddade routes och tenant-scoped databasklient

- [x] Skapa `getSession`-hjälpfunktion som returnerar user, tenantId, role
- [x] Skapa `requireAuth`-wrapper för Server Actions som kontrollerar session och returnerar verifierat `tenantId`
- [x] Skapa `requireRole`-wrapper som kräver specifik roll (ADMIN, PROJECT_MANAGER)
- [x] Skapa `requireProject(tenantId, projectId, userId)`-funktion som verifierar att projektet tillhör rätt tenant och att användaren har åtkomst (projektmedlem eller Admin-roll). Returnerar projektet eller kastar fel.
- [x] Skapa tenant-scoped Prisma-klient i `web/src/lib/db.ts` med Prisma client extension:
  - `tenantDb(tenantId)` — returnerar en Prisma-klient som automatiskt injicerar `WHERE tenantId = ?` på alla queries (find, update, delete, count, aggregate)
  - `tenantDb(tenantId)` ska även automatiskt sätta `tenantId` vid `create`-operationer
  - Den globala `prisma`-klienten finns kvar men är ENBART för plattformsoperationer (superadmin, cron, auth utan tenant-kontext)
- [x] Alla dashboard-sidor kontrollerar session — redirect till login om ej autentiserad
- [x] Alla Server Actions kontrollerar auth med `requireAuth`, hämtar `tenantId` därifrån, och använder `tenantDb(tenantId)` för databasåtkomst

**Verifiering:** Oautentiserad request redirectar till login, `requireAuth` och `requireRole` fungerar, `requireProject()` validerar projektåtkomst, `tenantDb()` injicerar tenantId på alla queries, det är omöjligt att göra tenant-databasfrågor utan `tenantDb()`, `npm run build` OK

### Block 2.4: Lösenordsåterställning
**Input:** Block 2.2 + 2.3 klara, Resend-konto
**Output:** Fungerande lösenordsåterställningsflöde

- [x] Konfigurera Resend för e-postutskick
- [x] Bygga "Glömt lösenord"-sida med e-postfält
- [x] Skapa Server Action som genererar VerificationToken och skickar e-post
- [x] Bygga "Nytt lösenord"-sida som tar emot token
- [x] Skapa Server Action som validerar token och uppdaterar lösenord

**Verifiering:** E-post skickas, token valideras, lösenord uppdateras, `npm run build` OK

### Block 2.5: Inbjudningar
**Input:** Block 2.2 + 2.3 + 2.4 klara (auth + Resend)
**Output:** Fungerande inbjudningsflöde

- [x] Bygga inbjudningsformulär i inställningar (e-post + roll)
- [x] Skapa Server Action `inviteUser` — skapar Invitation med token och expiresAt
- [x] Skicka inbjudningsmail via Resend med unik länk
- [x] Bygga accepteringssida — skapa konto och Membership med vald roll
- [x] Hantera redan registrerade användare (koppla till befintlig User)
- [x] Visa listan med aktiva och väntande inbjudningar i inställningar
- [x] Server Action för att avbryta inbjudan

**Verifiering:** Inbjudan skickas via e-post, acceptering skapar Membership, `tenantDb(tenantId)` på alla queries, `npm run build` OK

### Block 2.6: Playwright-test för Fas 2
**Input:** Block 2.1–2.5 klara
**Output:** Screenshots och verifiering av alla auth-flöden

- [x] Starta dev-server med PID-fil
- [x] Navigera till login-sidan, ta screenshot
- [x] Navigera till registreringssidan, ta screenshot
- [x] Testa registreringsformuläret (fyll i, verifiera redirect till dashboard)
- [x] Logga ut, testa inloggning med skapade credentials
- [x] Navigera till "glömt lösenord"-sidan, ta screenshot
- [x] Navigera till team-inställningar, ta screenshot av inbjudningsformuläret
- [x] Verifiera att oautentiserade requests redirectar till login
- [x] Spara alla screenshots i `screenshots/fas-02/`
- [x] Stoppa dev-server

**Verifiering:** Alla screenshots sparade, alla flöden fungerar, inga konsolfel
