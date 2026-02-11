# Fas 2 — Autentisering och multi-tenant

> Läs `plan/README.md` först för arbetsflöde och regler.
> Läs relevanta `/workspace/docs/*.md` innan implementation.

### Block 2.1: Auth.js-konfiguration
**Input:** Fas 1 klar, `/workspace/docs/auth.md`
**Output:** Fungerande Auth.js med session-hantering

- [ ] Installera och konfigurera Auth.js v5 med Credentials-provider
- [ ] Skapa `web/src/lib/auth.config.ts` (edge-kompatibel, inga DB-imports) — exporterar providers och callbacks
- [ ] Skapa `web/src/lib/auth.ts` med full konfiguration (PrismaAdapter + auth.config)
- [ ] Skapa `web/proxy.ts` som importerar ENDAST från auth.config (ej auth.ts) enligt Next.js 16-mönster
- [ ] Implementera lösenordshashning med bcrypt vid registrering
- [ ] Konfigurera session-strategi (cookies för webb)
- [ ] Lägga till `tenantId` och `role` i session via callbacks
- [ ] Konfigurera JWT-strategi för mobil: kort access token (15 min) + refresh token (30 dagar), signerad med server-secret

**Verifiering:** Auth-config laddar utan fel, session-callbacks returnerar tenantId/role, `npm run build` OK

### Block 2.2: Registrering och inloggning
**Input:** Block 2.1 klart
**Output:** Fungerande registrering och inloggningssidor

- [ ] Bygga registreringssida med formulär: namn, e-post, lösenord, företagsnamn
- [ ] Skapa Server Action `registerUser` — validering med Zod, skapa User + Tenant + Membership(ADMIN)
- [ ] Hantera felmeddelanden på svenska (e-post redan registrerad, valideringsfel)
- [ ] Automatisk inloggning efter registrering
- [ ] Redirect till dashboard
- [ ] Bygga inloggningssida med e-post och lösenord
- [ ] Skapa Server Action `loginUser` med Zod-validering
- [ ] Felhantering: felaktiga uppgifter
- [ ] Felhantering: låst konto — lägg till `lockedAt DateTime?` och `failedLoginAttempts Int @default(0)` i User-modellen, lås konto efter 5 misslyckade försök
- [ ] Redirect till dashboard efter lyckad inloggning
- [ ] "Glömt lösenord"-länk (placeholder — implementeras i Block 2.4)

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

- [ ] Konfigurera Resend för e-postutskick
- [ ] Bygga "Glömt lösenord"-sida med e-postfält
- [ ] Skapa Server Action som genererar VerificationToken och skickar e-post
- [ ] Bygga "Nytt lösenord"-sida som tar emot token
- [ ] Skapa Server Action som validerar token och uppdaterar lösenord

**Verifiering:** E-post skickas, token valideras, lösenord uppdateras, `npm run build` OK

### Block 2.5: Inbjudningar
**Input:** Block 2.2 + 2.3 + 2.4 klara (auth + Resend)
**Output:** Fungerande inbjudningsflöde

- [ ] Bygga inbjudningsformulär i inställningar (e-post + roll)
- [ ] Skapa Server Action `inviteUser` — skapar Invitation med token och expiresAt
- [ ] Skicka inbjudningsmail via Resend med unik länk
- [ ] Bygga accepteringssida — skapa konto och Membership med vald roll
- [ ] Hantera redan registrerade användare (koppla till befintlig User)
- [ ] Visa listan med aktiva och väntande inbjudningar i inställningar
- [ ] Server Action för att avbryta inbjudan

**Verifiering:** Inbjudan skickas via e-post, acceptering skapar Membership, `tenantDb(tenantId)` på alla queries, `npm run build` OK
