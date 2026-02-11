# Fas 4 — Filhantering

> Läs `plan/README.md` först för arbetsflöde och regler.
> Läs relevanta `/docs/*.md` innan implementation.

### Block 4.1: MinIO-integration och uppladdning
**Input:** Fas 1 klar (Docker med MinIO), Fas 2 klar (auth)
**Output:** Fungerande filuppladdning till MinIO

- [ ] Konfigurera MinIO-klient i `web/src/lib/minio.ts`
- [ ] Skapa en bucket per tenant (namn: `tenant-{tenantId}`) med prefix per projekt
- [ ] Generera presigned URL:er för uppladdning
- [ ] Generera presigned URL:er för nedladdning/visning
- [ ] Bygga uppladdningskomponent med drag-and-drop
- [ ] Stöd för flera filer samtidigt
- [ ] Visa uppladdningsförlopp
- [ ] Server Action `uploadFile` — validera typ/storlek, spara metadata i DB, ladda upp till MinIO
- [ ] Stöd för filtyper: PDF, bilder (JPG/PNG/WEBP), dokument (DOCX, XLSX)
- [ ] Maxstorlek per fil och per tenant

**Verifiering:** Filer laddas upp till MinIO, metadata sparas i DB, presigned URLs fungerar, `tenantDb(tenantId)` på alla queries, `requireProject()` för projektåtkomst, `npm run build` OK

### Block 4.2: Fillista och förhandsgranskning
**Input:** Block 4.1 klart
**Output:** Fillista med förhandsgranskning

- [ ] Bygga filfliken i projektvyn med rutnätsvisning
- [ ] Miniatyrbilder för bilder, ikon för dokument
- [ ] Server Action `getFiles` filtrerat på projectId + tenantId
- [ ] Klick öppnar förhandsgranskning — PDF i inbyggd viewer, bilder i lightbox
- [ ] Nedladdningslänk via presigned URL
- [ ] Server Action `deleteFile` — radera från MinIO och DB

**Verifiering:** Filer visas, förhandsgranskning fungerar, radering rensar MinIO + DB, `tenantDb(tenantId)` på alla queries, `requireProject()` för projektåtkomst, `npm run build` OK

### Block 4.3: OCR-pipeline
**Input:** Block 4.1 klart, Mistral API-nyckel
**Output:** Automatisk OCR vid filuppladdning

- [ ] Skapa `web/src/lib/ai/ocr.ts` med Mistral OCR-integration
- [ ] Vid uppladdning av PDF/bild: trigga OCR automatiskt
- [ ] Spara extraherad text i `File.ocrText`
- [ ] Chunka texten (500–1000 tokens per chunk)
- [ ] Spara chunks i DocumentChunk med metadata (sidnummer, position)
- [ ] Visa OCR-text kopplat till filen i UI

**Verifiering:** OCR körs vid upload, text sparas, chunks skapas, text visas i UI, `npm run build` OK

### Block 4.4: Embeddings-pipeline
**Input:** Block 4.3 klart, OpenAI API-nyckel
**Output:** Semantisk sökning i dokument

- [ ] Skapa `web/src/lib/ai/embeddings.ts` med OpenAI embeddings-integration
- [ ] Efter chunkning: generera embedding per chunk via OpenAI API
- [ ] Spara vektor i DocumentChunk.embedding (raw SQL)
- [ ] Skapa SQL-funktion för cosine similarity-sökning
- [ ] Skapa `searchDocuments`-funktion filtrerat på projectId + tenantId
- [ ] Bakgrundsbearbetning — använd queue eller async job (ej blockera upload)
- [ ] Utöka `globalSearch` (från Block 3.9) med sökning i filnamn och dokumentinnehåll via embeddings

**Verifiering:** Embeddings genereras, vektorsökning returnerar relevanta resultat, `tenantDb(tenantId)` på alla queries, `requireProject()` för projektåtkomst, `npm run build` OK

---
