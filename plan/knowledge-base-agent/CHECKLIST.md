# Checklist: Kunskapsbas-Agent

## Fas 1: Design och Datastruktur
- [ ] Prisma-schema för kunskapsbas definierat (`KnowledgeEntity`, `KnowledgeRelation`)
- [ ] Multi-tenant-isolering säkerställd i schemat
- [ ] Indexstrategi implementerad för snabba sökningar
- [ ] Migration skapad och testad
- [ ] Integrationsspecifikation för AI-chatt-rutt dokumenterad

## Fas 2: Bakgrundsagent för Extraktion
- [ ] Kunskapsextraktions-agent implementerad
- [ ] LLM-prompt för entitetsextraktion optimerad
- [ ] Konfidensbedömning och filtrering fungerar
- [ ] Stöd för olika entitetstyper (projekt, uppgifter, användare, etc.)
- [ ] Unit-tester för extraktionslogik skrivna och passerade

## Fas 3: Kontextintegration och Injicering
- [ ] Kontexthämtning från kunskapsbas implementerad
- [ ] Relevansranking av entiteter fungerar
- [ ] Token-begränsningshantering implementerad
- [ ] Integration med AI-chatt-rutt fullständig
- [ ] Kontext visas korrekt i AI-anrop (verifierat med loggar)

## Fas 4: Underhåll och Optimering
- [ ] TTL-mekanism för kunskapsentiteter implementerad
- [ ] Användningsbaserad prioritering fungerar
- [ ] Schemalagd rensningsjobb konfigurerad
- [ ] Prestandamonitorering på plats
- [ ] Kunskapsbas-storlek stabiliseras över tid

## Fas 5: Testning och Validering
- [ ] Alla användarflöden testade och fungerande
- [ ] Multi-tenant-isolering verifierad med tester
- [ ] Prestandabenchmarks inom krav (<100ms kontexthämtning)
- [ ] Säkerhetsgranskning genomförd
- [ ] Feature flag implementerad för enkel aktivering/inaktivering

## Dokumentation
- [ ] AGENTS.md uppdaterad med ny kunskapsbas-funktionalitet
- [ ] AI.md uppdaterad med beskrivning av kontextinjicering
- [ ] DEVLOG.md innehåller lärdomar från implementeringen