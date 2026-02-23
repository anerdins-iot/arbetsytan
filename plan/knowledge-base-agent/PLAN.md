# Plan: Proaktiv Kunskapsbas-Agent för AI-chatt

## Sammanfattning

Vi ska implementera ett proaktivt kunskapshanteringssystem bestående av en dynamisk intern databas och en bakgrundsagent som kontinuerligt analyserar och strukturerar information från användarkonversationer och systemaktivitet. Systemet kommer att underhålla strukturerade kunskapstabeller med metadata och index som injiceras som initial kontext till AI-chattagenten vid varje ny konversation. Detta kompletterar det befintliga RAG-systemet genom att ge agenten bättre förståelse för vilka data som finns tillgängliga och hur de kan nås, vilket minskar onödiga motfrågor och ökar proaktiviteten. **Definition of Done:** En funktionell kunskapsbas-agent som kör i bakgrunden, uppdaterar strukturerade tabeller baserat på konversationsdata, och levererar relevant kontext till chattagenten vid start.

## Scope

### Måste ingå
- Dynamisk kunskapsdatabas med tabeller för projektmetadata, användarpreferenser, vanliga frågor/mönster och systemfunktioner
- Bakgrundsagent som analyserar konversationshistorik och systemhändelser för att uppdatera kunskapsbasen
- Integration med befintligt AI-chattsystem för kontextinjicering vid konversationsstart
- Automatisk indexering och sökbarhet inom kunskapsbasen
- Kompatibilitet med multi-tenant-arkitekturen (isolering per tenant)

### Bör ingå
- Förmåga att identifiera och lagra nya entiteter och relationer från konversationer
- Prioritering av information baserat på frekvens och relevans
- Grundläggande versionshantering av kunskapsbasens innehåll
- Prestandaoptimering för snabb kontexthämtning

### Får inte ingå (non-goals)
- Ersätta det befintliga RAG-systemet för dokumentinnehåll
- Implementera komplett kunskapsgraf med semantiska relationer (första iteration)
- Realtime-uppdatering av pågående konversationer (endast vid ny konversationsstart)
- Avancerad maskininlärning för kunskapsextraktion (använder regelbaserad logik + LLM-analys)

## Nuvarande läge och constraints

### Utgångsläge
- **AI-system**: Stateles chatt med verktygsanrop, personlig AI och projekt-AI, kommunicerar via AIMessage-tabellen
- **Datakällor**: Konversationshistorik (Message-tabellen), systemhändelser, användarinteraktioner
- **RAG**: Finns redan för dokumentinnehåll via embeddings och pgvector
- **Arkitektur**: Next.js 16, Prisma 7, PostgreSQL med pgvector, multi-tenant med isolering
- **Dokumentation**: AGENTS.md (stabil maskinkunskap), AI.md (AI-arkitektur)

### Regler
- Följ AGENTS.md och AI.md som styrande dokument
- Använd Service Layer för all affärslogik (DRY-princip)
- Respektera multi-tenant-isolering (alla operationer måste filtreras på tenantId)
- Följ CRUD-paritet mellan UI och AI-verktyg
- Använd Vercel AI SDK för alla AI-operationer

### Tekniska begränsningar
- **Prestanda**: Kontextinjicering måste vara snabb (<100ms) för att inte påverka chattresponsivitet
- **Lagringsutrymme**: Kunskapsbasen får inte växa oändligt - behöver rensningsmekanismer
- **Kompatibilitet**: Måste fungera med befintlig Prisma-schema och databasstruktur
- **Säkerhet**: Ingen känslig data får läcka mellan tenants

## Antaganden

1. **Datakälla**: Primär datakälla är konversationshistoriken (Message-tabellen) och systemhändelser (AIMessage, Notification)
2. **Användarmönster**: Användare ställer återkommande frågor om samma typer av information (projektstatus, uppgifter, filer)
3. **Agentkapacitet**: AI-modeller (Claude) kan effektivt extrahera strukturerad information från naturligt språk
4. **Kontextnytta**: Strukturerad metadata som "vilka projekt finns", "vilka roller har användaren" är mer värdefull än rå konversationshistorik
5. **Bakgrundsprocess**: Agenten kan köras som en schemalagd uppgift eller event-driven process utan att påverka huvudapplikationens prestanda
6. **Integration**: Det befintliga AI-chattsystemet kan utökas med en kontexthämtning innan systemprompten skickas

## Risker och riskreducering

### Risk: Agenten missar viktig information eller lagrar irrelevant data
- **Varför risk**: LLM-extraktion kan vara opålitlig, eller reglerna kan vara för strikta/laxa
- **Tidig upptäckt**: Logga alla extraherade entiteter och låt utvecklare granska loggar
- **Riskreducering**: Implementera konfidensnivåer och endast lagra information med hög konfidens (>0.8). Ha en manuell granskningsmekanism i utvecklingsfasen.

### Risk: Kunskapsbasen växer för stort och påverkar prestanda
- **Varför risk**: Varje konversation kan generera ny metadata som ackumuleras över tid
- **Tidig upptäckt**: Övervaka storleken på kunskapstabellerna och svarstider för kontexthämtning
- **Riskreducering**: Implementera TTL (Time-to-Live) för poster och automatisk rensning av gamla/oviktiga poster. Använd prioritering baserat på användningsfrekvens.

### Risk: Multi-tenant-isolering bryts och data läcker mellan tenants
- **Varför risk**: Om tenantId inte korrekt hanteras i bakgrundsagenten
- **Tidig upptäckt**: Skriv tester som verifierar att en tenants agent inte kan se en annan tenants data
- **Riskreducering**: Använd exklusivt `tenantDb(tenantId)` för alla databasoperationer i agenten. Implementera strikta unit-tester för isolering.

### Risk: Kontexten blir för lång och överskrider token-gränser
- **Varför risk**: Om för mycket information injiceras som initial kontext
- **Tidig upptäckt**: Övervaka token-användning i AI-anrop och logga när gränser nästan nås
- **Riskreducering**: Implementera dynamisk kontext-trunkering baserat på relevans och token-budget. Prioritera aktuell information (senaste 30 dagarna).

### Risk: Agenten påverkar huvudapplikationens prestanda
- **Varför risk**: Om bakgrundsprocessen är för resurskrävande
- **Tidig upptäckt**: Övervaka CPU/minnesanvändning och svarstider i huvudapplikationen
- **Riskreducering**: Kör agenten som en separat process (worker) eller schemalagd uppgift med låg prioritet. Begränsa antalet parallella analyser.

## Lösningsbild (arkitektur i ord)

### Domän
Centrala begrepp är **Kunskapsentitet** (strukturerad information), **Kunskapsrelation** (kopplingar mellan entiteter), **TenantKunskapsbas** (isolering per tenant), och **Kontextprofil** (användarspecifik kontext).

### Flöden
1. **Extraktionsflöde**: När en konversation avslutas, triggar systemet kunskapsbas-agenten att analysera historiken
2. **Uppdateringsflöde**: Agenten extraherar entiteter/relationer och uppdaterar TenantKunskapsbas-tabellen
3. **Kontextflöde**: Vid ny konversationsstart hämtar AI-systemet relevant kontext från kunskapsbasen baserat på användare och projekt
4. **Rensningsflöde**: Schemalagd uppgift rensar gamla/oviktiga poster från kunskapsbasen

### Gränssnitt
- **Backend**: Ny Prisma-modell för kunskapsbasen, nya service-funktioner, och integration med befintlig AI-rutt
- **AI-agent**: Använder Claude via Vercel AI SDK för att analysera konversationer och extrahera strukturerad information
- **Frontend**: Ingen direkt påverkan - förbättringen är helt bakom scenen

### Kvalitetskrav
- **Säkerhet**: Fullständig multi-tenant-isolering, ingen datakorsning
- **Prestanda**: Kontexthämtning <100ms, bakgrundsanalys påverkar inte huvudapplikationen
- **Tillgänglighet**: Systemet degraderar优雅t om kunskapsbasen är otillgänglig (faller tillbaka på standardkontext)
- **Observability**: Fullständig loggning av extraherade entiteter, uppdateringar och kontextinjicering

## Fasplan

### Fas 1: Design och Datastruktur
**Syfte**: Definiera datamodellen för kunskapsbasen och integrationpunkterna med befintligt system
**Resultat**: Godkänd Prisma-schema för kunskapsbasen och tydlig integrationsspecifikation
**Nyckelbeslut**: 
1. Tabellstruktur för kunskapsentiteter (entityType, entityId, metadata, confidence, lastSeen)
2. Indexstrategi för snabba sökningar
3. Integrationpunkt i AI-chatt-rutten
**Berörda delar**: Prisma-schema, AI-chatt-rutt, dokumentation
**Verifiering**: Schema granskas av team, integrationsspecifikation testas med mock-data
**Commit-gräns**: `web/prisma/schema.prisma` uppdaterat med kunskapsbas-modeller, migration skapad

### Fas 2: Bakgrundsagent för Extraktion
**Syfte**: Implementera agenten som analyserar konversationer och extraherar strukturerad information
**Resultat**: Funktionell agent som kan bearbeta konversationshistorik och spara entiteter till databasen
**Nyckelbeslut**: 
1. Prompt-struktur för LLM-extraktion
2. Konfidensbedömning och filtrering
3. Hantering av olika entitetstyper (projekt, uppgifter, användare, etc.)
**Berörda delar**: AI-lib, bakgrundsjobb, Prisma-klient
**Verifiering**: Agenten kan korrekt extrahera kända entiteter från testkonversationer
**Commit-gräns**: `web/src/lib/ai/knowledge-extractor.ts` implementerad med tester

### Fas 3: Kontextintegration och Injicering
**Syfte**: Integrera kunskapsbasen med AI-chattsystemet för att leverera relevant kontext vid start
**Resultat**: AI-chattagenten får förbättrad initial kontext baserat på kunskapsbasen
**Nyckelbeslut**: 
1. Kontextformat och struktur
2. Relevansranking av entiteter
3. Token-begränsningshantering
**Berörda delar**: AI-chatt-rutt, systemprompt-generering
**Verifiering**: Kontext visas korrekt i AI-anrop, token-användning är inom gränser
**Commit-gräns**: `web/src/app/api/ai/chat/route.ts` uppdaterad med kontextinjicering

### Fas 4: Underhåll och Optimering
**Syfte**: Implementera rensningsmekanismer och prestandaoptimeringar
**Resultat**: Kunskapsbasen håller sig kompakt och responsiv över tid
**Nyckelbeslut**: 
1. TTL-strategi för poster
2. Användningsbaserad prioritering
3. Prestandamonitorering
**Berörda delar**: Schemalagda jobb, kunskapsbas-service
**Verifiering**: Storlek på kunskapsbasen stabiliseras, prestandamätningar visar god responsivitet
**Commit-gräns**: `web/src/jobs/cleanup-knowledge-base.ts` implementerad och schemalagd

### Fas 5: Testning och Validering
**Syfte**: Validera hela systemet i realistiska scenarier
**Resultat**: Systemet fungerar som förväntat i produktionsliknande miljö
**Nyckelbeslut**: 
1. Testscenarier för olika användarmönster
2. Prestandabenchmarks
3. Säkerhetsgranskning för multi-tenant-isolering
**Berörda delar**: Hela systemet, testmiljö
**Verifiering**: Alla testfall passerar, prestanda inom krav, säkerhet verifierad
**Commit-gräns**: Testrapport godkänd, system klart för produktion

## Utförandestrategi (multi-agent om relevant)

### Roller
- **Orchestrator**: Koordinerar hela implementeringen, granskar resultat
- **Backend-utvecklare**: Implementerar Prisma-modeller, services och API-integration
- **AI-specialist**: Designar extraktionsprompts och kontextstruktur
- **Tester**: Skapar testscenarier och validerar funktion

### Parallellisering
- Fas 1 och Fas 2 kan köras parallellt (schema-design och agent-design)
- Fas 3 beror på Fas 1 och Fas 2
- Fas 4 och Fas 5 kan köras parallellt med Fas 3

### Synkgrindar
- Fas 1 måste godkännas innan Fas 2 och Fas 3 påbörjas
- Fas 2 måste vara klar innan Fas 3 kan testas fullt ut
- Fas 5 kräver att Fas 1-4 är klara

## Test- och acceptansplan (i användarflöden)

1. **Som administratör** kan jag se att mina projekt och roller automatiskt identifieras som viktig kontext när jag startar en ny chatt, så att AI:n direkt kan hjälpa mig med rätt saker.
2. **Som montör** kan jag fråga om specifika uppgifter i mitt projekt utan att behöva nämna projektets namn, eftersom AI:n redan vet vilka projekt jag arbetar med.
3. **Som projektledare** kan jag se att när jag nämner nya filer eller dokument i konversationer, lagras denna information så att AI:n senare kan hänvisa till dem som tillgängliga resurser.
4. **Som användare** märker jag att AI:n sällan ställer generella motfrågor som "Vilket projekt menar du?", utan istället föreslår relevanta alternativ baserat på min roll och projekt.
5. **Som systemadministratör** kan jag verifiera att varje tenants kunskapsbas är fullständigt isolerad från andra tenants data.
6. **Som utvecklare** kan jag se loggar över vilken information som extraheras och lagras, vilket hjälper mig att finjustera systemet.

## Lansering/migrering (om relevant)

- **Feature flag**: Implementera som feature-flag för att kunna slå av/ på enkelt
- **Gradvis lansering**: Börja med interna användare, sedan beta-användare, sedan alla
- **Rollback**: Om problem uppstår kan feature-flag slås av omedelbart
- **Dataimport**: Inget historiskt data behöver migreras - systemet bygger kunskapsbasen organiskt från nya konversationer
- **Bakåtkompatibilitet**: Systemet är helt bakåtkompatibelt - om kunskapsbasen är tom faller det tillbaka på standardkontext

## Definition of Done (DoD)

Systemet är klart när: (1) Kunskapsbasen har en väldefinierad datamodell med multi-tenant-isolering, (2) Bakgrundsagenten kan extrahera och lagra strukturerad information från konversationer med hög precision, (3) AI-chattagenten får relevant kontext injicerad vid start som förbättrar dess förståelse för tillgängliga resurser, (4) Systemet har automatiserad rensning för att hålla prestanda stabilt över tid, (5) Alla testscenarier passerar och säkerheten är verifierad, och (6) Dokumentation finns uppdaterad i AGENTS.md och AI.md.