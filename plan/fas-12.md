# Fas 12 — Deploy och produktion

> Läs `plan/README.md` först för arbetsflöde och regler.
> Läs relevanta `/workspace/docs/*.md` innan implementation.

### Block 12.1: Docker och Coolify
**Input:** Fas 1–11 klara (alla block avbockade), `/workspace/docs/docker.md`, `/workspace/docs/coolify.md`
**Output:** Produktionsdeploy

- [x] Skapa produktions-Dockerfile för Next.js
- [x] Konfigurera multi-stage build
- [x] Testa lokalt med `docker build` och `docker run`
- [x] Konfigurera Coolify med GitHub-integration (coolify.json)
- [x] Konfigurera PostgreSQL som separat tjänst i Coolify
- [x] Konfigurera MinIO som separat tjänst
- [x] Konfigurera Redis som separat tjänst (session-cache + Socket.IO-adapter)
- [x] Konfigurera Socket.IO Redis-adapter (`@socket.io/redis-adapter`) för multi-instans-stöd
- [x] Sätta miljövariabler i Coolify (dokumenterat i coolify.json)
- [ ] Konfigurera domän och SSL — **SKIPPAD** (kräver faktisk server)
- [ ] Verifiera automatisk deploy vid push till main — **SKIPPAD** (kräver faktisk server)

**Verifiering:** Docker-image bygger, deploy lyckas, appen svarar på domän med SSL

### Block 12.2: Övervakning
**Input:** Block 12.1 klart
**Output:** Grundläggande övervakning

- [ ] Felrapportering (Sentry eller liknande)
- [ ] Healthcheck-endpoint
- [ ] Loggning av viktiga händelser

**Verifiering:** Sentry fångar fel, healthcheck svarar 200, loggar skrivs
