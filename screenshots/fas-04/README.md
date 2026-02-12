# Fas 4 — Filhantering (screenshots)

Screenshots genereras av Playwright-testet när dev-servern är igång och nåbar.

**Kör E2E (startar och stoppar servern):**
```bash
cd web && bash scripts/run-fas04-e2e.sh
```

**Om servern redan kör:** installera browsers lokalt och kör bara testet:
```bash
cd web
PLAYWRIGHT_BROWSERS_PATH=/workspace/web/.playwright-browsers npx playwright test e2e/fas-04-files.spec.ts --project=chromium
```

Förväntade filer: `01-files-tab.png`, `02-after-upload.png`, `03-lightbox.png`, `04-pdf-preview.png`.
