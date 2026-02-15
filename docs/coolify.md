---
title: Coolify Deployment Guide
description: Komplett guide för self-hosted deployment med Coolify - alternativ till Vercel, Heroku och Railway
tags: [coolify, deployment, self-hosted, docker, paas, nextjs, ssl, databases]
---

# Coolify Deployment Guide

Coolify är en open-source, self-hostable PaaS (Platform as a Service) som fungerar som ett alternativ till Vercel, Heroku, Netlify och Railway. Med Coolify kan du deploya webbplatser, databaser, webapplikationer och 280+ one-click services till din egen server.

## Översikt

### Vad är Coolify?

Coolify gör self-hosting enkelt och kraftfullt. Du får full kontroll över dina projekt, data och kostnader. Det är helt gratis att använda, open-source, och har inga funktioner bakom en paywall.

**Viktigt:** Coolify är INTE en molntjänst som hostar allt åt dig - du behöver din egen server med SSH-åtkomst.

### Funktionalitet

Coolify tillhandahåller följande funktioner:

- **Deployment:** Deploya applikationer från Git-repositories
- **Databaser:** Inbyggt stöd för PostgreSQL, MariaDB, Redis
- **SSL/TLS:** Automatisk Let's Encrypt certifikathantering
- **Monitoring:** Inbyggd monitoring och loggning
- **Backups:** Automatiska backups till S3-kompatibel storage
- **Multi-Server:** Stöd för deployment till flera servrar
- **Docker Swarm:** Stöd för Docker Swarm clustering

## Installation

### Snabb Installation (Rekommenderad)

Det enklaste sättet att installera Coolify:

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash
```

**OBS:** För Ubuntu användare - automatisk installation fungerar endast med LTS-versioner (20.04, 22.04, 24.04). För non-LTS versioner, se [Manuell Installation](#manuell-installation).

### Serverkrav

#### Minimum Hardware

- **CPU:** 2 cores
- **RAM:** 2 GB
- **Storage:** 30 GB ledigt utrymme

**Rekommenderat för produktion:**
- **CPU:** 4 cores
- **RAM:** 8 GB
- **Storage:** 150 GB

#### Operativsystem

Coolify stödjer:
- **Debian-baserade:** Debian, Ubuntu (alla versioner, men non-LTS kräver manuell installation)
- **Redhat-baserade:** CentOS, Fedora, Redhat, AlmaLinux, Rocky, Asahi
- **SUSE-baserade:** SLES, SUSE, openSUSE
- **Arch Linux** (inte alla derivat stöds)
- **Alpine Linux**
- **Raspberry Pi OS 64-bit** (Raspbian)

#### Arkitektur

- AMD64 (x86_64)
- ARM64

#### Förberedelser

1. **SSH-åtkomst:** Logga in som root (non-root användare stöds inte fullt ut ännu)
2. **Firewall:** Konfigurera brandvägg (se [Firewall Guide](https://coolify.io/docs/knowledge-base/server/firewall))
3. **SSH-inställningar:** Följ [SSH Settings Guide](https://coolify.io/docs/knowledge-base/server/openssh#ssh-settings-configuration)
4. **curl:** Säkerställ att `curl` är installerat (vanligtvis förinstallerat)

### Manuell Installation

För system där automatisk installation inte fungerar:

#### 1. Skapa kataloger

```bash
mkdir -p /data/coolify/{source,ssh,applications,databases,backups,services,proxy,webhooks-during-maintenance}
mkdir -p /data/coolify/ssh/{keys,mux}
mkdir -p /data/coolify/proxy/dynamic
```

#### 2. Generera SSH-nyckel

```bash
# Generera SSH-nyckel för Coolify
ssh-keygen -f /data/coolify/ssh/keys/id.root@host.docker.internal -t ed25519 -N '' -C root@coolify

# Lägg till public key till authorized_keys
cat /data/coolify/ssh/keys/id.root@host.docker.internal.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

#### 3. Ladda ner konfigurationsfiler

```bash
cd /data/coolify/source
curl -fsSL https://cdn.coollabs.io/coolify/docker-compose.yml -o docker-compose.yml
curl -fsSL https://cdn.coollabs.io/coolify/docker-compose.prod.yml -o docker-compose.prod.yml
curl -fsSL https://cdn.coollabs.io/coolify/.env.production -o .env
curl -fsSL https://cdn.coollabs.io/coolify/upgrade.sh -o upgrade.sh
```

#### 4. Sätt behörigheter

```bash
chown -R 9999:root /data/coolify
chmod -R 700 /data/coolify
```

#### 5. Generera säkra värden

```bash
cd /data/coolify/source
sed -i "s|APP_ID=.*|APP_ID=$(openssl rand -hex 16)|g" .env
sed -i "s|APP_KEY=.*|APP_KEY=base64:$(openssl rand -base64 32)|g" .env
sed -i "s|DB_PASSWORD=.*|DB_PASSWORD=$(openssl rand -base64 32)|g" .env
sed -i "s|REDIS_PASSWORD=.*|REDIS_PASSWORD=$(openssl rand -base64 32)|g" .env
sed -i "s|PUSHER_APP_ID=.*|PUSHER_APP_ID=$(openssl rand -hex 32)|g" .env
sed -i "s|PUSHER_APP_KEY=.*|PUSHER_APP_KEY=$(openssl rand -hex 32)|g" .env
sed -i "s|PUSHER_APP_SECRET=.*|PUSHER_APP_SECRET=$(openssl rand -hex 32)|g" .env
```

**VIKTIGT:** Kör dessa kommandon endast vid första installationen. Att ändra dessa värden senare kan bryta installationen.

#### 6. Skapa Docker-nätverk

```bash
docker network create --attachable coolify
```

#### 7. Starta Coolify

```bash
docker compose --env-file /data/coolify/source/.env \
  -f /data/coolify/source/docker-compose.yml \
  -f /data/coolify/source/docker-compose.prod.yml \
  up -d --pull always --remove-orphans --force-recreate
```

#### 8. Åtkomst

Efter installation, besök `http://<din-server-ip>:8000` och skapa ditt första admin-konto.

**VIKTIGT:** Skapa admin-kontot omedelbart efter installation. Om någon annan når registreringssidan först kan de få full kontroll över servern.

## Docker Integration

Coolify är byggt på Docker och fungerar perfekt med befintliga Docker-projekt. Se [Docker-dokumentationen](./docker.md) för mer information om Docker-setup.

### Docker Compose Support

Coolify kan deploya projekt som använder `docker-compose.yml`:

```yaml
# Exempel: docker-compose.yml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=${DATABASE_URL}
    depends_on:
      - db

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ${DB_NAME}
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### Dockerfile Support

Coolify kan bygga och deploya direkt från Dockerfile. Se [docker.md](./docker.md) för Dockerfile-exempel.

## GitHub Integration & Auto-Deploy

### Setup GitHub Integration

1. **I Coolify Dashboard:**
   - Gå till **Settings** → **Source Providers**
   - Klicka på **GitHub** och auktorisera med ditt GitHub-konto

2. **Skapa nytt projekt:**
   - Klicka på **New Resource** → **Application**
   - Välj **GitHub** som source
   - Välj repository och branch

3. **Konfigurera auto-deploy:**
   - **Auto Deploy:** Aktivera för automatisk deployment vid push
   - **Branch:** Välj branch att deploya från (t.ex. `main`, `production`)

### Pull Request Deployments

Coolify stödjer automatisk deployment av Pull Requests:

1. **Aktivera PR Deployments:**
   - I projekt-inställningar, aktivera **Pull Request Deployments**
   - Varje PR får sin egen deployment-URL för review

2. **Funktionalitet:**
   - Varje PR deployas till separat miljö
   - Deployment-URL genereras automatiskt
   - Automatisk cleanup när PR stängs eller mergas

### Webhooks

Coolify stödjer webhooks för CI/CD-integration:

```bash
# Exempel: GitHub Actions workflow
name: Deploy to Coolify

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Coolify Deployment
        run: |
          curl -X POST https://coolify.example.com/api/v1/webhooks/deploy \
            -H "Authorization: Bearer ${{ secrets.COOLIFY_API_TOKEN }}" \
            -H "Content-Type: application/json" \
            -d '{"project_id": "your-project-id"}'
```

## Environment Variables & Secrets

### Hantera Environment Variables

I Coolify Dashboard:

1. Gå till ditt projekt → **Environment Variables**
2. Lägg till variabler:
   - **Key:** Variabelnamn (t.ex. `DATABASE_URL`)
   - **Value:** Variabelvärde
   - **Is Predefined:** För systemvariabler
   - **Is Build Time:** För variabler som behövs vid build

### Secrets Management

Coolify hanterar secrets via environment variables:

```bash
# Exempel: Känsliga variabler
DATABASE_URL=postgresql://user:password@db:5432/mydb
AUTH_SECRET=your-secret-key-here
API_KEY=your-api-key
```

Secrets lagras i Coolify Dashboard och injiceras som environment variables vid deployment.

### Environment Variables i Next.js

Next.js exponerar environment variables enligt följande:

- Variabler med prefix `NEXT_PUBLIC_` exponeras till client-side kod
- Övriga variabler är endast tillgängliga på server-side

Se [Next.js dokumentation](https://nextjs.org/docs/app/building-your-application/configuring/environment-variables) för detaljer.

## SSL/TLS med Let's Encrypt

### Automatisk SSL Setup

Coolify konfigurerar automatiskt Let's Encrypt SSL-certifikat:

1. **Lägg till domän:**
   - I projekt-inställningar → **Domains**
   - Lägg till din domän (t.ex. `example.com`)

2. **Automatisk certifikatgenerering:**
   - Coolify genererar automatiskt SSL-certifikat via Let's Encrypt
   - Certifikat förnyas automatiskt före utgångsdatum

3. **HTTPS-redirect:**
   - Aktivera **Force HTTPS** för automatisk redirect från HTTP till HTTPS

### Custom Domains

```bash
# DNS-konfiguration
# A-record: example.com → <din-server-ip>
# CNAME: www.example.com → example.com
```

### Wildcard Certificates

Coolify stödjer wildcard-certifikat för subdomäner:

```
*.example.com → Gäller för alla subdomäner
```

## Databas-hantering

### PostgreSQL

1. **Skapa PostgreSQL-databas:**
   - **New Resource** → **Database** → **PostgreSQL**
   - Välj version (t.ex. 16-alpine)
   - Konfigurera användarnamn och lösenord

2. **Anslut från applikation:**
   ```bash
   DATABASE_URL=postgresql://user:password@postgres-container:5432/dbname
   ```

3. **Backup:**
   - Automatiska backups till S3-kompatibel storage
   - Manuell backup via dashboard

### MariaDB

1. **Skapa MariaDB-databas:**
   - **New Resource** → **Database** → **MariaDB**
   - Välj version (t.ex. 11)

2. **Anslut från applikation:**
   ```bash
   DATABASE_URL=mysql://user:password@mariadb-container:3306/dbname
   ```

### Redis

1. **Skapa Redis-instans:**
   - **New Resource** → **Database** → **Redis**
   - Konfigurera lösenord

2. **Anslut från applikation:**
   ```bash
   REDIS_URL=redis://:password@redis-container:6379
   ```

### Database Backups

Coolify stödjer automatiska backups:

1. **Konfigurera S3 Storage:**
   - **Settings** → **Backup Storage**
   - Lägg till S3-kompatibel storage (AWS S3, DigitalOcean Spaces, etc.)

2. **Automatiska backups:**
   - Backups körs automatiskt enligt schema
   - Lagras i S3-kompatibel storage

3. **Restore:**
   - Välj backup från dashboard
   - Klicka på **Restore** för återställning

## Monitoring & Logs

### Real-time Monitoring

Coolify inkluderar inbyggd monitoring:

- **Server Resources:** CPU, RAM, Disk usage
- **Application Health:** Status, uptime, response times
- **Database Metrics:** Connections, query performance

### Logs

1. **Application Logs:**
   - Real-time log viewing i dashboard
   - Filtrera efter log level (INFO, WARN, ERROR)
   - Export logs för analys

2. **Server Logs:**
   - System logs
   - Docker logs
   - Coolify service logs

### Notifications

Konfigurera notifikationer för:

- Deployment success/failure
- Server resource warnings
- Application errors
- Database backup status

**Stödda kanaler:**
- Discord
- Telegram
- Email
- Webhooks

## Backup-strategier

### Application Backups

1. **Automatiska backups:**
   - Konfigurera backup-schema i projekt-inställningar
   - Backups inkluderar:
     - Application code
     - Environment variables
     - Database data
     - Volumes

2. **Manuella backups:**
   - Klicka på **Backup Now** i dashboard
   - Backups lagras i S3-kompatibel storage

### Database Backups

Se [Databas-hantering](#databas-hantering) för database-specifika backups.

### Restore Process

1. **Välj backup:**
   - Gå till **Backups** i dashboard
   - Välj backup att återställa

2. **Restore:**
   - Klicka på **Restore**
   - Välj vad som ska återställas (app, database, volumes)
   - Bekräfta restore

## Multi-App Deployment

### Hantera Flera Projekt

Coolify stödjer obegränsat antal projekt på samma server:

1. **Teams:**
   - Skapa teams för projektorganisation
   - Dela resurser mellan teammedlemmar
   - Rollbaserad åtkomstkontroll

2. **Resource Management:**
   - Översikt över alla projekt i dashboard
   - Resource usage per projekt
   - Centraliserad hantering via dashboard

### Server Distribution

Coolify stödjer multi-server setups:

1. **Lägg till servrar:**
   - **Settings** → **Servers** → **Add Server**
   - Anslut via SSH

2. **Deploy till specifik server:**
   - Välj server vid deployment
   - Load balancing mellan servrar

### Docker Swarm Support

Coolify stödjer Docker Swarm för clustering:

```bash
# Initiera Swarm
docker swarm init

# Lägg till worker nodes
docker swarm join --token <token> <manager-ip>:2377
```

## Next.js Deployment

Coolify stödjer Next.js deployment via Docker. Konfiguration:

1. **Next.js Config:**
   - `output: 'standalone'` krävs för Docker deployment
   - Se [Next.js dokumentation](https://nextjs.org/docs/app/api-reference/next-config-js/output) för detaljer

2. **Deployment Process:**
   - **New Resource** → **Application**
   - Välj source (GitHub, GitLab, etc.)
   - Coolify detekterar automatiskt Next.js och konfigurerar build
   - Lägg till environment variables i projekt-inställningar
   - Konfigurera domän för SSL

3. **Dockerfile:**
   - Se [docker.md](./docker.md) för Dockerfile-exempel

## Konfiguration & Inställningar

### Security Settings

Coolify Dashboard innehåller följande säkerhetsinställningar:

- **SSH Keys:** Hantera SSH-nycklar för server-anslutning
- **Secrets:** Hantera känsliga environment variables
- **Firewall:** Konfigurera brandväggsregler
- **Updates:** Konfigurera automatiska uppdateringar

### Performance Settings

Coolify stödjer följande performance-inställningar:

- **Resource Limits:** Sätt CPU och minnesbegränsningar per container
- **Caching:** Konfigurera Redis för caching
- **CDN:** Integrera CDN för statiska assets
- **Database Connection Pooling:** Konfigurera connection pooling för databaser

### Maintenance Settings

Coolify inkluderar följande maintenance-funktioner:

- **Backup Schedule:** Konfigurera automatiska backups
- **Monitoring Alerts:** Sätt upp notifikationer för kritiska händelser
- **Log Retention:** Konfigurera hur länge logs ska behållas
- **Update Notifications:** Få notifikationer om tillgängliga uppdateringar

## Troubleshooting

### Vanliga Problem

#### Installation Misslyckas

```bash
# Kontrollera Docker
docker --version
docker ps

# Kontrollera disk space
df -h

# Kontrollera logs
docker logs coolify
```

#### Deployment Misslyckas

1. **Kontrollera logs:**
   - Application logs i dashboard
   - Build logs för build-fel
   - Server logs för systemfel

2. **Kontrollera environment variables:**
   - Verifiera att alla variabler är satta
   - Kontrollera syntax (inga extra spaces)

3. **Kontrollera Docker:**
   ```bash
   docker ps
   docker logs <container-name>
   ```

#### SSL Certifikat Problem

1. **Kontrollera DNS:**
   ```bash
   dig example.com
   nslookup example.com
   ```

2. **Kontrollera portar:**
   - Port 80 och 443 måste vara öppna
   - Kontrollera firewall-regler

3. **Manuell certifikatgenerering:**
   - I dashboard: **Domains** → **Regenerate Certificate**

#### Database Connection Issues

1. **Kontrollera connection string:**
   ```bash
   DATABASE_URL=postgresql://user:password@container-name:5432/dbname
   ```

2. **Kontrollera network:**
   ```bash
   docker network ls
   docker network inspect coolify
   ```

3. **Testa connection:**
   ```bash
   docker exec -it <db-container> psql -U user -d dbname
   ```

## Ytterligare Resurser

- **Officiell Dokumentation:** https://coolify.io/docs
- **GitHub Repository:** https://github.com/coollabsio/coolify
- **Discord Community:** https://coollabs.io/discord
- **Docker Guide:** Se [docker.md](./docker.md) för Docker-specifik information

## Feature Overview

Coolify stödjer följande features:

| Feature | Beskrivning |
|---------|-------------|
| **Git Integration** | GitHub, GitLab, Bitbucket, Gitea |
| **Auto-Deploy** | Automatisk deployment vid push |
| **PR Deployments** | Separata deployments för Pull Requests |
| **SSL Certificates** | Automatisk Let's Encrypt certifikathantering |
| **Databaser** | PostgreSQL, MariaDB, Redis |
| **Backups** | Automatiska backups till S3-kompatibel storage |
| **Monitoring** | Server och application monitoring |
| **Multi-Server** | Deployment till flera servrar |
| **Docker Swarm** | Stöd för Docker Swarm clustering |
| **Webhooks** | CI/CD integration via webhooks |
| **API** | REST API för automation |

## API Reference

Coolify tillhandahåller REST API för automation:

### Authentication

```bash
# API Token
Authorization: Bearer <your-api-token>
```

### Endpoints

- `GET /api/v1/projects` - Lista alla projekt
- `POST /api/v1/projects` - Skapa nytt projekt
- `GET /api/v1/projects/{id}` - Hämta projekt
- `POST /api/v1/projects/{id}/deploy` - Deploya projekt
- `GET /api/v1/servers` - Lista servrar
- `POST /api/v1/webhooks/deploy` - Trigger deployment via webhook

Se [Coolify API Documentation](https://coolify.io/docs/api-reference) för komplett API-referens.
