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
- [ ] Unit-tester för extraktionslogik skrivna och passerade (ej implementerat — Playwright-test täcker E2E)

## Fas 3: Kontextintegration och Injicering
- [x] Kontexthämtning från kunskapsbas implementerad (findMany i route.ts med tenantId+userId-filter)
- [x] Relevansranking av entiteter fungerar (sorterat på lastSeen, top 15)
- [x] Token-begränsningshantering implementerad (max 15 entiteter, kompakt format)
- [x] Integration med AI-chatt-rutt fullständig (buildSystemPrompt tar knowledgeContext-parameter)
- [ ] Kontext visas korrekt i AI-anrop (verifieras via Playwright-test)

## Fas 4: Underhåll och Optimering
- [x] TTL-mekanism för kunskapsentiteter implementerad (`cleanupOldKnowledge` raderar >90 dagar)
- [ ] Användningsbaserad prioritering fungerar (lastSeen uppdateras vid upsert — OK)
- [x] Schemalagd rensningsjobb konfigurerad (1% sannolikhet per request i onFinish)
- [ ] Prestandamonitorering på plats (ej implementerat)
- [ ] Kunskapsbas-storlek stabiliseras över tid (täcks av TTL-mekanismen)

## Fas 5: Testning och Validering
- [ ] Alla användarflöden testade och fungerande (Playwright-test pågår)
- [ ] Multi-tenant-isolering verifierad med tester
- [ ] Prestandabenchmarks inom krav (<100ms kontexthämtning)
- [ ] Säkerhetsgranskning genomförd
- [ ] Feature flag implementerad för enkel aktivering/inaktivering

## Dokumentation
- [ ] AGENTS.md uppdaterad med ny kunskapsbas-funktionalitet
- [ ] AI.md uppdaterad med beskrivning av kontextinjicering
- [x] DEVLOG.md innehåller lärdomar från implementeringen (Prisma 7 + schema-fix dokumenterat)
