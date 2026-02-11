# Fas 6 — Notifikationer och realtid

> Läs `plan/README.md` först för arbetsflöde och regler.
> Läs relevanta `/docs/*.md` innan implementation.

### Block 6.1: In-app-notifikationer och Socket.IO
**Input:** Fas 2 klar (auth), Fas 3 klar (dashboard)
**Output:** Fungerande notifikationssystem med Socket.IO

- [ ] Konfigurera `socket.io` (server) och `socket.io-client` (klient) — redan installerade i Block 1.1A
- [ ] Skapa Socket.IO-server i `web/src/lib/socket.ts` med säkerhetsmodell enligt `AI.md`:
  - Autentisering vid anslutning: validera session (webb) eller JWT (mobil), avvisa ogiltiga
  - Extrahera `tenantId`, `userId`, `role` vid anslutning — lagra på socket-objektet
  - Klienten kan ALDRIG skicka eller överskriva dessa värden
- [ ] Implementera rumsstruktur (server-hanterad, ej klient-styrd):
  - `tenant:{tenantId}` — joinas automatiskt vid anslutning
  - `user:{userId}` — joinas automatiskt vid anslutning
  - `project:{projectId}` — joinas efter `requireProject()`-validering
- [ ] All emit sker till specifika rum — aldrig broadcast. Data filtreras i backend via `tenantDb(tenantId)` innan emit.
- [ ] Klienten ansluter vid inloggning med `useSocket` hook
- [ ] Skapa `createNotification`-funktion som sparar i DB + emittar via Socket.IO till `user:{userId}`-rum
- [ ] Visa notifikationsklocka i topbar med antal olästa
- [ ] Bygga notifikationspanel med lista och "markera som läst"
- [ ] Server Action `markNotificationRead`

**Verifiering:** Socket.IO-anslutning fungerar, autentisering avvisar ogiltiga sessioner/JWT, rum hanteras av server (klienten kan inte joina själv), data filtreras i backend, notifikationer visas i realtid, `npm run build` OK

### Block 6.2: Push och e-postnotifikationer
**Input:** Block 6.1 klart, Resend konfigurerat (Block 2.4)
**Output:** Push- och e-postnotifikationer

- [ ] Implementera Web Push API — service worker, subscription, VAPID-nycklar
- [ ] Skicka push-notis vid viktiga händelser (deadline < 24h, uppgift tilldelad)
- [ ] Exponera push-subscription-registrering i inställningar
- [ ] Skicka e-post via Resend vid kritiska händelser
- [ ] Mallar för: uppgift tilldelad, deadline imorgon, projektstatusändring
- [ ] Inställningar per användare: vilka händelser triggar e-post

**Verifiering:** Push-notis skickas, e-post skickas, inställningar sparas, `npm run build` OK

### Block 6.3: Realtidsuppdateringar
**Input:** Block 6.1 klart (Socket.IO fungerar)
**Output:** Realtidsuppdateringar av UI

- [ ] Socket.IO-events för uppgiftsändringar (annan teammedlem uppdaterar)
- [ ] Socket.IO-events för nya filer
- [ ] Socket.IO-events för projektstatusändringar
- [ ] Klienten lyssnar och uppdaterar UI i realtid

**Verifiering:** UI uppdateras vid ändringar från annan användare, events emittas till rätt rum (projekt/tenant), data hämtas via `tenantDb(tenantId)` innan emit, `npm run build` OK

### Block 6.4: Påminnelser vid inaktivitet
**Input:** Block 6.1 + 6.2 klara
**Output:** Automatiska påminnelser

- [ ] Bakgrundsjobb som kontrollerar uppgifter med deadline som inte uppdaterats
- [ ] Konfigurerbar tröskel (t.ex. 2 dagar utan aktivitet innan deadline)
- [ ] Skicka påminnelse till tilldelad person via notifikationssystemet
- [ ] Regelbaserad kanalval: in-app alltid, push vid < 24h till deadline, e-post vid < 12h

**Verifiering:** Påminnelser triggas vid inaktivitet, rätt kanal väljs, `tenantDb(tenantId)` på alla queries, `npm run build` OK

---
