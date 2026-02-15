# FileCreatedCard Implementation - Dokumentation

## Översikt

Implementerade ett UI-system för att visa skapade filer (PDF, Excel, Word) i AI-chatten med förhandsvisning och nedladdning direkt i gränssnittet.

## Implementerade komponenter

### 1. FileCreatedCard (`web/src/components/ai/file-created-card.tsx`)

**Syfte:** Visar ett snyggt kort i chatten när AI:n har skapat en fil.

**Features:**
- Visar filnamn, filtyp (badge), och filstorlek
- Knappar för "Förhandsgranska" (endast PDF) och "Ladda ner"
- Status-feedback: pending → downloading/downloaded → error
- PDF-förhandsvisning i modal (Dialog)
- Auto-download för Excel/Word vid förhandsvisning

**Props:**
```typescript
type FileCreatedData = {
  fileId: string;
  fileName: string;
  fileType: "pdf" | "excel" | "word";
  fileSize?: number;
  downloadUrl?: string;
  previewUrl?: string;
  message?: string;
};
```

**Ikoner per filtyp:**
- PDF: FileText (röd)
- Excel: FileSpreadsheet (grön)
- Word: FileIcon (blå)

### 2. Personal AI Chat Integration

**Fil:** `web/src/components/ai/personal-ai-chat.tsx`

**Ändringar:**
1. Import av FileCreatedCard
2. Ny hantering av `__fileCreated` flagga i tool outputs (rad ~780)
3. Renderar FileCreatedCard när `result.__fileCreated === true`

**Flöde:**
```
AI-verktyg returnerar __fileCreated
↓
personal-ai-chat detekterar flaggan
↓
FileCreatedCard renderas i chatten
↓
Användaren klickar "Förhandsgranska" eller "Ladda ner"
```

### 3. Backend-ändringar

#### `web/src/lib/ai/save-generated-document.ts`

**Ändring:** Return-värde utökat med `bucket`, `key`, och `size`:
```typescript
Promise<{ fileId: string; name: string; bucket: string; key: string; size: number } | { error: string }>
```

**Motivering:** Möjliggör skapande av presigned download URLs direkt i generate-funktionerna.

#### `web/src/lib/ai/tools/shared-tools.ts`

**Ändringar i generate-funktioner:**

**generateExcelDocument:**
```typescript
return {
  __fileCreated: true as const,
  fileId: saved.fileId,
  fileName: saved.name,
  fileType: "excel" as const,
  fileSize: saved.size,
  downloadUrl,
  message: "Excel-fil skapad och redo att laddas ner",
};
```

**generatePdfDocument:**
```typescript
return {
  __fileCreated: true as const,
  fileId: saved.fileId,
  fileName: saved.name,
  fileType: "pdf" as const,
  fileSize: saved.size,
  downloadUrl,
  previewUrl: downloadUrl, // PDFs can be previewed directly
  message: "PDF skapad och redo att laddas ner",
};
```

**generateWordDocument:**
```typescript
return {
  __fileCreated: true as const,
  fileId: saved.fileId,
  fileName: saved.name,
  fileType: "word" as const,
  fileSize: saved.size,
  downloadUrl,
  message: "Word-dokument skapat och redo att laddas ner",
};
```

**Presigned URLs:**
- Skapas med `createPresignedDownloadUrl` (30 min expiry)
- PDF får både `downloadUrl` och `previewUrl` (samma URL)
- Excel/Word får endast `downloadUrl`

#### `web/src/lib/minio.ts`

**Ny funktion:** `getObjectFromMinio`
```typescript
export async function getObjectFromMinio(params: {
  bucket: string;
  key: string;
}): Promise<Buffer>
```

**Motivering:** Behövdes för `/api/files/preview` route (redan existerande kod som saknade denna funktion).

### 4. Bugfixar

#### `web/src/actions/personal.ts`

**Fel:** Prisma-query med både `select` och `include` (rad 407-425)

**Fix:** Tog bort `select` och behöll endast `include` för relations:
```typescript
const file = await db.file.findFirst({
  where: { id: fileId, projectId },
  include: {
    analyses: { select: { content: true, prompt: true, model: true, type: true } },
    chunks: { select: { content: true, metadata: true, page: true } },
  },
});
```

**Borttaget:** `embedding: true` från chunks-select (kolumnen finns inte i schemat).

## Användning

### För AI-verktyg

Befintliga verktyg (`generatePdfDocument`, `generateExcelDocument`, `generateWordDocument`) returnerar nu automatiskt rätt format för FileCreatedCard.

**Exempel:**
```typescript
const result = await generatePdfDocument({
  db,
  tenantId,
  projectId,
  userId,
  fileName: "rapport.pdf",
  title: "Projektrapport",
  content: "...",
});

// result innehåller nu:
// { __fileCreated: true, fileId, fileName, fileType: "pdf", downloadUrl, previewUrl, ... }
```

### För användaren

1. Användaren ber AI:n skapa en fil: *"Skapa en Excel-fil med materiallista"*
2. AI anropar `generateExcelDocument`
3. FileCreatedCard visas i chatten med filnamn och storlek
4. Användaren klickar "Ladda ner" → fil öppnas/laddas ner
5. För PDF: Användaren klickar "Förhandsgranska" → modal med PDF-viewer

## Design-beslut

### Varför Dialog för preview?

- Konsistent med befintliga modaler (EmailPreviewCard, OcrReviewDialog, FilePreviewModal)
- Centrerad, fokuserad vy för dokument
- Sheet är för sidopaneler som ska visa kontext bredvid chatten

### Varför presigned URLs?

- Säker filåtkomst (expiry efter 30 min)
- Ingen server-side streaming behövs
- Browser kan hämta direkt från MinIO (S3)

### Varför __fileCreated flagga?

- Konsistent med andra special-outputs (`__emailPreview`, `__searchResults`, `__deleteConfirmation`)
- Tydlig signal till chatten att visa specialkomponent
- Type-safe med TypeScript

## Nästa steg (ej implementerade)

### Förhandsvisning innan generering (separat feature)

Enligt `/workspace/plan/file-generation-preview-analysis.md`:

1. Nytt verktyg: `prepareProjectReport` / `prepareExcelDocument` som returnerar `__fileGenerationPreview`
2. Ny komponent: `FileGenerationPreviewDialog` för redigering innan export
3. Användaren ser preview → redigerar → klickar "Generera fil" → befintlig export körs

Detta är en SEPARAT feature från FileCreatedCard och kräver ytterligare planering.

## Testning

**Manuell test:**
1. Starta server: `npm run dev`
2. Öppna personal AI-chat
3. Be AI:n: "Skapa en PDF med titel 'Test' och innehåll 'Hello World'"
4. Verifiera att FileCreatedCard visas
5. Klicka "Förhandsgranska" → modal med PDF
6. Klicka "Ladda ner" → filen laddas ner

**Playwright-test (MCP):**
```typescript
// Test file creation card
await browser_navigate({ url: "http://localhost:3000" });
await browser_click({ ref: "ai-chat-button" });
await browser_type({ ref: "chat-input", text: "Skapa en PDF med titel Test" });
await browser_click({ ref: "send-button" });
await browser_wait_for({ text: "Fil skapad" });
await browser_snapshot(); // Verify card is visible
```

## Filer ändrade

1. `/workspace/web/src/components/ai/file-created-card.tsx` (NY)
2. `/workspace/web/src/components/ai/personal-ai-chat.tsx` (ÄNDRAD)
3. `/workspace/web/src/lib/ai/save-generated-document.ts` (ÄNDRAD)
4. `/workspace/web/src/lib/ai/tools/shared-tools.ts` (ÄNDRAD)
5. `/workspace/web/src/lib/minio.ts` (ÄNDRAD - ny funktion)
6. `/workspace/web/src/actions/personal.ts` (BUGFIX)

## Slutsats

FileCreatedCard är nu integrerad och redo för användning. Alla generate-verktyg returnerar automatiskt rätt format för att visa det snygga kortet i chatten. Användaren får direkt feedback med nedladdningslänk och förhandsvisning (för PDF).
