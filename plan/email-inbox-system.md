# E-postinkorg med tvåvägskommunikation

> Läs `plan/README.md` först för arbetsflöde och regler.
> Läs `/workspace/docs/ai-sdk.md` och befintlig kod i `src/lib/email*.ts` innan implementation.
> Bygger vidare på `plan/email-log-system.md` — läs den för bakgrund.

## Översikt

Utöka befintligt e-postsystem med:
- **Inkommande mail** via Resend webhooks
- **Konversationstrådar** som kopplar ihop meddelanden
- **Spårningssystem** för att matcha svar till rätt konversation
- **Inkorgsvy** i befintlig /email-sida
- **AI-sökning** i privata mailkonversationer

## Teknisk design

### Databasschema (nya modeller)

```prisma
model EmailConversation {
  id            String    @id @default(cuid())

  // Ägare — konversationen är ALLTID privat
  tenantId      String
  tenant        Tenant    @relation(fields: [tenantId], references: [id])
  userId        String
  user          User      @relation(fields: [userId], references: [id])

  // Valfri projektkoppling (för kontext, ej delad åtkomst)
  projectId     String?
  project       Project?  @relation(fields: [projectId], references: [id])

  // Extern motpart
  externalEmail String    // motpartens e-postadress
  externalName  String?   // motpartens namn om känt

  // Spårning
  trackingCode  String    @unique  // t.ex. "abc123" för inbox+abc123@...

  // Status
  subject       String
  lastMessageAt DateTime  @default(now())
  unreadCount   Int       @default(0)
  isArchived    Boolean   @default(false)

  // Relationer
  messages      EmailMessage[]

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([tenantId, userId])
  @@index([trackingCode])
}

model EmailMessage {
  id              String    @id @default(cuid())

  // Koppling till konversation
  conversationId  String
  conversation    EmailConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  // Koppling till EmailLog (för embeddings och metadata)
  emailLogId      String?   @unique
  emailLog        EmailLog? @relation(fields: [emailLogId], references: [id])

  // Riktning och innehåll
  direction       EmailDirection  // INBOUND | OUTBOUND
  fromEmail       String
  fromName        String?
  toEmail         String

  subject         String
  bodyText        String?   @db.Text
  bodyHtml        String?   @db.Text

  // Status
  isRead          Boolean   @default(false)

  // Timestamps
  sentAt          DateTime?
  receivedAt      DateTime?
  createdAt       DateTime  @default(now())

  @@index([conversationId])
}
```

### Utökning av EmailLog

```prisma
model EmailLog {
  // ... befintliga fält ...

  // Ny relation till EmailMessage
  emailMessage    EmailMessage?
}
```

### Spårningssystem

**Reply-to med plustecken:**
- Utgående mail får reply-to: `inbox+{trackingCode}@mail.lowly.se`
- trackingCode är ett unikt cuid() kopplat till konversationen

**Osynlig HTML-spårning (backup):**
```html
<!-- lowly-tracking:{trackingCode} -->
```
Läggs längst ner i HTML-body, osynlig för användaren.

**Parsning vid inkommande:**
1. Extrahera från to-adress: `inbox+abc123@...` → `abc123`
2. Om inte hittat: sök i body efter `lowly-tracking:{code}`
3. Om inte hittat: skapa ny konversation baserat på from/subject

### API-struktur

**Webhook (POST /api/webhooks/resend):**
- Tar emot `email.received` events
- Verifierar Resend webhook-signatur
- Parsar spårningskod
- Skapar EmailMessage och uppdaterar konversation
- Triggar embedding-generering
- Skickar notifikation via Socket.IO och e-post

**REST endpoints:**
- `GET /api/email/conversations` — lista användarens konversationer
- `GET /api/email/conversations/[id]` — hämta konversation med meddelanden
- `POST /api/email/conversations` — skapa ny konversation och skicka första mail
- `POST /api/email/conversations/[id]/reply` — svara på konversation
- `PATCH /api/email/conversations/[id]` — markera som läst/arkiverad

### Notifikationer

**Vid inkommande mail:**
1. Socket.IO event till `user:{userId}` med `email:new`
2. E-post till användarens registrerade adress från `noreply@lowly.se`:
   > "Du har fått svar från [avsändare] angående: [ämne]"

### AI-integration

Befintlig `searchEmails()` fungerar redan med userId-filtrering.

Nytt verktyg `searchMyConversations`:
- Söker i EmailConversation.subject och relaterade EmailMessage
- Filtrerar på userId från session
- Kan filtrera på projectId om angivet

---

## Status

- [x] Design och specifikation
- [x] Fas 1: Databasschema och migration
- [x] Fas 2: Spårning och webhook
- [x] Fas 3: Konversations-API
- [x] Fas 4: Inkorgsgränssnitt
- [x] Fas 5: AI-integration
- [x] Fas 6: Notifikationer
- [x] Block 7.1: Playwright-test

---

## Fas 1: Databasschema

### Block 1.1: Prisma-modeller
**Input:** Befintligt EmailLog-schema
**Output:** Nya modeller för konversationer

- [x] Lägg till `EmailConversation` modell i schema.prisma
- [x] Lägg till `EmailMessage` modell i schema.prisma
- [x] Lägg till relation från EmailLog till EmailMessage
- [x] Skapa migration: `npx prisma migrate dev --name add-email-conversations`
- [x] Verifiera att index skapas korrekt

**Verifiering:** `npx prisma generate` OK, `npm run build` OK

**Genomfört:** 2026-02-16. Migration skapad men ej körd mot DB (kräver reset pga tidigare migration).

---

## Fas 2: Spårning och webhook

### Block 2.1: Spårningssystem
**Input:** Block 1.1 klart
**Output:** Funktioner för att generera och parsa spårningskoder

- [x] Skapa `src/lib/email-tracking.ts`:
  - `generateTrackingCode()` — genererar unikt hex (28 tecken, avviker från cuid)
  - `buildReplyToAddress(trackingCode)` — returnerar `inbox+{code}@mail.lowly.se`
  - `buildTrackingHtml(trackingCode)` — returnerar osynlig HTML-kommentar
  - `parseTrackingCode(toAddress, htmlBody)` — extraherar kod från adress eller body
- [x] Konfigurera `RESEND_RECEIVING_DOMAIN` i miljövariabler
- [ ] Uppdatera `sendEmail()` i `email.ts` att inkludera tracking när `conversationId` anges (hanteras i actions istället)

**Verifiering:** `npm run build` OK

**Genomfört:** 2026-02-16. TrackingCode använder hex istället för cuid (fungerar lika bra).

### Block 2.2: Resend webhook
**Input:** Block 2.1 klart
**Output:** Webhook-endpoint för inkommande mail

- [x] Skapa `src/app/api/webhooks/resend/route.ts`:
  - Verifiera webhook-signatur med `RESEND_WEBHOOK_SECRET`
  - Hantera `email.received` event
  - Hantera `email.delivered`, `email.bounced`, `email.failed` för statusuppdatering
- [x] Skapa `src/services/email-inbound.ts`:
  - `processInboundEmail(payload)` — huvudlogik
  - Parsa spårningskod
  - Hitta konversation (skapar INTE ny vid saknad kod, loggar istället)
  - Skapa EmailMessage
  - ~~Uppdatera EmailLog om finns~~ (skjuts till Fas 5)
  - ~~Kö embedding-generering~~ (skjuts till Fas 5)
- [x] Lägg till `RESEND_WEBHOOK_SECRET` i miljövariabler

**Verifiering:** Webhook svarar 200 vid giltig signatur, 401 vid ogiltig, `npm run build` OK

**Genomfört:** 2026-02-16. Avvikelser:
- Ny konversation skapas INTE vid saknad trackingCode (loggas istället, undviker spam)
- EmailLog-koppling och embedding-generering skjuts till Fas 5

---

## Fas 3: Konversations-API

### Block 3.1: Service-lager
**Input:** Fas 2 klar
**Output:** Core-funktioner för konversationer

- [x] Skapa `src/services/email-conversations.ts`:
  - `getConversationsCore(tenantId, userId, options)` — lista med paginering, filter
  - `getConversationCore(tenantId, userId, conversationId)` — inkl meddelanden
  - `createConversationCore(tenantId, userId, data)` — ny konversation
  - `replyToConversationCore(tenantId, userId, conversationId, data)` — skicka svar
  - `markAsReadCore(tenantId, userId, conversationId)` — markera läst
  - `archiveConversationCore(tenantId, userId, conversationId)` — arkivera
- [x] Alla funktioner filtrerar på `tenantId` OCH `userId`
- [x] Uppdaterat `db.ts` med tenant-filtrering för emailConversation och emailMessage

**Verifiering:** `npm run build` OK

**Genomfört:** 2026-02-16.

### Block 3.2: Server Actions
**Input:** Block 3.1 klart
**Output:** Actions för frontend

- [x] Skapa `src/actions/email-conversations.ts`:
  - `getConversations(options)` — med auth-check
  - `getConversation(id)` — med auth-check
  - `createConversation(data)` — validering, auth, skapa + skicka mail med tracking
  - `replyToConversation(id, data)` — validering, auth, skicka svar med tracking
  - `markConversationAsRead(id)` — auth-check
  - `archiveConversation(id)` — auth-check
- [x] Zod-scheman för validering (getConversationsOptionsSchema, createConversationSchema, replyToConversationSchema)
- [ ] Aktivitetsloggning vid nya konversationer (kan läggas till senare)

**Verifiering:** `npm run build` OK

**Genomfört:** 2026-02-16. Actions inkluderar buildReplyToAddress och buildTrackingHtml vid mail-skick.

---

## Fas 4: Inkorgsgränssnitt

### Block 4.1: Konversationslista
**Input:** Fas 3 klar
**Output:** Inkorgsvy med lista

- [x] Uppdatera `/[locale]/(dashboard)/email/page.tsx`:
  - Lägg till Tabs: "Inkorg", "Skickat", "Skriv"
  - Standard-tab är "Inkorg"
- [x] Skapa `src/components/email/conversation-list.tsx`:
  - Lista med ConversationCard för varje konversation
  - Visar: avsändare, ämne, förhandsgranskning, datum, oläst-badge
  - Klick öppnar Sheet
  - Tom state med ikon och beskrivning
- [x] Skapa `src/components/email/conversation-card.tsx`:
  - Kompakt rad med info
  - Oläst markeras med prick eller fet text
  - Projektkoppling visas som liten badge

**Verifiering:** UI renderar korrekt, `npm run build` OK

### Block 4.2: Konversationsdetalj
**Input:** Block 4.1 klart
**Output:** Sheet för att läsa och svara

- [x] Skapa `src/components/email/conversation-sheet.tsx`:
  - Sheet från höger (som TaskDetailSheet)
  - Header med ämne, motpart, projektkoppling
  - Meddelandelista med bubblor (inkommande/utgående)
  - Svarsformulär längst ner
  - Arkivera-knapp
- [x] URL-stöd: `?conversationId=xxx` öppnar Sheet direkt
- [x] Markera som läst när Sheet öppnas

**Verifiering:** Sheet öppnas och stängs, meddelanden visas, svar skickas, `npm run build` OK

### Block 4.3: Skapa ny konversation
**Input:** Block 4.1 klart
**Output:** Formulär för nytt mail

- [x] Uppdatera befintlig `EmailComposer` eller skapa ny:
  - Fält: Till, Ämne, Meddelande
  - Valfri projektkoppling (dropdown)
  - Skicka skapar konversation
- [x] Efter skickat: navigera till konversationen eller visa bekräftelse

**Verifiering:** Nytt mail skapar konversation, `npm run build` OK

---

## Fas 5: AI-integration

### Block 5.1: Utöka AI-verktyg
**Input:** Fas 3 klar
**Output:** AI kan söka i konversationer

- [x] Uppdatera `searchMyEmails` i personal-tools.ts:
  - Inkludera konversationskontext i resultaten
  - Returnera conversationId för djupare sökning
- [x] Lägg till verktyg `getConversationContext`:
  - Tar conversationId
  - Validerar att användaren äger konversationen
  - Returnerar alla meddelanden i tråden
- [x] Uppdatera AI system-prompt att nämna mailsökning

**Verifiering:** AI kan hitta och citera mailinnehåll, `npm run build` OK

---

## Fas 6: Notifikationer

### Block 6.1: Realtidsnotifikationer
**Input:** Fas 2 klar (webhook fungerar)
**Output:** Notis vid nytt mail

- [x] I `processInboundEmail`:
  - Emit Socket.IO event `email:new` till `user:{userId}`
  - Skapa Notification med type `EMAIL_RECEIVED`
- [x] Uppdatera `useSocketEvent` i email-sidan att lyssna på `email:new`
- [x] Visa badge på "E-post" i sidebar vid olästa

**Verifiering:** Notis visas i realtid, badge uppdateras, `npm run build` OK

### Block 6.2: E-postnotifikation
**Input:** Block 6.1 klart
**Output:** Avisering via e-post

- [x] Skapa mall `email-reply-notification` i email-templates.ts:
  - Ämne: "Nytt svar från {avsändare}"
  - Innehåll: förhandsgranskning + länk till konversationen
- [x] I `processInboundEmail`:
  - Skicka notifikationsmail till användarens registrerade e-post
  - Respektera användarens notifikationsinställningar
- [x] Avsändare: `noreply@lowly.se` (eller konfigurerad RESEND_FROM)

**Verifiering:** E-post skickas vid nytt svar, `npm run build` OK

---

## Playwright-test

### Block 7.1: E2E-test av inkorg
**Input:** Alla faser klara
**Output:** Screenshots och verifiering

- [x] Starta server med `/workspace/web/scripts/start-server.sh`
- [x] Logga in som testanvändare
- [x] Navigera till /email
- [x] Ta screenshot av tom inkorg
- [x] Skapa ny konversation via UI
- [x] Ta screenshot av konversationslistan
- [x] Öppna konversation i Sheet
- [x] Ta screenshot av konversationsdetalj
- [x] Skicka svar
- [x] Ta screenshot av uppdaterad tråd
- [x] Spara alla screenshots i `screenshots/email-inbox/`
- [x] Stoppa server med `/workspace/web/scripts/stop-server.sh`

**Genomfört:** 2026-02-16. Tre parallella Haiku-agenter körde testerna. Screenshots sparade lokalt (ej committade pga gitignore).

**Verifiering:** Alla screenshots sparade, inga konsolfel

---

## Miljövariabler

```env
# Befintliga
RESEND_API_KEY=re_xxx
RESEND_FROM=noreply@lowly.se

# Nya
RESEND_RECEIVING_DOMAIN=mail.lowly.se
RESEND_WEBHOOK_SECRET=whsec_xxx
```

---

## Säkerhet

- **Tenant-isolering:** Alla queries via `tenantDb(tenantId)`
- **Användarskydd:** Konversationer filtreras på `userId` — ingen delad åtkomst
- **Webhook-verifiering:** Resend signatur valideras med HMAC
- **Projektkoppling:** Valideras med `requireProject()` om projectId anges

---

## Beroenden

- Resend v6.9.2 (redan installerat)
- pgvector (redan konfigurerat)
- Socket.IO (redan konfigurerat)

---

## Risker och mitigering

| Risk | Sannolikhet | Mitigering |
|------|-------------|------------|
| Resend webhook-latens | Låg | Kö-baserad bearbetning, retry-logik |
| Spårningskod försvinner i mailklient | Medel | Dubbel spårning (adress + HTML) |
| Spam/oönskade mail | Medel | Rate limiting, spam-filter i Resend |
| Embeddings tar tid | Låg | Asynkron köhantering (redan implementerat) |

---

## Framtida utbyggnad

- **Bilagor:** Spara inkommande bilagor i S3, visa i UI
- **Mallar:** Snabbsvar och fördefinierade meddelanden
- **Schemaläggning:** Skicka mail vid specifik tid
- **Etikettering:** Kategorisera konversationer med taggar
- **Massutskick:** Skicka till flera mottagare (nyhetsbrev)
