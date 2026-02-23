# Beslut: Kunskapsbas-Agent

## Arkitekturval

### 1. Separat kunskapsbas vs utökad AGENTS.md
**Beslut**: Skapa en separat, dynamisk kunskapsbas snarare än att utöka AGENTS.md
**Motivering**: AGENTS.md är avsedd för stabil, sällan ändrad information om systemarkitekturen. Vår kunskapsbas behöver vara dynamisk och uppdateras kontinuerligt baserat på användningsmönster, vilket inte passar i en statisk fil.

### 2. Regelbaserad extraktion vs full LLM-analys
**Beslut**: Använd hybrid-approach med LLM för extraktion men regelbaserad filtrering
**Motivering**: Renvädring av LLM-output krävs för att säkerställa kvalitet och undvika irrelevant information. Vi använder LLM för att identifiera möjliga entiteter men har strikta regler för vad som får lagras.

### 3. Event-driven vs schemalagd uppdatering
**Beslut**: Använd event-driven uppdatering vid konversationsavslut
**Motivering**: Det är mest effektivt att analysera konversationen direkt när den avslutas, snarare än att köra schemalagda batch-jobb som kan missa aktuell information.

### 4. Tenant-isolerad kunskapsbas
**Beslut**: Varje tenant har sin egen isolerade kunskapsbas
**Motivering**: Säkerställer att ingen data läcker mellan olika kunder, vilket är kritiskt i en multi-tenant SaaS-plattform.

## Tekniska val

### 5. Prisma-modellstruktur
**Beslut**: Använd generisk `KnowledgeEntity`-modell med JSON-metadata
**Motivering**: Ger flexibilitet att lagra olika typer av entiteter (projekt, användare, filer) utan att behöva skapa separata tabeller för varje typ.

### 6. Kontextformat
**Beslut**: Använd strukturerat JSON-format för kontextinjicering
**Motivering**: JSON är enkelt att bearbeta i systemprompten och kan enkelt trunkeras baserat på token-begränsningar.

### 7. Prestandaoptimering
**Beslut**: Implementera TTL och användningsbaserad prioritering från början
**Motivering**: Förhindrar att kunskapsbasen växer oändligt och säkerställer att endast relevant information behålls.

## Integration

### 8. Integration med befintlig AI-rutt
**Beslut**: Utöka befintlig `/api/ai/chat/route.ts` med kontexthämtning
**Motivering**: Minimerar duplicering och säkerställer att alla chattkonversationer drar nytta av den förbättrade kontexten.

### 9. Feature flag
**Beslut**: Implementera som feature-flag från start
**Motivering**: Möjliggör gradvis lansering och enkel rollback om problem uppstår.