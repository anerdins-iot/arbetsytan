# Fas 2 — Autentisering och multi-tenant

> Läs `plan/README.md` först för arbetsflöde och regler.
> Läs relevanta `/docs/*.md` innan implementation.

## Fas 2 — Autentisering och multi-tenant

### Block 2.1: Auth.js-konfiguration
**Modell:** Claude `opus` (komplex, auth + callbacks + proxy)
**Input:** Fas 1 klar, `/docs/auth.md`
**Output:** Fungerande Auth.js med session-hantering

- [ ] Installera och konfigurera Auth.js v5 med Credentials-provider
- [ ] Konfigurera `src/lib/auth.ts` med session-callbacks
- [ ] Skapa `proxy.ts` enligt Next.js 16-mönster (ej middleware.ts)
- [ ] Implementera lösenordshashning med bcrypt vid registrering
- [ ] Konfigurera session-strategi (cookies för webb)
- [ ] Lägga till `tenantId` och `role` i session via callbacks

**Verifiering:** Auth-config laddar utan fel, session-callbacks returnerar tenantId/role, `npm run build` OK

### Block 2.2: Registrering och inloggning
**Modell:** Claude `opus` (komplex, frontend + backend + auth)
**Input:** Block 2.1 klart
**Output:** Fungerande registrering och inloggningssidor

- [ ] Bygga registreringssida med formulär: namn, e-post, lösenord, företagsnamn
- [ ] Skapa Server Action `registerUser` — validering med Zod, skapa User + Tenant + Membership(ADMIN)
- [ ] Hantera felmeddelanden på svenska (e-post redan registrerad, valideringsfel)
- [ ] Automatisk inloggning efter registrering
- [ ] Redirect till dashboard
- [ ] Bygga inloggningssida med e-post och lösenord
- [ ] Skapa Server Action `loginUser` med Zod-validering
- [ ] Felhantering: felaktiga uppgifter, låst konto
- [ ] Redirect till dashboard efter lyckad inloggning
- [ ] "Glömt lösenord"-länk (placeholder — implementeras i Block 2.4)

**Verifiering:** Registrering skapar User+Tenant+Membership, inloggning fungerar, redirect till dashboard, alla texter via i18n, `npm run build` OK

### Block 2.3: Session och skyddade routes
**Modell:** Gemini `gemini-3-flash-preview` (2 filer, hjälpfunktioner)
**Input:** Block 2.1 + 2.2 klara
**Output:** Auth-wrappers och skyddade routes

- [ ] Skapa `getSession`-hjälpfunktion som returnerar user, tenantId, role
- [ ] Skapa `requireAuth`-wrapper för Server Actions som kontrollerar session
- [ ] Skapa `requireRole`-wrapper som kräver specifik roll (ADMIN, PROJECT_MANAGER)
- [ ] Alla dashboard-sidor kontrollerar session — redirect till login om ej autentiserad
- [ ] Alla Server Actions kontrollerar auth + tenant

**Verifiering:** Oautentiserad request redirectar till login, `requireAuth` och `requireRole` fungerar, `npm run build` OK

### Block 2.4: Lösenordsåterställning
**Modell:** Claude `opus` (komplex, e-post + token + formulär)
**Input:** Block 2.2 + 2.3 klara, Resend-konto
**Output:** Fungerande lösenordsåterställningsflöde

- [ ] Konfigurera Resend för e-postutskick
- [ ] Bygga "Glömt lösenord"-sida med e-postfält
- [ ] Skapa Server Action som genererar VerificationToken och skickar e-post
- [ ] Bygga "Nytt lösenord"-sida som tar emot token
- [ ] Skapa Server Action som validerar token och uppdaterar lösenord

**Verifiering:** E-post skickas, token valideras, lösenord uppdateras, `npm run build` OK

### Block 2.5: Inbjudningar
**Modell:** Claude `opus` (komplex, e-post + registrering + roller)
**Input:** Block 2.2 + 2.3 + 2.4 klara (auth + Resend)
**Output:** Fungerande inbjudningsflöde

- [ ] Bygga inbjudningsformulär i inställningar (e-post + roll)
- [ ] Skapa Server Action `inviteUser` — skapar Invitation med token och expiresAt
- [ ] Skicka inbjudningsmail via Resend med unik länk
- [ ] Bygga accepteringssida — skapa konto och Membership med vald roll
- [ ] Hantera redan registrerade användare (koppla till befintlig User)
- [ ] Visa listan med aktiva och väntande inbjudningar i inställningar
- [ ] Server Action för att avbryta inbjudan

**Verifiering:** Inbjudan skickas via e-post, acceptering skapar Membership, tenant-filter på alla queries, `npm run build` OK
