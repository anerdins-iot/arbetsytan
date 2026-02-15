# Filgenereringsmöjligheter för byggbranschen

Analys av bibliotek och verktyg för att generera olika filformat i ArbetsYtan (byggbransch-fokus). Inkluderar vad som redan finns i projektet och rekommendationer för utökning.

---

## Befintlig användning i projektet

### Installerade bibliotek (web/package.json)

| Format | Bibliotek | Version | Användning |
|--------|-----------|---------|------------|
| PDF | `@react-pdf/renderer` | ^4.3.2 | Rapporter, enkel PDF från AI |
| Excel | `exceljs` | ^4.4.0 | Materiallistor, tidsrapporter, uppgiftslistor |
| Word | `docx` | ^9.5.1 | Enkla Word-dokument från AI |
| Word (läsa) | `mammoth` | ^1.11.0 | OCR/filanalys – extrahera text ur .docx |

### Befintlig filgenereringskod

- **PDF**
  - `web/src/lib/reports/simple-content-pdf.tsx` – enkel PDF från titel + brödtext (AI-genererade dokument)
  - `web/src/lib/reports/project-summary-pdf.tsx` – projektsammanfattning (uppgifter, medlemmar, tid)
  - Används från: `actions/export.ts` (exportProjectSummaryPdf), `lib/ai/tools/shared-tools.ts` (generatePdfDocument), `lib/ai/tools/personal-tools.ts` (projektrapport PDF)
- **Excel**
  - `web/src/actions/export.ts` – exportTimeReportExcel, exportTaskListExcel (ExcelJS)
  - `web/src/lib/ai/tools/shared-tools.ts` – generateExcelDocument (AI: materiallistor m.m.)
- **Word**
  - `web/src/lib/reports/simple-content-docx.ts` – enkel docx från titel + stycken (AI)
  - `web/src/lib/ai/tools/shared-tools.ts` – generateWordDocument
- **CSV**
  - Ingen generering – endast **parsning** i `web/src/lib/ai/ocr.ts` och `file-processors.ts` (processCSV).
- **Bilder / QR**
  - Ingen bildgenerering eller QR-kod i projektet.

---

## 1. PDF-dokument

**Användningsfall bygg:** Rapporter, protokoll, ritningslistor, projektsammanfattningar, offerter.

### Redan i projektet: @react-pdf/renderer

- **Motivering:** React-komponenter → PDF, bra för strukturerade rapporter, körs i Node (renderToBuffer). Redan använd för enkel PDF och projektsammanfattning.
- **Installation:** Redan installerat.
- **Exempel (befintligt):**

```tsx
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

const styles = StyleSheet.create({ page: { padding: 28, fontSize: 11 }, title: { fontSize: 18, fontWeight: 700 } });

export async function buildSimplePdf(title: string, content: string): Promise<Uint8Array> {
  const paragraphs = content.trim().split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const document = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{title || "Dokument"}</Text>
        {paragraphs.map((text, i) => (
          <View key={i}><Text>{text}</Text></View>
        ))}
      </Page>
    </Document>
  );
  const buffer = await renderToBuffer(document);
  return new Uint8Array(buffer);
}
```

- **Byggbransch:** Protokoll, rapport med stycken, projektsammanfattning med tabeller (som i project-summary-pdf.tsx).

### Alternativ: pdf-lib

- **Användning:** Modifiera befintliga PDF:er, lägga till signaturer, formulär, vattenstämplar. Mindre lämpligt för att bygga hela rapporter från scratch i React-miljö.
- **Installation:** `npm install pdf-lib` (i web/)
- **Exempel:**

```ts
import { PDFDocument } from "pdf-lib";
const pdfDoc = await PDFDocument.create();
const page = pdfDoc.addPage([595, 842]); // A4
page.drawText("Rapporttitel", { x: 50, y: 800, size: 18 });
const bytes = await pdfDoc.save();
```

### Alternativ: HTML → PDF (Puppeteer/Playwright)

- **Användning:** När man vill använda befintliga webbvyer/HTML-mallar för utskrift. Playwright finns redan som devDependency; för server-side PDF krävs headless i produktionskontext (tyngre).
- **Rekommendation:** Behåll @react-pdf/renderer som huvudsaklig PDF-generering. Överväg pdf-lib endast om behov uppstår för att redigera/teckna befintliga PDF:er.

---

## 2. Excel / Spreadsheets

**Användningsfall bygg:** Materiallistor, budgetar, tidsplaner, tidsrapporter, uppgiftslistor.

### Redan i projektet: exceljs

- **Motivering:** Bra API, stöd för .xlsx, formatering (kolumnbredd, fetstil), redan använd för export och AI-genererade Excel-filer.
- **Installation:** Redan installerat.
- **Exempel (befintligt):**

```ts
import ExcelJS from "exceljs";

const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet("Materiallista");
sheet.columns = [
  { header: "Artikel", key: "article", width: 30 },
  { header: "Antal", key: "qty", width: 10 },
  { header: "Enhet", key: "unit", width: 8 },
];
sheet.addRow({ article: "Skruv M6", qty: 500, unit: "st" });
sheet.addRow({ article: "Plåt 2mm", qty: 12, unit: "m²" });
const header = sheet.getRow(1);
header.font = { bold: true };
const buffer = await workbook.xlsx.writeBuffer();
```

- **Byggbransch:** Materiallistor, tidsrapporter (datum, uppgift, person, minuter), uppgiftslistor, enkla budgetar.

### Alternativ: xlsx (SheetJS)

- **Fördelar:** Lättvikt, stöd för .xls, .xlsx, CSV. **Nackdelar:** Community Edition begränsad; styling enklare med ExcelJS. Projektet har redan ExcelJS.
- **Installation:** `npm install xlsx`
- **Rekommendation:** Behåll ExcelJS som standard för Excel-generering.

---

## 3. Word-dokument

**Användningsfall bygg:** Kontrakt, beskrivningar, mötesprotokoll, offerter.

### Redan i projektet: docx

- **Motivering:** Programmatisk skapande av .docx med stycken, rubriker, tabeller. Mammoth används endast för att **läsa** Word.
- **Installation:** Redan installerat.
- **Exempel (befintligt):**

```ts
import { Document, HeadingLevel, Packer, Paragraph } from "docx";

export async function buildSimpleDocx(title: string, paragraphs: string[]): Promise<Uint8Array> {
  const children: Paragraph[] = [
    new Paragraph({ text: title || "Dokument", heading: HeadingLevel.TITLE }),
  ];
  for (const text of paragraphs) {
    if (text.trim()) children.push(new Paragraph({ text: text.trim() }));
  }
  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);
  return new Uint8Array(buffer);
}
```

- **Byggbransch:** Kontrakt, offerttexter, protokoll med rubriker och stycken. docx stödjer också tabeller och listor.

### Alternativ: officegen

- Äldre, mindre underhållen. **Rekommendation:** Behåll docx.

---

## 4. Bilder

**Användningsfall bygg:** Planritningar med markeringar, skisser, QR-koder för plats/artikel, miniatyrer.

### Rekommenderat: sharp

- **Motivering:** Snabb Node-baserad bildbehandling (resize, crop, format). Lämplig för server-side miniatyrer och enkel grafik.
- **Installation:** `npm install sharp` (i web/)
- **Exempel:**

```ts
import sharp from "sharp";

// Enkel bild (placeholder/markör)
const buffer = await sharp({
  create: { width: 400, height: 300, channels: 3, background: { r: 240, g: 240, b: 240 } },
})
  .png()
  .toBuffer();

// Miniatyr av ritning
const thumb = await sharp(inputBuffer).resize(200, 200, { fit: "inside" }).png().toBuffer();
```

- **Byggbransch:** Miniatyrer av ritningar, enkla plats-/materialbilder.

### Alternativ: node-canvas

- Rita fri grafik (linjer, cirklar, text). Kräver native libcairo; kan vara besvärligt i Docker. Överväg om sharp inte räcker.

### QR-koder: qrcode

- **Motivering:** QR för platser, projekt, material.
- **Installation:** `npm install qrcode` (+ `@types/qrcode` vid behov)
- **Exempel:**

```ts
import QRCode from "qrcode";
const dataUrl = await QRCode.toDataURL("https://app.arbetsytan.se/p/project-id", { width: 256, margin: 2 });
const buffer = Buffer.from(dataUrl.split(",")[1], "base64");
```

- **Byggbransch:** QR på platsrapporter, materialetiketter, projektlänkar.

---

## 5. CSV / Data-export

**Användningsfall bygg:** Enkel dataexport till andra system, Excel som CSV.

### Rekommendation: Ingen extra dependency för enkel CSV

- CSV kan skrivas med vanlig JS (escape av citat och separator). Vid behov: **csv-stringify** eller **papaparse**.
- **Installation (valfritt):** `npm install csv-stringify` eller `npm install papaparse`
- **Exempel (utan lib):**

```ts
function rowsToCsv(rows: string[][], separator = ";"): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell);
          if (s.includes('"') || s.includes(separator) || s.includes("\n")) {
            return `"${s.replace(/"/g, '""')}"`;
          }
          return s;
        })
        .join(separator)
    )
    .join("\n");
}

const csv = rowsToCsv([
  ["Datum", "Uppgift", "Minuter"],
  ["2025-02-15", "Montering", "120"],
]);
// Buffer.from(csv, "utf-8") → MinIO eller svar
```

- **Byggbransch:** Export av tidsrapporter, uppgifter eller material för import i ekonomisystem.

---

## Sammanfattning och rekommendationer

| Format | Bibliotek i projekt | Rekommendation |
|--------|--------------------|----------------|
| **PDF** | @react-pdf/renderer | Behåll. pdf-lib endast vid redigering/signering av befintliga PDF:er. |
| **Excel** | exceljs | Behåll. |
| **Word** | docx (+ mammoth läsning) | Behåll docx för generering. |
| **Bilder** | — | Lägg till **sharp** (miniatyrer, enkel generering) och **qrcode** (QR för plats/projekt/material). |
| **CSV** | — | Enkel export med egen rowsToCsv; vid behov **csv-stringify**. |

### Nya installationer att överväga

- **sharp** – miniatyrer och enkla bilder.
- **qrcode** – QR-koder för platser, projekt, material.
- **csv-stringify** – valfritt för robust CSV-export.

### Arkitektur

- Generering sker i Service Layer / actions; AI-verktyg anropar Actions eller delad logik i shared-tools. Nya format (CSV, bilder med sharp/QR) bör följa samma mönster och spara till MinIO via befintliga hjälpare.
