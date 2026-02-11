# Fas 12 — Deploy och produktion

> Läs `plan/README.md` först för arbetsflöde och regler.
> Läs relevanta `/docs/*.md` innan implementation.

### Block 12.1: Docker och Coolify
**Input:** Hela appen klar, `/docs/docker.md`, `/docs/coolify.md`
**Output:** Produktionsdeploy

- [ ] Skapa produktions-Dockerfile för Next.js
- [ ] Konfigurera multi-stage build
- [ ] Testa lokalt med `docker build` och `docker run`
- [ ] Konfigurera Coolify med GitHub-integration
- [ ] Konfigurera PostgreSQL som separat tjänst i Coolify
- [ ] Konfigurera MinIO som separat tjänst
- [ ] Konfigurera Redis som separat tjänst
- [ ] Sätta miljövariabler i Coolify
- [ ] Konfigurera domän och SSL
- [ ] Verifiera automatisk deploy vid push till main

**Verifiering:** Docker-image bygger, deploy lyckas, appen svarar på domän med SSL

### Block 12.2: Övervakning
**Input:** Block 12.1 klart
**Output:** Grundläggande övervakning

- [ ] Felrapportering (Sentry eller liknande)
- [ ] Healthcheck-endpoint
- [ ] Loggning av viktiga händelser

**Verifiering:** Sentry fångar fel, healthcheck svarar 200, loggar skrivs
