# Fas 9 — Betalning (Stripe)

> Läs `plan/README.md` först för arbetsflöde och regler.
> Läs relevanta `/docs/*.md` innan implementation.

### Block 9.1: Stripe-setup och trial
**Input:** Fas 2 klar (registrering), `/docs/stripe.md`
**Output:** Stripe-integration med trial

- [ ] Konfigurera Stripe med produkter och priser
- [ ] Skapa webhook-endpoint `src/app/api/stripe/webhook/route.ts`
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
