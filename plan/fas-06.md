# Fas 6 — Notifikationer och realtid

> Läs `plan/README.md` först för arbetsflöde och regler.
> Läs relevanta `/docs/*.md` innan implementation.

### Block 6.1: In-app-notifikationer och SSE
**Modell:** Claude `opus` (komplex, SSE + realtid + UI)
**Input:** Fas 2 klar (auth), Fas 3 klar (dashboard)
**Output:** Fungerande notifikationssystem med SSE

- [ ] Skapa API-route för SSE: `src/app/api/sse/route.ts`
- [ ] Klienten ansluter med EventSource vid inloggning
- [ ] Skapa `createNotification`-funktion som sparar i DB + skickar via SSE
- [ ] Visa notifikationsklocka i topbar med antal olästa
- [ ] Bygga notifikationspanel med lista och "markera som läst"
- [ ] Server Action `markNotificationRead`

**Verifiering:** SSE-anslutning fungerar, notifikationer visas i realtid, markering fungerar, tenantId-filter, `npm run build` OK

### Block 6.2: Push och e-postnotifikationer
**Modell:** Claude `opus` (komplex, Web Push API + Resend)
**Input:** Block 6.1 klart, Resend konfigurerat (Block 2.4)
**Output:** Push- och e-postnotifikationer

- [ ] Implementera Web Push API — service worker, subscription, VAPID-nycklar
- [ ] Skicka push-notis vid viktiga händelser (AI bedömer vikt)
- [ ] Exponera push-subscription-registrering i inställningar
- [ ] Skicka e-post via Resend vid kritiska händelser
- [ ] Mallar för: uppgift tilldelad, deadline imorgon, projektstatusändring
- [ ] Inställningar per användare: vilka händelser triggar e-post

**Verifiering:** Push-notis skickas, e-post skickas, inställningar sparas, `npm run build` OK

### Block 6.3: Realtidsuppdateringar
**Modell:** Gemini `gemini-3-flash-preview` (enkel, bygger på befintlig SSE)
**Input:** Block 6.1 klart (SSE fungerar)
**Output:** Realtidsuppdateringar av UI

- [ ] SSE-events för uppgiftsändringar (annan teammedlem uppdaterar)
- [ ] SSE-events för nya filer
- [ ] SSE-events för projektstatusändringar
- [ ] Klienten lyssnar och uppdaterar UI i realtid

**Verifiering:** UI uppdateras vid ändringar från annan användare, `npm run build` OK

### Block 6.4: Påminnelser vid inaktivitet
**Modell:** Claude `opus` (komplex, bakgrundsjobb + AI-bedömning)
**Input:** Block 6.1 + 6.2 klara
**Output:** Automatiska påminnelser

- [ ] Bakgrundsjobb som kontrollerar uppgifter med deadline som inte uppdaterats
- [ ] Konfigurerbar tröskel (t.ex. 2 dagar utan aktivitet innan deadline)
- [ ] Skicka påminnelse till tilldelad person via notifikationssystemet
- [ ] AI bedömer allvarlighetsgrad och väljer kanal (in-app, push, e-post)

**Verifiering:** Påminnelser triggas vid inaktivitet, rätt kanal väljs, tenantId-filter, `npm run build` OK

---
