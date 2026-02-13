---
title: Mistral OCR
description: OCR API för dokumentextraktion med strukturbevarande, handskriftstöd och interleaved content (text + bilder)
tags: [mistral, ocr, pdf, document-extraction, ai]
---

## Installation

```bash
npm install @mistralai/mistralai
```

**Miljövariabler:**

```bash
MISTRAL_API_KEY=your_api_key_here
```

---

## Översikt

Mistral OCR extraherar text och bilder från dokument med bevarad struktur. Senaste modellen är **Mistral OCR 3** (`mistral-ocr-2512`, december 2025).

**Nyckelfördelar:**
- **Interleaved content** - Text och bilder returneras i originalordning
- **Strukturbevarande** - Rubriker, tabeller, formatering behålls
- **Flerspråk** - Tusentals typsnitt, skript och språk
- **Handskrift** - ~94.9% accuracy på handskriven text
- **Hög throughput** - 2000 sidor per minut
- **Förbättrat** - 74% win rate över OCR 2

---

## Modeller

| Modell | Identifierare | Beskrivning |
|--------|---------------|-------------|
| **Mistral OCR 3** | `mistral-ocr-2512` | Senaste OCR-modellen (dec 2025) |
| **Latest** | `mistral-ocr-latest` | Pekar alltid på senaste versionen |
| **Vision** | `pixtral-12b-2409` | Generella bildbeskrivningar (se jämförelse nedan) |

---

## OCR API

### Endpoint

```
POST https://api.mistral.ai/v1/ocr
Authorization: Bearer YOUR_API_KEY
```

### Request-parametrar

| Parameter | Typ | Beskrivning |
|-----------|-----|-------------|
| `model` | string (required) | `"mistral-ocr-2512"` eller `"mistral-ocr-latest"` |
| `document.type` | string | `"document_url"` eller `"document_base64"` |
| `document.document_url` | string | URL till dokumentet (om type = document_url) |
| `document.document_base64` | string | Base64-enkodad dokument (om type = document_base64) |
| `include_image_base64` | boolean | Inkludera extraherade bilder i response (default: false) |
| `table_format` | string | `"html"` eller `"markdown"` (default: markdown) |

### Response-struktur

| Fält | Beskrivning |
|------|-------------|
| `pages[]` | Array med sidor |
| `pages[].markdown` | Extraherad text i markdown-format |
| `pages[].images[]` | Extraherade bilder med bounding box koordinater |
| `pages[].tables[]` | Tabeller i HTML eller markdown |
| `pages[].hyperlinks[]` | Länkar från dokumentet |
| `usage.pages` | Antal sidor (för fakturering) |

### Minimal implementation

```typescript
import { Mistral } from '@mistralai/mistralai'

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY })

const result = await client.ocr.complete({
  model: 'mistral-ocr-2512',
  document: {
    type: 'document_url',
    document_url: 'https://example.com/document.pdf'
  }
})

const extractedText = result.pages.map(p => p.markdown).join('\n\n')
```

---

## Dokumenttyper som stöds

| Kategori | Format |
|----------|--------|
| **Filformat** | PDF, PNG, JPG, JPEG, WEBP, GIF |
| **Dokument** | Skannade dokument, formulär, fakturor, kvitton |
| **Teknisk** | Ritningar, blueprints, scheman, diagram |
| **Handskrivet** | Handskriven text (~94.9% accuracy) |

**Rekommendation:** För bästa resultat, använd högupplösta skanningar (300 DPI+) och tydliga bilder.

---

## Structured Data Extraction (Annotations API)

Extrahera specifika fält från dokument genom att definiera ett schema:

### Parametrar

| Parameter | Beskrivning |
|-----------|-------------|
| `document_annotation.fields[]` | Array med fältdefinitioner |
| `fields[].name` | Fältnamn (ex: "invoice_number") |
| `fields[].description` | Beskrivning av vad som ska extraheras |
| `fields[].type` | Datatyp (string, number, date, etc.) |

### Response

Returnerar strukturerad JSON med extraherade värden enligt definierade fält.

### Användningsfall

- Faktura-extraktion (nummer, datum, belopp, leverantör)
- Formulär-parsing (namn, adress, personnummer)
- Kvitto-analys (total, moms, datum, butik)
- Teknisk dokumentation (komponenter, mått, specifikationer)

---

## Vision API vs OCR API

| Kriterium | Vision API (`pixtral-12b`) | OCR API (`mistral-ocr-2512`) |
|-----------|---------------------------|------------------------------|
| **Användning** | Generella bilder, screenshots, UI | Dokument, PDFs, skanningar |
| **Max bilder** | 8 bilder per request | Obegränsat antal sidor |
| **Struktur** | Beskrivande text | Strukturbevarad extraktion |
| **Tabeller** | Begränsad hantering | Native tabellformat (HTML/markdown) |
| **Hastighet** | Snabb för enstaka bilder | Optimerad för bulk (2000 sid/min) |
| **Kostnad** | Per API-anrop | Per sida ($2/1000, batch: $1/1000) |
| **Bäst för** | Bildbeskrivning, chat med bilder | Dokumentdigitalisering, formulär |

**Tumregel:** Använd Vision för screenshots och generella bilder. Använd OCR för dokument med text, tabeller och struktur.

---

## Integration med Next.js

### Arkitektur

OCR-integration sker på serversidan för att skydda API-nycklar och hantera stora filer:

**Flöde:**
1. Client laddar upp fil till Next.js Server Action eller API Route
2. Server skickar fil till Mistral OCR API
3. Server returnerar extraherad text/data till client
4. Client renderar resultat eller sparar till databas

**Viktiga överväganden:**
- Använd `multipart/form-data` för filuppladdning
- Validera filtyp och storlek på serversidan
- Implementera progress-tracking för stora dokument
- Cacha OCR-resultat i databas för att undvika upprepade anrop
- Överväg background jobs (Inngest, BullMQ) för stora batch-operationer

### Server Action exempel (kortfattat)

```typescript
'use server'
import { Mistral } from '@mistralai/mistralai'

export async function extractDocument(formData: FormData) {
  const file = formData.get('file') as File
  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')

  const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY })
  const result = await client.ocr.complete({
    model: 'mistral-ocr-2512',
    document: { type: 'document_base64', document_base64: base64 }
  })

  return { text: result.pages.map(p => p.markdown).join('\n\n') }
}
```

**Referens:** Se [docs/nextjs.md](nextjs.md) för Server Actions och [docs/ai-sdk.md](ai-sdk.md) för AI SDK-integration.

---

## Prissättning

| Modell | Standard | Batch API (50% rabatt) |
|--------|----------|------------------------|
| **OCR** | $2 per 1000 sidor | $1 per 1000 sidor |
| **OCR + Annotations** | $3 per 1000 sidor | $1.50 per 1000 sidor |

**Batch API:** Använd för stora volymer där latens inte är kritisk. Request behandlas asynkront.

**Kostnadsoptimering:**
- Använd Batch API för bulk-processsering
- Cacha OCR-resultat för återanvända dokument
- Validera dokumenttyp innan API-anrop
- Komprimera PDF:er innan uppladdning (minskar inte sidantal men snabbar upp)

---

## Felhantering

| Statuskod | Betydelse | Åtgärd |
|-----------|-----------|--------|
| **429** | Rate limit överskiden | Implementera exponential backoff (1s, 2s, 4s, 8s) |
| **400** | Felaktig request | Validera parametrar, dokumentformat, base64-encodning |
| **401** | Autentiseringsfel | Verifiera API-nyckel, kontrollera Bearer token |
| **500** | Server error | Retry med exponential backoff, logga för analys |

### Exponential Backoff Pattern

Vid rate limits eller server errors, vänta exponentiellt längre tid mellan försök:

**Strategi:**
- Första retry: 1 sekund
- Andra retry: 2 sekunder
- Tredje retry: 4 sekunder
- Fjärde retry: 8 sekunder
- Max 5 försök, sedan fail

**Implementation:** Använd bibliotek som `retry` eller `p-retry` för automatisk retry-logik.

---

## Best Practices

1. **Validera innan OCR** - Kontrollera filtyp, storlek och format innan API-anrop
2. **Använd document_url när möjligt** - Snabbare än base64 för stora filer
3. **Cacha resultat** - Spara extraherad text i databas för återanvändning
4. **Background processing** - Kör OCR asynkront för stora dokument
5. **Progress tracking** - Visa progress för multi-page dokument
6. **Error recovery** - Implementera retry-logik för transient errors
7. **Strukturerad extraktion** - Använd Annotations API istället för regex-parsing
8. **Batch för bulk** - Använd Batch API för stora volymer (50% rabatt)

---

## Relaterade resurser

- [Mistral AI SDK](ai-sdk.md) - För integrering med Vercel AI SDK
- [Next.js 16](nextjs.md) - Server Actions och API Routes
- [Docker](docker.md) - För OCR-processing i containers
