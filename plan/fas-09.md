# Fas 9 — Betalning (Stripe)

> Läs `plan/README.md` först för arbetsflöde och regler.
> Läs relevanta `/workspace/docs/*.md` innan implementation.

### Block 9.1: Stripe-setup och trial
**Input:** Fas 2 klar (registrering), `/workspace/docs/stripe.md`
**Output:** Stripe-integration med trial

- [x] Konfigurera Stripe med produkter och priser
- [x] Skapa webhook-endpoint `web/src/app/api/webhooks/stripe/route.ts`
- [x] Hantera events: checkout.session.completed, invoice.paid, customer.subscription.updated/deleted
- [x] Vid registrering: skapa Stripe Customer + 14-dagars trial
- [x] Spara stripeCustomerId på Tenant
- [x] Skapa Subscription-post i DB

**Verifiering:** Webhook tar emot events, webhook validerar och kopplar events till rätt tenant via `stripeCustomerId` (ingen cross-tenant-läckage), trial skapas vid registrering, Subscription sparas i DB, `npm run build` OK

### Block 9.2: Prenumerationshantering
**Input:** Block 9.1 klart
**Output:** Faktureringssida med prenumerationshantering

- [x] Bygga faktureringssida i inställningar
- [x] Visa aktuell plan, status och nästa fakturadatum
- [x] "Uppgradera/Ändra plan"-knapp → Stripe Customer Portal
- [x] Hantera misslyckade betalningar (status PAST_DUE)
- [x] Vid CANCELED: begränsa åtkomst men behåll data
- [x] Räkna antal aktiva memberships per tenant
- [x] Uppdatera Stripe-prenumeration vid tillägg/borttagning av användare
- [x] Visa kostnad per användare i inställningar

**Verifiering:** Faktureringssida visar korrekt info, Customer Portal öppnas, användare räknas korrekt, `tenantDb(tenantId)` på alla queries, `npm run build` OK

### Block 9.3: Playwright-test för Fas 9
**Input:** Block 9.1–9.2 klara
**Output:** Screenshots och verifiering av betalning

- [x] Starta dev-server med PID-fil
- [x] Logga in som admin och navigera till fakturering
- [x] Ta screenshot av faktureringssidan (plan, status, nästa faktura)
- [x] Klicka på "Uppgradera plan" och verifiera att Stripe portal öppnas
- [x] Ta screenshot av kostnad per användare
- [x] Verifiera att trial-status visas korrekt för nya konton
- [x] Spara alla screenshots i `screenshots/fas-09/`
- [x] Stoppa dev-server

**Verifiering:** Alla screenshots sparade, Stripe-integration fungerar, inga konsolfel
