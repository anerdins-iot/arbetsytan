# Fas 4 — Filhantering

> Läs `plan/README.md` först för arbetsflöde och regler.
> Läs relevanta `/workspace/docs/*.md` innan implementation.

### Block 4.1: MinIO-integration och uppladdning
**Input:** Fas 1 klar (Docker med MinIO), Fas 2 klar (auth)
**Output:** Fungerande filuppladdning till MinIO

- [x] Konfigurera MinIO-klient i `web/src/lib/minio.ts`
- [x] Skapa en bucket per tenant (namn: `tenant-{tenantId}`) med prefix per projekt
- [x] Generera presigned URL:er för uppladdning
- [x] Generera presigned URL:er för nedladdning/visning
- [x] Bygga uppladdningskomponent med drag-and-drop
- [x] Stöd för flera filer samtidigt
- [x] Visa uppladdningsförlopp
- [x] Server Action `uploadFile` — validera typ/storlek, spara metadata i DB, ladda upp till MinIO
- [x] Stöd för filtyper: PDF, bilder (JPG/PNG/WEBP), dokument (DOCX, XLSX)
- [x] Maxstorlek per fil och per tenant

**Verifiering:** Filer laddas upp till MinIO, metadata sparas i DB, presigned URLs fungerar, `tenantDb(tenantId)` på alla queries, `requireProject()` för projektåtkomst, `npm run build` OK

### Block 4.2: Fillista och förhandsgranskning
**Input:** Block 4.1 klart
**Output:** Fillista med förhandsgranskning

- [x] Bygga filfliken i projektvyn med rutnätsvisning
- [x] Miniatyrbilder för bilder, ikon för dokument
- [x] Server Action `getFiles` filtrerat på projectId + tenantId
- [x] Klick öppnar förhandsgranskning — PDF i inbyggd viewer, bilder i lightbox
- [x] Nedladdningslänk via presigned URL
- [x] Server Action `deleteFile` — radera från MinIO och DB

**Verifiering:** Filer visas, förhandsgranskning fungerar, radering rensar MinIO + DB, `tenantDb(tenantId)` på alla queries, `requireProject()` för projektåtkomst, `npm run build` OK

### Block 4.3: OCR-pipeline
**Input:** Block 4.1 klart, Mistral API-nyckel
**Output:** Automatisk OCR vid filuppladdning

- [x] Skapa `web/src/lib/ai/ocr.ts` med Mistral OCR-integration
- [x] Vid uppladdning av PDF/bild: trigga OCR automatiskt
- [x] Spara extraherad text i `File.ocrText`
- [x] Chunka texten (500–1000 tokens per chunk)
- [x] Spara chunks i DocumentChunk med metadata (sidnummer, position)
- [x] Visa OCR-text kopplat till filen i UI
- [x] **FIX:** Koppla embeddings till OCR — anropa `queueEmbeddingProcessing` efter chunkning

**Verifiering:** OCR körs vid upload, text sparas, chunks skapas, text visas i UI, `npm run build` OK

### Block 4.4: Embeddings-pipeline
**Input:** Block 4.3 klart, OpenAI API-nyckel
**Output:** Semantisk sökning i dokument

- [x] Skapa `web/src/lib/ai/embeddings.ts` med OpenAI embeddings-integration
- [x] Efter chunkning: generera embedding per chunk via OpenAI API
- [x] Spara vektor i DocumentChunk.embedding (raw SQL)
- [x] Skapa SQL-funktion för cosine similarity-sökning
- [x] Skapa `searchDocuments`-funktion filtrerat på projectId + tenantId
- [x] Bakgrundsbearbetning — använd queue eller async job (ej blockera upload)
- [x] Utöka `globalSearch` (från Block 3.9) med sökning i filnamn och dokumentinnehåll via embeddings

**Verifiering:** Embeddings genereras, vektorsökning returnerar relevanta resultat, `tenantDb(tenantId)` på alla queries, `requireProject()` för projektåtkomst, `npm run build` OK

### Block 4.5: Playwright-test för Fas 4
**Input:** Block 4.1 och 4.2 klara (4.3/4.4 hoppade över — ingen sökning i dokument)
**Output:** Screenshots och verifiering av filhantering

- [x] Starta dev-server med PID-fil
- [x] Logga in och navigera till ett projekt
- [x] Öppna Filer-fliken, ta screenshot
- [x] Testa filuppladdning (drag-and-drop eller filväljare)
- [x] Verifiera att filen visas i listan med miniatyrbild/ikon
- [x] Klicka på en bild för att öppna lightbox, ta screenshot
- [x] Klicka på en PDF för förhandsgranskning, ta screenshot (om PDF finns)
- [x] Spara alla screenshots i `screenshots/fas-04/`
- [x] Stoppa dev-server (PID från fil, aldrig pkill)

**Verifiering:** Alla screenshots sparade, uppladdning och visning fungerar, inga konsolfel

---
