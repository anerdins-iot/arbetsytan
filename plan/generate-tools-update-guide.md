# Guide: Uppdatera AI-verktyg för FileCreatedCard

## Sammanfattning

När AI-verktyg anropar `generatePdfDocument`, `generateExcelDocument`, eller `generateWordDocument` returnerar de nu automatiskt ett objekt med `__fileCreated: true` som gör att chatten visar FileCreatedCard istället för bara ett textmeddelande.

## Vad returneras nu?

### Tidigare (före denna ändring)
```typescript
{
  fileId: string;
  name: string;
  message: string;
}
```

### Nu (efter denna ändring)
```typescript
{
  __fileCreated: true;
  fileId: string;
  fileName: string;
  fileType: "pdf" | "excel" | "word";
  fileSize: number;
  downloadUrl: string;
  previewUrl?: string; // Endast för PDF
  message: string;
}
```

## Automatisk integration

### Inga ändringar behövs i befintliga AI-verktyg!

Alla verktyg som anropar `generatePdfDocument`, `generateExcelDocument`, eller `generateWordDocument` från `shared-tools.ts` får automatiskt rätt returformat.

**Exempel - befintligt verktyg fortsätter fungera:**

```typescript
// I personal-tools.ts eller project-tools.ts
const result = await generatePdfDocument({
  db,
  tenantId,
  projectId,
  userId,
  fileName: "rapport.pdf",
  title: "Projektrapport",
  content: rapportText,
  template: "standard",
});

// result innehåller nu automatiskt __fileCreated + downloadUrl
return result; // Chatten visar FileCreatedCard
```

## För nya verktyg

Om du skapar ett nytt verktyg som genererar filer:

1. **Anropa generate-funktionen direkt:**
```typescript
return await generatePdfDocument({ ... });
```

2. **ELLER manuellt konstruera returvärdet:**
```typescript
const saved = await saveGeneratedDocumentToProject({ ... });
if ("error" in saved) return { error: saved.error };

const downloadUrl = await createPresignedDownloadUrl({
  bucket: saved.bucket,
  key: saved.key,
  expiresInSeconds: 60 * 30,
});

return {
  __fileCreated: true,
  fileId: saved.fileId,
  fileName: saved.name,
  fileType: "pdf", // eller "excel" / "word"
  fileSize: saved.size,
  downloadUrl,
  previewUrl: downloadUrl, // Endast för PDF
  message: "Fil skapad och redo att laddas ner",
};
```

## För att INTE visa FileCreatedCard

Om du av någon anledning vill att en fil skapas men INTE vill visa FileCreatedCard (t.ex. intern export), returnera bara:

```typescript
return {
  fileId: saved.fileId,
  name: saved.name,
  message: "Fil sparad i projektets fillista",
};
```

Utan `__fileCreated: true` visar chatten bara ett vanligt textmeddelande från AI:n.

## Chatten - hur den hanterar __fileCreated

I `personal-ai-chat-tool-card.tsx` (tool-rendering för personlig AI-chatt):

```typescript
if (result?.__fileCreated) {
  const fileData = result as unknown as FileCreatedData & {
    __fileCreated: true;
  };

  return (
    <FileCreatedCard
      key={i}
      data={{
        fileId: fileData.fileId,
        fileName: fileData.fileName,
        fileType: fileData.fileType,
        fileSize: fileData.fileSize,
        downloadUrl: fileData.downloadUrl,
        previewUrl: fileData.previewUrl,
        message: fileData.message,
      }}
    />
  );
}
```

## Exempel - användningsfall

### 1. Generera projektrapport (PDF)
```typescript
// Användaren: "Skapa projektrapport för vecka 7"
const result = await generatePdfDocument({
  db,
  tenantId,
  projectId,
  userId,
  fileName: "projektrapport-vecka-7.pdf",
  title: "Projektrapport - Vecka 7",
  content: `
    # Översikt
    12 uppgifter slutförda, 3 pågående.

    # Tidsrapportering
    Totalt 48 timmar loggade.
  `,
  template: "standard",
});

return result;
// Chatten visar FileCreatedCard med "Förhandsgranska" och "Ladda ner"
```

### 2. Generera materiallista (Excel)
```typescript
// Användaren: "Skapa materiallista för projektet"
const result = await generateExcelDocument({
  db,
  tenantId,
  projectId,
  userId,
  fileName: "materiallista.xlsx",
  title: "Materiallista",
  sheets: [{
    name: "Material",
    headers: ["Artikel", "Antal", "Pris", "Summa"],
    rows: [
      ["Skruv M6", 100, 0.5, 50],
      ["Bräda 2x4", 20, 45, 900],
    ],
  }],
  template: "materiallista",
});

return result;
// Chatten visar FileCreatedCard med "Ladda ner"
```

### 3. Generera projektdokumentation (Word)
```typescript
// Användaren: "Skapa projektstatus-dokument"
const result = await generateWordDocument({
  db,
  tenantId,
  projectId,
  userId,
  fileName: "projektstatus.docx",
  title: "Projektstatus",
  content: `
    Detta projekt är igång sedan 2025-01-15.

    Nuvarande status: Pågående
    Uppgifter kvar: 7
    Deadline: 2025-03-01
  `,
  template: "standard",
});

return result;
// Chatten visar FileCreatedCard med "Ladda ner"
```

## Felsökning

### Problem: Filen skapas men FileCreatedCard visas inte

**Orsak:** Verktyget returnerar inte `__fileCreated: true`

**Fix:** Se till att verktyget returnerar resultatet från `generatePdfDocument` etc. direkt, eller konstruera returvärdet manuellt enligt guiden ovan.

### Problem: "Download URL expired"

**Orsak:** Presigned URLs expirerar efter 30 minuter

**Fix:** Detta är by design. Användaren måste ladda ner inom 30 min. Om de väntar längre kan de be AI:n skapa filen igen.

### Problem: PDF-förhandsvisning visar inte innehåll

**Orsak:** Browser kan inte visa PDF i iframe (CORS, Content-Security-Policy)

**Fix:** Se till att MinIO/S3 är konfigurerad med rätt CORS-headers. Alternativt öppnas PDFen i ny flik istället för modal.

## Relaterade filer

- `/workspace/web/src/components/ai/file-created-card.tsx` - Kortkomponenten
- `/workspace/web/src/lib/ai/tools/shared-tools.ts` - Generate-funktioner
- `/workspace/web/src/lib/ai/save-generated-document.ts` - Sparar fil till MinIO + DB
- `/workspace/web/src/lib/minio.ts` - createPresignedDownloadUrl
- `/workspace/plan/file-created-card-implementation.md` - Fullständig implementationsdokumentation
