# Forensisk rapport: Platsbild tolkas som finansiell data

## Krav (uppfyllda)

1. Ingen kodändring – endast analys med konkreta bevis.
2. Kedja för seed-fil `senaste-bild-plats.png` verifierad.
3. Idempotens/cache – kvarvarande gamla chunks/analys kontrollerat.
4. Källa till chat-svar (OCR vs FileAnalysis vs DocumentChunk) identifierad.
5. Rotorsak + minimal fix (patch i separat steg).

---

## 1. Fil på disk

- **Sökväg:** `web/prisma/seed-assets/senaste-bild-plats.png`
- **Storlek:** 2 622 699 byte
- **SHA256:** `5b0b1730b34272cc52a15fccc68cd2152653a74f07a24384d8d5b5fd6edcce4e`
- **Status:** Filen finns; seed använder den via `readSeedAsset("senaste-bild-plats.png")` (ingen fallback till 1×1 PNG).

---

## 2. Seed-flöde (referens)

- **File-id:** `seed-file-senaste-bild`
- **MinIO-nyckel:** `{S3_BUCKET}/personal/{adminUser.id}/seed-senaste-bild-plats.png`
- Seed gör: File upsert → `putObjectToMinIO` (överskriver objekt) → `FileAnalysis.deleteMany({ fileId: seedFileIds })` → för varje fil: `processPersonalFileOcr` → läser `ocrText` från DB → `runFileAnalysisSync(ocrText)` → `processFileEmbeddings`.

MinIO-objektet får alltså **nya** bytes vid varje seed (samma key, ny body). Hash/storlek för MinIO kan verifieras manuellt med mc/aws CLI om behov.

---

## 3. Rotorsak: OCR returnerar tomt → gammal data lämnas kvar

### Bevis i kod

**`web/src/lib/ai/ocr.ts` – `processPersonalFileOcr`:**

```ts
const { text, source } = await processFileContent(bucket, key, fileType, fileName);

if (!text.trim()) {
  logger.info("No text extracted for personal file", { fileId });
  return { success: true, chunkCount: 0 };  // ← INGEN uppdatering av File.ocrText
}

const db = tenantDb(tenantId);
await db.file.update({ where: { id: fileId }, data: { ocrText: text } });
// ...
if (textChunks.length > 0) {
  await db.documentChunk.deleteMany({ where: { fileId } });
  // ... skapa nya chunks
}
```

- När **OCR returnerar tom eller nästan tom text** (t.ex. platsfoto med lite/ingen läsbar text):
  1. **File.ocrText** uppdateras **aldrig** – tidigare värde (t.ex. finansiell text från en gammal fil med samma `fileId`) ligger kvar.
  2. **DocumentChunk** – `deleteMany` anropas **bara** när `textChunks.length > 0`, dvs. när vi ska skapa nya chunks. Vid tom OCR sker varken radering eller skapande → **gamla OCR-chunks för filen ligger kvar**.

**Seed (`web/prisma/seed.ts`):**

```ts
const ocrText = ocrResult.success
  ? (await prisma.file.findUnique({ where: { id: entry.id }, select: { ocrText: true } }))?.ocrText ?? ""
  : "";
await runFileAnalysisSync({ ..., ocrText, ... });
```

- Efter `processPersonalFileOcr` med tom OCR är `ocrResult.success === true` men DB har **inte** uppdaterats. Därför är `ocrText` som skickas till `runFileAnalysisSync` den **gamla** `File.ocrText` (finansiell text). Vision får rätt bild från MinIO, men kontexten innehåller gammal OCR-text → risk för felaktig/blandad analys.

### Vilken källa chatten använder

- **getFileContent** (personliga filer) returnerar **File.ocrText** och används när användaren frågar vad som “står” i filen.
- **Sökning** (embedding + plaintext) använder både **DocumentChunk** (content) och **File** (ocrText, label, aiAnalysis m.m.).

**Slutsats:** Om platsbilden fortfarande presenteras som finansiell data kommer det med hög sannolikhet från:

1. **File.ocrText** (huvudkandidat) – returneras av getFileContent och har aldrig rensats när ny OCR blev tom.
2. **Gamla DocumentChunk** med finansiellt innehåll – kvar eftersom vi inte raderar chunks när ny OCR är tom.

FileAnalysis rensas i seed (`deleteMany`) och fylls på igen av `runFileAnalysisSync`, men den får då **stale ocrText** som kontext, så även den kan bli felaktig om OCR var tom.

---

## 4. Idempotens / cache

- **FileAnalysis:** Seed rensar med `deleteMany({ fileId: { in: seedFileIds } })` → idempotens OK.
- **DocumentChunk:** Rensas bara när OCR ger icke-tom text och vi ska skapa nya chunks. Vid tom OCR sker ingen radering → **gamla chunks kan ligga kvar** (idempotensproblem).
- **File.ocrText:** Uppdateras bara när det finns ny text; vid tom OCR görs ingen uppdatering → **gammal ocrText kan ligga kvar** (samma idempotensproblem).

---

## 5. Sammanfattning rotorsak

- **Huvudorsak:** När OCR för den nya filen (platsbild) returnerar tom eller nästan tom text uppdateras varken **File.ocrText** eller **DocumentChunk**.
- **Konsekvens:** Tidigare data (t.ex. finansiell text) för samma `fileId` finns kvar i `File.ocrText` och i gamla OCR-chunks, och seed skickar dessutom den gamla `ocrText` till `runFileAnalysisSync`.
- **Chatten:** Får finansiell data via getFileContent (ocrText) och eventuellt via sökning (gamla DocumentChunk).

---

## 6. Rekommenderad minimal fix

**Plats:** `web/src/lib/ai/ocr.ts` – funktionen `processPersonalFileOcr`.

**Ändringar (logik, ingen ny funktionalitet):**

1. **Vid tom OCR:** Sätt alltid `File.ocrText` till tom sträng (eller null om schema tillåter) för denna `fileId`, så att gammal text inte lämnas kvar.
2. **Vid tom OCR:** Anropa ändå `documentChunk.deleteMany({ where: { fileId } })` för denna fil, så att gamla OCR-chunks tas bort även när vi inte skapar nya.

Det räcker med att göra detta i `processPersonalFileOcr` (och, för paritet, i projektfil-varianten `processFileOcr` om samma mönster förekommer där). Ingen ändring i seed behövs om OCR-logiken blir idempotent.

**Exakt steg:**

- Efter `if (!text.trim()) { ... return ... }` – **ta bort** early return.
- Istället: om `!text.trim()` – sätt `ocrText` till `""` (eller null), och kör `documentChunk.deleteMany({ where: { fileId } })`; returnera sedan `{ success: true, chunkCount: 0 }` utan att skapa chunks eller köra embedding/queue.
- Om `text.trim()` finns – behåll nuvarande flöde (uppdatera ocrText, deleteMany, skapa chunks, embedding, queue).

Patch föreslås i separat steg som begärts.
