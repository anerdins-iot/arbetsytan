# Fas 7 — Inställningar och administration

> Läs `plan/README.md` först för arbetsflöde och regler.
> Läs relevanta `/docs/*.md` innan implementation.

### Block 7.1: Företags- och användarinställningar
**Input:** Fas 2 klar (auth + roller)
**Output:** Inställningssidor

- [ ] Bygga inställningssida med sektioner
- [ ] Företagsuppgifter: namn, organisationsnummer, adress
- [ ] Server Action `updateTenant` med admin-check
- [ ] Lista alla användare i tenant med roll
- [ ] Ändra roll på befintlig användare
- [ ] Ta bort användare (avsluta membership)
- [ ] Visa inbjudningar (aktiva, väntande, utgångna)

**Verifiering:** Inställningar sparas, rollcheck fungerar, admin-only åtkomst, `tenantDb(tenantId)` på alla queries, `npm run build` OK

### Block 7.2: Rättighetshantering
**Input:** Block 7.1 klart
**Output:** Konfigurerbart rättighetssystem

- [ ] Definiera konfigurerbara rättigheter per roll
- [ ] UI för att ändra rättigheter per roll
- [ ] Spara i Membership.permissions (JSON)
- [ ] Alla Server Actions respekterar permissions

**Verifiering:** Rättigheter sparas och respekteras, alla Server Actions kontrollerar permissions, `tenantDb(tenantId)` på alla queries, `npm run build` OK

### Block 7.3: Personliga inställningar
**Input:** Block 7.1 klart, Block 6.2 klart (notifikationskanaler)
**Output:** Profil- och preferenssida

- [ ] Profilsida: namn, e-post, profilbild
- [ ] Byta lösenord
- [ ] Notifikationsinställningar: vilka kanaler (in-app, push, e-post) per händelsetyp
- [ ] Dark mode-preferens
- [ ] Språkval (svenska/engelska) — sparas i User.locale

**Verifiering:** Profil uppdateras, lösenord byts, preferenser sparas, `npm run build` OK
