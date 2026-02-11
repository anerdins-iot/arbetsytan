# Fas 10 — Landningssida

> Läs `plan/README.md` först för arbetsflöde och regler.
> Läs relevanta `/workspace/docs/*.md` innan implementation.

### Block 10.1: Landningssida
**Input:** Fas 1 klar (Next.js + i18n)
**Output:** Publik landningssida

- [x] Bygga hero-sektion med rubrik, beskrivning och "Kom igång gratis"-knapp
- [x] Bygga funktionssektion med rutnät: projekthantering, filer, AI, team
- [x] Bygga "Så fungerar det" i tre steg
- [x] Bygga prissättningssektion med planer
- [x] Bygga socialt bevis-sektion (placeholder-citat)
- [x] Bygga footer med kontaktinfo och länkar
- [x] Responsiv design — mobil först
- [x] SEO: metadata, Open Graph, sitemap
- [x] Generera AI-bilder med `generate_image` för hero, funktioner och steg-sektioner
- [x] Integrera bilder i komponenterna (spara i `web/public/images/`)

**Verifiering:** Alla sektioner renderas, responsiv design fungerar, SEO-metadata finns, alla texter via i18n, AI-genererade bilder visas korrekt, `npm run build` OK

### Block 10.2: Playwright-test för Fas 10
**Input:** Block 10.1 klart
**Output:** Screenshots och verifiering av landningssidan

- [ ] Starta dev-server med PID-fil
- [ ] Navigera till landningssidan (/)
- [ ] Ta screenshot av hero-sektion (desktop)
- [ ] Scrolla till funktionssektionen, ta screenshot
- [ ] Scrolla till "Så fungerar det", ta screenshot
- [ ] Scrolla till prissättning, ta screenshot
- [ ] Scrolla till socialt bevis, ta screenshot
- [ ] Scrolla till footer, ta screenshot
- [ ] Ändra viewport till mobil (375px), ta screenshot av hela sidan
- [ ] Verifiera att "Kom igång gratis"-knapp leder till registrering
- [ ] Spara alla screenshots i `screenshots/fas-10/`
- [ ] Stoppa dev-server

**Verifiering:** Alla screenshots sparade, responsiv design fungerar, alla sektioner visas korrekt, inga konsolfel
