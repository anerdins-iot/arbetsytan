# Fas 6 — Notifikationer (screenshots)

Screenshots genereras av Playwright-testet `web/e2e/fas-06-notifications.spec.ts`.

**Kör testet (startar och stoppar dev-server):**
```bash
cd web && bash scripts/run-fas06-e2e.sh
```

**Förväntade filer efter körning:**
- `01-notification-list.png` — notifikationspanel i topbar (öppnad efter klick på klockan)
- `02-push-settings.png` — inställningssidan med push/notifikationsinställningar

Servern måste kunna starta på port 3000 (ingen annan process). PID sparas i `web/.dev-server.pid` och används för stopp (aldrig pkill).
