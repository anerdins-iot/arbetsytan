# Analys: Preview/Modal-system för filgenerering

**Syfte:** Användaren ska kunna ge AI en instruktion (t.ex. "Skapa rapport över rumsnummer på nedervåningen"), se en **preview** innan filen skapas, eventuellt redigera, sedan godkänna och få filen genererad och nedladdad.

---

## 1. Modal vs Sheet vs Drawer

### Befintligt användning i projektet

| Komponent | Typ | Användning |
|-----------|-----|------------|
| **Dialog** | Centrerad overlay | FileDetailDialog, NoteModal, OcrReviewDialog, FilePreviewModal, EmailPreviewCard (full preview), EditProjectDialog, FilePicker, CreateAutomationDialog |
| **Sheet** | Sidopanel (höger/vänster) | Personal AI-chat (hela chattfönstret), mobilmeny dashboard, FileAnalysisSheet |

**Mönster:** Dialog används för fokuserad, engångsåtgärd (preview, redigera, bekräfta). Sheet används när kontext ska synas bredvid (chat, steg-för-steg-analys).

### Rekommendation: **Dialog**

- Dokumentpreview är en **fokuserad åtgärd**: användaren tittar på ett dokument, redigerar om nödvändigt, klickar "Generera fil" eller "Ladda ner".
- Sheet passar när användaren ska kunna se chatten samtidigt; för "preview → godkänn → generera" räcker det med en centrerad modal som stängs efteråt.
- **Drawer** finns inte som egen shadcn-komponent i projektet; i Radix/shadcn-sammanhang är Drawer i praktiken Sheet med `side="left"|"right"`. Ingen ny komponent behövs.

**Slutsats:** Använd **Dialog** (befintlig `@/components/ui/dialog`) för preview-modalen, i linje med FilePreviewModal, OcrReviewDialog och EmailPreviewCard.

---

## 2. Preview-rendering per format

### PDF

- **Idag:** Genereras på servern med `@react-pdf/renderer` → `renderToBuffer()` → upload till MinIO → presigned URL. Ingen preview före generering.
- **Preview utan att skapa fil:**
  - **Alternativ A:** Bygg en "rapportvy" som **HTML/Markdown** som speglar samma innehåll som PDF:en. Visa i Dialog med scroll. Vid "Generera" anropa befintlig export-logik som bygger den riktiga PDF:en. Enklast att implementera och redigera (contentEditable eller textarea per sektion).
  - **Alternativ B:** Generera PDF i minnet på servern, returnera som base64 eller blob URL, visa i `<iframe src={dataUrl}>` eller med **pdf.js** (Mozilla) för bättre kontroll. Kräver att vi exponerar en endpoint som returnerar PDF-buffer utan att spara till MinIO. Mindre lämpligt för redigering (PDF är inte enkelt att redigera i browser).
- **Rekommendation:** Alternativ A – preview som **strukturerad text/HTML** (sections: Översikt, Uppgifter, Tidsrapportering, etc.). Redigering blir naturlig (textarea eller rich text). Samma data som idag skickas till `buildProjectSummaryPdf` kan användas för att bygga preview-vyn.

### Excel

- **Idag:** ExcelJS på servern → buffer → MinIO → presigned URL. Ingen preview.
- **Preview:** Generera **endast datan** (array of rows) på servern eller i verktyget, returnera till klienten. Visa i en **tabell** (befintlig `Table` från shadcn) i Dialog. Ingen binär Excel-fil behövs för preview.
- **Redigering:** Tabell med redigerbara celler (controlled inputs i varje cell, eller en enkel datagrid). Vid "Generera" skicka redigerad data till en action som bygger Excel med ExcelJS och returnerar downloadUrl.

### Word

- Projektet genererar idag **inte** Word-filer. Om Word läggs till senare:
  - Preview: visa innehåll som **HTML** eller **Markdown** (rik text).
  - Generering: t.ex. `docx`-biblioteket på servern.
  - Redigering: contentEditable-div eller textarea för ren text.

---

## 3. Redigeringsmöjligheter

| Format | Preview-visning | Redigering |
|--------|------------------|------------|
| **PDF (rapport)** | Sektioner som text/HTML (Översikt, Uppgifter, Tidsrapportering, Medlemmar) | Textarea per sektion eller en redigerbar "rapporttext" som AI har genererat. Vid generering: bygg PDF från uppdaterad text. |
| **Excel** | Tabell (Table) med rader/kolumner | Redigerbara celler (input per cell). Spara som matris; vid "Generera" skicka till export-action. |
| **Word** (framtida) | Rik text (HTML/Markdown) | contentEditable eller textarea. |

**Befintliga mönster i projektet:**

- **OcrReviewDialog:** Redigering av OCR-text i `Textarea` + `OcrEditor`, sedan "Spara" som anropar API. Bra mönster för text.
- **EmailPreviewCard:** Preview (ämne, mottagare, body) + "Skicka" / "Avbryt". Body kan visas i expanderad Dialog. Samma idé: visa → bekräfta → utför.

För filgenerering: **Preview-kort i chatten** (som EmailPreviewCard) som öppnar en **Dialog** med full preview och valfritt redigeringsläge, plus knappar "Redigera", "Generera fil", "Avbryt".

---

## 4. Befintlig infrastruktur

### Modaler / Sheets

- **FilePreviewModal** (`@/components/ai/file-preview-modal.tsx`): Visar befintlig fil (bild, PDF via iframe eller OCR-text, övriga "no preview" + nedladdning). Hämtar data via `getFilePreviewData`, visar `downloadUrl`. **Dialog**, max-h-90vh, max-w-2xl.
- **OcrReviewDialog**: Granska/redigera OCR + beskrivning → "Spara" → finalize-file. **Dialog**, max-h-85vh, max-w-lg.
- **FileDetailDialog**: Filinfo, OCR, beskrivning, nedladdning. **Dialog**, max-w-5xl, p-0.
- **EmailPreviewCard**: Kort i chatten med "Visa hela" som öppnar **Dialog** med full e-postpreview och "Skicka".

### Nedladdning

- **Export:** `actions/export.ts` – exportProjectSummaryPdf, exportTimeReportExcel, exportTaskListExcel. Alla: bygg buffer → `uploadExportAndGetUrl` → `createPresignedDownloadUrl` (30 min). Returnerar `{ success: true, downloadUrl: string }`.
- **AI-verktyg:** `personal-tools.ts` – exportTimeReport, exportTaskList, generateProjectReport anropar dessa actions och returnerar `{ downloadUrl, message }` till chatten. Idag **ingen** preview – filen genereras direkt och länk visas i AI-svaret.

### Hur tool-resultat visas i chatten

- `personal-ai-chat.tsx`: Tool-parts med `state === "output-available"` och `output` kollas för speciella flaggor:
  - `__emailPreview` → **EmailPreviewCard**
  - `__searchResults` → **SearchResultsCard**
  - `__deleteConfirmation` → **DeleteConfirmationCard**
- Övriga tool-outputs (t.ex. `downloadUrl` + `message`) renderas **inte** som egen komponent – då visas bara AI:ns text-del (som ofta innehåller meddelandet med länk). Det finns alltså **inget** `__filePreview` eller `__fileGenerationPreview` idag.

---

## 5. Rekommenderad UI-approach

### Flöde

1. Användaren skriver t.ex. "Skapa rapport över rumsnummer på nedervåningen".
2. AI anropar ett **nytt verktyg** (t.ex. `prepareFileGeneration`) som **inte** skapar filen, utan samlar data och genererar innehåll (text för PDF, tabell för Excel) och returnerar med flaggan `__fileGenerationPreview`.
3. Chatten visar ett **FileGenerationPreviewCard** (liknande EmailPreviewCard): titel, format, kort beskrivning, knapp "Förhandsgranska och generera".
4. Klick öppnar **FileGenerationPreviewDialog** (Dialog):
   - **Preview:** PDF-typ → strukturerad text/HTML; Excel-typ → tabell.
   - **Redigera:** Toggle eller knapp "Redigera" som gör text/tabell redigerbar.
   - **Actions:** "Generera fil" (primary), "Avbryt". Vid "Generera fil": anropa befintlig export-action (eller ny action som tar redigerad payload), få tillbaka `downloadUrl`, stäng dialog, visa länk i chatten eller auto-öppna nedladdning.
5. Filen skapas först vid klick på "Generera fil", inte vid tool-anropet.

### Komponentstruktur

```
web/src/components/ai/
├── file-generation-preview-card.tsx   # Kort i chatten (som EmailPreviewCard)
├── file-generation-preview-dialog.tsx   # Dialog med preview + redigering + "Generera fil"
└── (valfritt)
    ├── report-preview-content.tsx       # PDF/rapport: sektioner som text/HTML
    └── table-preview-content.tsx        # Excel: Table med redigerbara celler
```

- **file-generation-preview-card.tsx**  
  - Props: `data: FileGenerationPreviewData` (format, title, payload för preview), `onGenerate: (editedPayload?) => Promise<{ downloadUrl } | { error }>`.  
  - Visar titel, format-badge, kort text eller tabell-preview, knapp "Förhandsgranska och generera" som sätter state och öppnar Dialog.

- **file-generation-preview-dialog.tsx**  
  - Props: `open`, `onOpenChange`, `data`, `onGenerate`.  
  - Innehåll: DialogHeader (titel), ScrollArea med antingen ReportPreviewContent eller TablePreviewContent, redigeringsläge (textarea/inputs), DialogFooter med "Avbryt" och "Generera fil". Vid "Generera fil" anropar `onGenerate(editedPayload)` och vid success stänger dialog och kan visa länk eller öppna `downloadUrl`.

- **report-preview-content**  
  - Tar payload (t.ex. `{ sections: { overview, tasks, time, members } }`), renderar som läsbar text/HTML. Redigeringsläge: en textarea per sektion eller en stor textarea för hela rapporten.

- **table-preview-content**  
  - Tar payload (array of rows + headers), renderar med `Table`. Redigeringsläge: inputs i celler eller enkel grid-state.

### Nya komponenter som behövs

| Komponent | Syfte |
|-----------|--------|
| **FileGenerationPreviewCard** | Kort i chatten som triggar preview-dialog. |
| **FileGenerationPreviewDialog** | Dialog med preview, redigering och "Generera fil". |
| **ReportPreviewContent** (valfritt egen fil) | Visar rapport som text/sektioner; kan ligga inbäddat i dialog. |
| **EditableTable** eller in-dialog Table med inputs | Excel-preview med redigerbara celler. |

Befintliga **Dialog**, **Sheet**, **Table**, **Button**, **ScrollArea**, **Textarea** från shadcn används som byggblock. Ingen ny primitiv (Drawer) behövs.

### Backend / AI-verktyg

- **Nytt verktyg** (t.ex. i `personal-tools.ts`): `prepareProjectReport`, `prepareTimeReportExcel`, `prepareTaskListExcel` – samma parametrar som nu, men **returnerar** `{ __fileGenerationPreview: true, format: "pdf" | "excel", title: string, payload: ... }` utan att anropa export-actions. Payload:
  - PDF: `{ sections: { overview, tasks, timeReporting, members } }` (strängar från AI eller sammanställning).
  - Excel: `{ headers: string[], rows: (string|number)[][] }`.
- **Befintliga export-actions** anropas **endast** från klienten (FileGenerationPreviewDialog "Generera fil"), med antingen oförändrad data eller **redigerad payload** om vi lägger till actions som accepterar payload (t.ex. `exportProjectSummaryPdfFromPayload` för redigerad text). Alternativt: första versionen utan redigering – bara preview + "Generera fil" som anropar samma export som idag.

---

## 6. Wireframe-beskrivning

### I chatten (efter AI-svar)

```
┌─────────────────────────────────────────────────────────────┐
│  Rapport redo att generera                          [PDF]    │
│  Projektrapport – Vecka 7                                    │
│  Översikt, uppgifter, tidsrapportering, medlemmar.           │
│                                                              │
│  [ Förhandsgranska och generera ]                            │
└─────────────────────────────────────────────────────────────┘
```

### Dialog (öppen efter klick)

```
┌──────────────────────────────────────────────────────────────────┐
│  Projektrapport – Förhandsgranskning                    [X]        │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─ Översikt ─────────────────────────────────────────────────┐  │
│  │  Projekt X, vecka 7. 12 uppgifter, 3 pågående...            │  │
│  └────────────────────────────────────────────────────────────┘  │
│  ┌─ Uppgifter ────────────────────────────────────────────────┐  │
│  │  • Uppgift A (Pågående)  • Uppgift B (Klar)  ...            │  │
│  └────────────────────────────────────────────────────────────┘  │
│  ┌─ Tidsrapportering ─────────────────────────────────────────┐  │
│  │  Totalt 24 h. Anna 12 h, Erik 12 h.                         │  │
│  └────────────────────────────────────────────────────────────┘  │
│  ┌─ Medlemmar ────────────────────────────────────────────────┐  │
│  │  Anna, Erik, Maria                                          │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  [ Redigera ]                                                     │
│                                                                   │
├──────────────────────────────────────────────────────────────────┤
│  [ Avbryt ]                    [ Generera fil (PDF) ]             │
└──────────────────────────────────────────────────────────────────┘
```

För **Excel-preview** ersätts sektionerna av en tabell med rubrikrad och datarader; i redigeringsläge visas inputs i celler.

---

## 7. Sammanfattning

| Beslut | Val |
|--------|-----|
| **Container** | **Dialog** (inte Sheet/Drawer) för preview och "Generera fil". |
| **Komponenter** | FileGenerationPreviewCard (i chatten), FileGenerationPreviewDialog (preview + redigering + knappar), ReportPreviewContent / tabellvy för Excel. |
| **PDF-preview** | Visa som strukturerad text/HTML (sektioner), inte som riktig PDF i iframe. Redigering: text per sektion. |
| **Excel-preview** | Tabell med datan (headers + rows). Redigering: redigerbara celler. |
| **Flöde** | Nytt verktyg returnerar `__fileGenerationPreview` → kort i chatten → Dialog → preview/redigera → "Generera fil" anropar befintlig export och returnerar downloadUrl. |

Detta bygger på befintliga mönster (EmailPreviewCard, OcrReviewDialog, FilePreviewModal) och kräver inga nya UI-primitiver utöver de komponenter som beskrivs ovan.
