# Checklist: Kunskapsbas-Agent

## Fas 1: Design och Datastruktur
- [x] Prisma-schema för kunskapsbas definierat (`KnowledgeEntity`, `KnowledgeRelation`)
- [x] Multi-tenant-isolering säkerställd i schemat (tenantId-index, alla queries scopade)
- [x] Indexstrategi implementerad för snabba sökningar (sammansatta index på tenantId+entityType+entityId)
- [x] Migration skapad och testad (`20260223000000_add_knowledge_base` applicerad mot DB)
- [x] Integrationsspecifikation för AI-chatt-rutt dokumenterad (se PLAN.md)

## Fas 2: Bakgrundsagent för Extraktion
- [x] Kunskapsextraktions-agent implementerad (`src/lib/ai/knowledge-extractor.ts`)
- [x] LLM-prompt för entitetsextraktion optimerad (strukturerad JSON-extraktion med Claude)
- [x] Konfidensbedömning och filtrering fungerar (threshold 0.7)
- [x] Stöd för olika entitetstyper (projekt, uppgifter, användare, preferens, vanliga_frågor)
- [x] Embedding genereras per entitet efter upsert och lagras via pgvector (graceful degradation)
- [ ] Unit-tester för extraktionslogik skrivna och passerade (ej implementerat — Playwright-test täcker E2E)

## Fas 3: Kontextintegration och Injicering
- [x] Kontexthämtning från kunskapsbas implementerad
- [x] Relevansranking via vektorsökning (cosine similarity, threshold 0.5)
- [x] Token-begränsningshantering implementerad (max 20 unified results)
- [x] Integration med AI-chatt-rutt fullständig (unified search injiceras i knowledgeBlock)
- [x] Kontext visas korrekt i AI-anrop (verifierat via Playwright E2E-test 2026-02-23)
- [x] Unified semantic search (`src/lib/ai/unified-search.ts`) — KnowledgeEntity + MessageChunk + DocumentChunk parallellt
- [x] Pre-retrieval RAG-mönster: sökning sker automatiskt i route.ts, INTE som AI-verktyg
- [x] 500ms timeout med fallback till tidbaserad hämtning

## Fas 4: Underhåll och Optimering
- [x] TTL-mekanism för kunskapsentiteter implementerad (`cleanupOldKnowledge` raderar >90 dagar)
- [x] Användningsbaserad prioritering fungerar (similarity-ranking, lastSeen vid upsert)
- [x] Schemalagd rensningsjobb konfigurerad (1% sannolikhet per request i onFinish)
- [ ] Prestandamonitorering på plats (ej implementerat)
- [x] Kunskapsbas-storlek stabiliseras över tid (TTL-mekanism + vektorsökning filtrerar relevans)

## Fas 5: Testning och Validering
- [x] Alla användarflöden testade och fungerande (Playwright E2E godkänt 2026-02-23, unified search godkänt 2026-02-23)
- [ ] Multi-tenant-isolering verifierad med tester
- [ ] Prestandabenchmarks inom krav (<100ms kontexthämtning)
- [ ] Säkerhetsgranskning genomförd
- [ ] Feature flag implementerad för enkel aktivering/inaktivering

## Dokumentation
- [ ] AGENTS.md uppdaterad med ny kunskapsbas-funktionalitet
- [ ] AI.md uppdaterad med beskrivning av kontextinjicering
- [x] DEVLOG.md innehåller lärdomar från implementeringen (Prisma 7 + schema-fix + container env dokumenterat)
