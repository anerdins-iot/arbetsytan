# Dynamiskt filgenereringssystem – förenklad design

Tre generiska verktyg för PDF, Excel och Word. AI:n hämtar data med befintliga tools, strukturerar innehållet och anropar rätt generate-verktyg med valfri mall.

---

## 1. Översikt

| Verktyg | Syfte |
|--------|--------|
| `generatePdf` | Rapport, protokoll, offert – titel + innehåll (markdown/strukturerad text) + valfri mall |
| `generateExcel` | Listor, tabeller – titel + flera blad med headers/rows |
| `generateWord` | Samma som PDF men .docx – titel + innehåll + valfri mall |

**AI:ns flöde:** Använd befintliga dataverktyg (listTasks, getTimeEntries, listFiles, etc.) → formulera och strukturera innehåll → välj format och mall → anropa `generatePdf` / `generateExcel` / `generateWord`.

---

## 2. Content-struktur

### 2.1 PDF och Word: `content`

**Rekommendation: Markdown**

- Enkelt för AI att generera (rubriker, listor, stycken).
- Kan parsas till stycken (`\n\n`) för befintlig `buildSimplePdf` / `buildSimpleDocx`, eller till rikare struktur vid behov.
- Alternativ: **JSON med sektioner** om vi vill stycka redigering i preview (en textarea per sektion):

```ts
// Alternativ: strukturerad content för redigerbar preview
type StructuredContent = {
  sections: Array<{ heading: string; body: string }>;
};
```

**Beslut:** Börja med **en enda markdown-sträng** (`content: string`). Det räcker för både generering och preview (visa som rendered markdown eller rå text). Vid behov kan vi senare lägga till `contentStructured` för redigerbar preview per sektion.

- **PDF:** `content` → stycken separerade med `\n\n` (som idag i `buildSimplePdf`) eller enkel markdown→HTML→react-pdf om vi lägger till en markdown-renderer.
- **Word:** `content` → stycken som idag i `buildSimpleDocx` (titeln + array av stycken); vi kan splitta på `\n\n` från samma `content`.

### 2.2 Excel: `sheets`

Redan tydligt: `sheets: Array<{ name: string; headers: string[]; rows: (string|number)[][] }>`. AI:n fyller i från hämtad data.

---

## 3. Mallar (templates)

Mallar = **styling/layout**, ingen affärslogik. Samma data (title, content/sheets) kan skickas till olika mallar.

| Mall | Format | Beskrivning |
|------|--------|-------------|
| `projektrapport` | PDF/Word | Logo-plats, sektioner med rubriker, footer med datum |
| `offert` | PDF/Word | Villkorstext, plats för prissumma, signatur |
| `protokoll` | PDF/Word | Deltagarlista, beslutspunkter, datum |
| `materiallista` | Excel | Tabell med summeringsrad, kolumnbredder |
| `null` / utelämnad | Alla | Fritt format – AI bestämmer layout |

### 3.1 Teknisk implementation

- **Plats:** En builder per format som tar `(title, content, template)` respektive `(title, sheets, template)`.
- **PDF:** I `web/src/lib/reports/` – t.ex. `buildPdfWithTemplate(title, content, template)`. Switch/case eller map på `template` → olika StyleSheet/layout (header/footer, logo-plats, sektionsrubriker). Befintlig `buildSimplePdf` blir fallet `template: null`.
- **Word:** Motsvarande med `docx` – olika stycken/stilar för offert vs protokoll.
- **Excel:** `template: "materiallista"` → t.ex. fet rubrikrad, auto-width kolumner, summeringsrad på sista raden. Annars som idag.

Mallar kan vara en enum/union i TypeScript och vidarebefordras som sträng till builder-funktionerna; inga nya API:er för AI – bara fler val i samma verktyg.

---

## 4. Tool-definitioner (förenklade)

### 4.1 generatePdf

```ts
// I shared-tools eller personal-tools
generatePdf: tool({
  description:
    "Generera en PDF-fil och spara den i projektets fillista. Ange filnamn (sluta med .pdf), titel och innehåll (markdown eller vanlig text; stycken separeras med dubbla radbrytningar). Valfritt: template för layout (projektrapport, offert, protokoll, eller null för fritt).",
  inputSchema: toolInputSchema(z.object({
    fileName: z.string().describe("Filnamn t.ex. rapport.pdf"),
    title: z.string().describe("Dokumentets titel"),
    content: z.string().describe("Brödtext i markdown eller vanlig text"),
    template: z.enum(["projektrapport", "offert", "protokoll"]).optional().nullable()
      .describe("Layout-mall eller null för fritt format"),
  })),
  execute: async ({ fileName, title, content, template }) => {
    return generatePdfDocument({
      db, tenantId, projectId, userId,
      fileName, title, content, template: template ?? null,
    });
  },
}),
```

### 4.2 generateExcel

```ts
generateExcel: tool({
  description:
    "Generera en Excel-fil med ett eller flera blad. Ange filnamn (.xlsx), titel och sheets: array av { name, headers, rows }. Valfritt: template (t.ex. materiallista) för tabellstil.",
  inputSchema: toolInputSchema(z.object({
    fileName: z.string().describe("Filnamn t.ex. materiallista.xlsx"),
    title: z.string().optional().describe("Dokumenttitel / första bladets namn"),
    sheets: z.array(z.object({
      name: z.string().describe("Bladnamn"),
      headers: z.array(z.string()).describe("Rubrikrad"),
      rows: z.array(z.array(z.union([z.string(), z.number()]))).describe("Datarader"),
    })),
    template: z.enum(["materiallista"]).optional().nullable(),
  })),
  execute: async ({ fileName, title, sheets, template }) => {
    return generateExcelDocument({
      db, tenantId, projectId, userId,
      fileName, sheets, template: template ?? null, title,
    });
  },
}),
```

### 4.3 generateWord

```ts
generateWord: tool({
  description:
    "Generera ett Word-dokument (.docx) och spara i projektets fillista. Ange filnamn, titel och content (markdown eller text). Valfritt: template (projektrapport, offert, protokoll).",
  inputSchema: toolInputSchema(z.object({
    fileName: z.string().describe("Filnamn t.ex. offert.docx"),
    title: z.string().describe("Dokumentets titel"),
    content: z.string().describe("Brödtext, stycken separeras med dubbla radbrytningar"),
    template: z.enum(["projektrapport", "offert", "protokoll"]).optional().nullable(),
  })),
  execute: async ({ fileName, title, content, template }) => {
    return generateWordDocument({
      db, tenantId, projectId, userId,
      fileName, title, content, template: template ?? null,
    });
  },
}),
```

Befintliga `generatePdfDocument` / `generateExcelDocument` / `generateWordDocument` i `shared-tools.ts` utökas med en parameter `template?: string | null` som skickas vidare till respektive build-funktion (simple-content-pdf, exceljs, simple-content-docx).

---

## 5. Preview innan generering

Enligt `file-generation-preview-analysis.md`:

- **Flöde:** AI anropar ett verktyg som **inte** skapar filen utan returnerar payload med `__fileGenerationPreview: true` → chatten visar **FileGenerationPreviewCard** → användaren klickar "Förhandsgranska och generera" → **FileGenerationPreviewDialog** (preview + valfritt redigera) → "Generera fil" anropar server action som bygger filen och returnerar `downloadUrl`.

### 5.1 Två varianter

**Variant A – Direkt generering (som idag)**  
AI anropar `generatePdf`/`generateExcel`/`generateWord` direkt → fil skapas → tool returnerar `{ fileId, name, downloadUrl, message }`. Ingen preview.

**Variant B – Preview först**  
Nytt verktyg t.ex. `prepareGeneratedFile` som tar samma parametrar som `generatePdf`/`generateExcel`/`generateWord` men bara returnerar:

```ts
{
  __fileGenerationPreview: true,
  format: "pdf" | "excel" | "word",
  title: string,
  fileName: string,
  payload: { content } | { sheets },
  template?: string | null,
}
```

Chatten visar **FileGenerationPreviewCard**. I dialog: preview (PDF/Word → markdown/text, Excel → tabell), redigering (textarea för content, redigerbara celler för sheets). "Generera fil" anropar en server action som tar `payload` (+ eventuellt redigerad data) och anropar samma build/upload-logik som verktygen, returnerar `downloadUrl`.

### 5.2 Rekommendation

- **Fas 1:** Behåll direkt generering (Variant A) med de tre verktygen ovan – enklast att ta i bruk.
- **Fas 2:** Lägg till `prepareGeneratedFile` och FileGenerationPreviewCard/Dialog när vi vill ha preview och redigering innan fil skapas.

---

## 6. Sammanfattning

| Punkt | Beslut |
|-------|--------|
| **Content (PDF/Word)** | En markdown-sträng `content`; stycken med `\n\n`. Vid behov senare: strukturerad JSON för redigerbar preview. |
| **Excel** | `sheets: { name, headers, rows }[]` – oförändrat. |
| **Mallar** | Optional `template` per verktyg; ren layout (projektrapport, offert, protokoll, materiallista). Implementeras i befintliga build-funktioner via switch/map. |
| **AI** | Använder befintliga dataverktyg, bygger title/content/sheets, väljer format + mall, anropar generatePdf/Excel/Word. |
| **Preview** | Fas 1: ingen; Fas 2: prepareGeneratedFile + FileGenerationPreviewCard + Dialog som anropar export-action. |

Implementationssteg:

1. Lägg till `template` i `generatePdfDocument`, `generateExcelDocument`, `generateWordDocument` och i motsvarande build-funktioner (med default null).
2. Exponera de tre verktygen (generatePdf, generateExcel, generateWord) med ovanstående scheman i personal-tools (och vid behov projekt-tools).
3. Uppdatera system prompt så att AI väljer format och mall utifrån användarens önskemål (rapport → PDF, lista → Excel, offert → Word med mall offert).
4. Vid behov: implementera `prepareGeneratedFile` och UI för preview enligt file-generation-preview-analysis.md.
