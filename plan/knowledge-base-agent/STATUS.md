# Status: Kunskapsbas-Agent

## Nuvarande läge
**IMPLEMENTERAT OCH VERIFIERAT** — Fas 1–5 klara (2026-02-23)

Unified semantic search verifierat via Playwright E2E-test:
- AI:n mindes "Bergström Bygg" från tidigare konversation i ny konversation
- Vektorsökning fungerar korrekt across KnowledgeEntity + MessageChunk + DocumentChunk

## Vad som är implementerat
1. KnowledgeEntity schema + migration med pgvector embedding-kolumn
2. knowledge-extractor.ts: extraktion + embedding per entitet (graceful degradation)
3. unified-search.ts: searchAllSources — EN embedding, tre källor parallellt, timeout 500ms
4. route.ts: pre-retrieval RAG, sökning sker automatiskt på varje meddelande

## Ytterligare features implementerade (2026-02-23)

- **Silent image upload** — Bilder i chatten sparas till MinIO utan att visas som filer. AI analyserar via vision, ställer följdfråga. Kontexten extraheras via kunskapsextraktorn och indexeras i KnowledgeEntity.
- **RAG debug UTF-8-fix** — Base64-decode i frontend använde `atob()` (Latin-1). Fixat med `TextDecoder` för korrekt multibyte (åäö).
- **FolderPlus-knapp** — På skickade bilder i chatten: knapp för att öppna OcrReviewDialog och spara till projekt.
- **file-info API** — Nytt GET-endpoint `/api/ai/upload/file-info` för filmetadata + presigned URL.

## Kvarstår (lägre prioritet)
- Multi-tenant-isolering verifiering
- Prestandabenchmarks
- Säkerhetsgranskning
- Feature flag

## Ansvarig
Orchestrator-agent koordinerar implementationen.