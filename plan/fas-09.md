# Fas 9 — Betalning (Stripe)

> Läs `plan/README.md` först för arbetsflöde och regler.
> Läs relevanta `/workspace/docs/*.md` innan implementation.

### Block 9.1: Stripe-setup och trial
**Input:** Fas 2 klar (registrering), `/workspace/docs/stripe.md`
**Output:** Stripe-integration med trial

- [ ] Konfigurera Stripe med produkter och priser
- [ ] Skapa webhook-endpoint `web/src/app/api/webhooks/stripe/route.ts`
- [ ] Hantera events: checkout.session.completed, invoice.paid, customer.subscription.updated/deleted
- [ ] Vid registrering: skapa Stripe Customer + 14-dagars trial
- [ ] Spara stripeCustomerId på Tenant
- [ ] Skapa Subscription-post i DB

**Verifiering:** Webhook tar emot events, webhook validerar och kopplar events till rätt tenant via `stripeCustomerId` (ingen cross-tenant-läckage), trial skapas vid registrering, Subscription sparas i DB, `npm run build` OK

### Block 9.2: Prenumerationshantering
**Input:** Block 9.1 klart
**Output:** Faktureringssida med prenumerationshantering

- [ ] Bygga faktureringssida i inställningar
- [ ] Visa aktuell plan, status och nästa fakturadatum
- [ ] "Uppgradera/Ändra plan"-knapp → Stripe Customer Portal
- [ ] Hantera misslyckade betalningar (status PAST_DUE)
- [ ] Vid CANCELED: begränsa åtkomst men behåll data
- [ ] Räkna antal aktiva memberships per tenant
- [ ] Uppdatera Stripe-prenumeration vid tillägg/borttagning av användare
- [ ] Visa kostnad per användare i inställningar

**Verifiering:** Faktureringssida visar korrekt info, Customer Portal öppnas, användare räknas korrekt, `tenantDb(tenantId)` på alla queries, `npm run build` OK

### Block 9.3: Playwright-test för Fas 9
**Input:** Block 9.1–9.2 klara
**Output:** Screenshots och verifiering av betalning

- [ ] Starta dev-server med PID-fil
- [ ] Logga in som admin och navigera till fakturering
- [ ] Ta screenshot av faktureringssidan (plan, status, nästa faktura)
- [ ] Klicka på "Uppgradera plan" och verifiera att Stripe portal öppnas
- [ ] Ta screenshot av kostnad per användare
- [ ] Verifiera att trial-status visas korrekt för nya konton
- [ ] Spara alla screenshots i `screenshots/fas-09/`
- [ ] Stoppa dev-server

**Verifiering:** Alla screenshots sparade, Stripe-integration fungerar, inga konsolfel
