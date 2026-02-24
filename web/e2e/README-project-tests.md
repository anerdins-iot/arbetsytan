# E2E-tester: projektsidan (mobil)

To run E2E: start server (e.g. `web/scripts/start-server.sh`), then `web/scripts/run-e2e.sh` (or `cd web && npx playwright test`).  
`run-e2e.sh` installerar Chromium vid behov. Får du "Executable doesn't exist", kör `cd web && npx playwright install chromium` och kör testerna igen.

## Siddata och seed

Efter senaste seed-uppdatering finns följande för **seed-project-1** och användaren **admin@example.com** (lösenord: password123):

| Område | Vad som finns | Kommentar |
|--------|----------------|-----------|
| **Översikt** | Projekt (namn, adress, status), 4 medlemmar, 2 aktivitetsloggposter | Aktivitet: "created task", "created note". |
| **Uppgifter** | 4 uppgifter (TODO, IN_PROGRESS, DONE), tilldelningar, 1 kommentar på QA-uppgiften | Kanban med innehåll. |
| **Filer** | 1 projektfil: e2e-plan.pdf | Filmodaltestet använder denna. |
| **Tid** | 1 tidspost (60 min WORK, kopplad till första uppgiften), formulär, exportpanel | Lista och sammanfattning har data. |
| **Anteckningar** | 5 kategorier (Beslut, Teknisk info, …), 1 anteckning (E2E seed anteckning, kategori Övrigt) | Lista och filter har innehåll. |
| **Automatiseringar** | 4 automatiseringar (PENDING, ACTIVE, PAUSED) | Lista och dialoger testbara. |

**Viktigt:** Starta eller stoppa **inte** servern i testerna. Antag att servern redan kör på baseURL (t.ex. http://localhost:3000) och att **migrationer + seed redan är körda** (`npx prisma migrate deploy` och `npx prisma db seed`).

---

## Sidor och URL:er

Alla tester använder samma inloggning och samma projekt:

- **Login:** `/{locale}/login` (locale = sv eller en)
- **Inloggning:** admin@example.com / password123
- **Projekt:** seed-project-1 (Kvarnbergsskolan)
- **Projekt-URL:** `/{locale}/projects/seed-project-1`
- **Flik via query:** `?tab=overview` | `?tab=tasks` | `?tab=files` | `?tab=time` | `?tab=notes` | `?tab=automations`

Rekommenderat flöde per test: Logga in → gå till `/{locale}/projects/seed-project-1?tab=<flik>` → vänta på att fliken är synlig → utför steg (öppna modal, fylla formulär, etc.) → assert (synlighet, ingen horisontell scroll).

---

## Playwright-setup

- **Projekt (viewport):** använd `project: "mobile"` (Pixel 5) för mobil.
- **Webbläsare:** sätt `PLAYWRIGHT_BROWSERS_PATH=/workspace/.playwright-browsers` om image har annan browser-version.
- **Timeouts:** minst 25s efter inloggning (dashboard), 60–90s totalt per test om flera flikar/modaler.

---

## Projekt-mobil E2E (fas-04)

| Spec | Flik | Körskript |
|------|------|-----------|
| **fas-04-project-overview-mobile.spec.ts** | Översikt | `web/scripts/run-fas04-overview-mobile-e2e.sh` |
| **fas-04-project-tasks-mobile.spec.ts** | Uppgifter | `web/scripts/run-fas04-tasks-mobile-e2e.sh` |
| **fas-04-files-mobile.spec.ts** | Filer | `web/scripts/run-fas04-files-mobile-e2e.sh` |
| **fas-04-project-time-mobile.spec.ts** | Tid | `web/scripts/run-fas04-time-mobile-e2e.sh` |
| **fas-04-project-notes-mobile.spec.ts** | Anteckningar | `web/scripts/run-fas04-notes-mobile-e2e.sh` |
| **fas-04-project-automations-mobile.spec.ts** | Automatiseringar | `web/scripts/run-fas04-automations-mobile-e2e.sh` |

Kör alla projekt-mobil-tester:  
`cd web && PLAYWRIGHT_BROWSERS_PATH=/workspace/.playwright-browsers npx playwright test e2e/fas-04-project-overview-mobile.spec.ts e2e/fas-04-project-tasks-mobile.spec.ts e2e/fas-04-files-mobile.spec.ts e2e/fas-04-project-time-mobile.spec.ts e2e/fas-04-project-notes-mobile.spec.ts e2e/fas-04-project-automations-mobile.spec.ts --project=mobile`

Starta eller stoppa **inte** servern i testerna; antag att servern kör och att seed är applicerad.

---

## Personlig AI-chatt och datarikt-paneler (fas-04-personal-ai)

Testerna loggar in som admin@example.com, öppnar personlig AI-chatt från topbaren, skickar en fråga som triggar ett verktyg med datarikt svar (t.ex. lista anteckningar eller inköpslistor) och verifierar att knappen "Hittade X — Öppna" visas och att klick öppnar Sheet med förväntat innehåll.

**Kör endast dessa spec(s):**

```bash
cd web && npx playwright test e2e/fas-04-personal-ai.spec.ts --project=chromium
```

För mobil (valfritt): `--project=mobile`. Kräver att servern kör och att seed är applicerad (bl.a. seed-project-1 med 1 anteckning "E2E seed anteckning").
