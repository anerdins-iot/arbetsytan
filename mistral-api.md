# Mistral AI API Documentation

A comprehensive guide to Mistral AI's API, with emphasis on OCR capabilities, authentication, and integration patterns for modern backend applications.

---

## Table of Contents

1. [Mistral OCR Overview](#mistral-ocr-overview)
2. [OCR API Technical Details](#ocr-api-technical-details)
3. [Document Processing Capabilities](#document-processing-capabilities)
4. [Mistral API Basics](#mistral-api-basics)
5. [Vision & Multimodal Capabilities](#vision--multimodal-capabilities)
6. [Integration Patterns for Next.js](#integration-patterns-for-nextjs)
7. [Error Handling & Rate Limiting](#error-handling--rate-limiting)
8. [Pricing](#pricing)

---

## Mistral OCR Overview

### What is Mistral OCR?

Mistral OCR is a state-of-the-art Optical Character Recognition API that extracts text and embedded images from documents while preserving structure and formatting. It's designed to understand and process complex documents including forms, scanned pages, technical drawings, blueprints, and handwritten content.

### Key Features

- **Interleaved Content Extraction**: Extracts text and images in their original document order
- **Structure Preservation**: Maintains document formatting including headings, italics, bold text, and table structures
- **Multilingual Support**: Recognizes thousands of fonts, scripts, and languages across all continents
- **High Performance**: Processes up to 2,000 pages per minute on a single node
- **Image Recognition**: Automatically detects and extracts embedded images from documents
- **Handwriting Recognition**: Supports handwritten text extraction with high accuracy

### Mistral OCR Versions

**Current Version: Mistral OCR 3 (mistral-ocr-2512)**

- Released: December 2025
- Improved accuracy for handwritten content, forms, and structured documents
- 74% overall win rate over Mistral OCR 2
- Fully backward compatible with Mistral OCR 2
- Also available as `mistral-ocr-latest` for latest version

**Previous Version: Mistral OCR 2**
- Still supported for backward compatibility
- Available as fallback option

---

## OCR API Technical Details

### Base URL

```
https://api.mistral.ai/v1
```

### OCR Endpoint

```
POST /v1/ocr
```

### Authentication

All requests require the `Authorization` header:

```
Authorization: Bearer YOUR_MISTRAL_API_KEY
```

### Request Format

```json
{
  "model": "mistral-ocr-2512",
  "document": {
    "type": "document_url",
    "document_url": "https://example.com/document.pdf"
  },
  "include_image_base64": true,
  "table_format": "html"
}
```

### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | string | Yes | OCR model identifier (e.g., `mistral-ocr-2512` or `mistral-ocr-latest`) |
| `document` | object | Yes | Document object containing type and location |
| `document.type` | string | Yes | Type of document source: `document_url`, `document_base64`, or `document_data` |
| `document.document_url` | string | Conditional | URL of publicly accessible PDF or image (required for `document_url` type) |
| `document.document_base64` | string | Conditional | Base64-encoded document content (for `document_base64` type) |
| `include_image_base64` | boolean | No | Whether to include extracted images as base64 (default: false) |
| `table_format` | string | No | Format for table output: `html` or `markdown` (default: `markdown`) |

### Supported Document Types

- **PDF Documents**: Multi-page PDFs with text, images, and tables
- **Image Formats**: PNG, JPG, JPEG, WEBP, GIF
- **Scanned Documents**: Low-quality scans, faded text, skewed pages
- **Complex Layouts**: Forms, invoices, receipts, certificates
- **Technical Documents**: Blueprints, engineering drawings, schematics
- **Handwritten Content**: Handwritten notes and signatures

### File Size & Limitations

- **PDF File Size**: No strict maximum documented, but reasonable limits apply
- **Page Count**: No documented maximum; batch API recommended for very large documents
- **Image Count per Request**: Reasonable limits apply per API plan
- **Processing Speed**: ~2,000 pages per minute typical throughput

### Response Format

```json
{
  "pages": [
    {
      "index": 0,
      "markdown": "# Document Title\n\nThis is the extracted content...",
      "images": [
        {
          "index": 0,
          "base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
          "bbox": [0, 0, 100, 100]
        }
      ],
      "tables": [
        {
          "index": 0,
          "html": "<table><tr><td>Header 1</td></tr></table>",
          "markdown": "| Header 1 |"
        }
      ],
      "hyperlinks": [
        {
          "url": "https://example.com",
          "text": "Example Link"
        }
      ],
      "width": 612,
      "height": 792
    }
  ],
  "model": "mistral-ocr-2512",
  "usage": {
    "pages": 1
  }
}
```

### Response Fields Explained

| Field | Description |
|-------|-------------|
| `pages` | Array of page objects, one per page in the document |
| `pages[].index` | Page number (0-indexed) |
| `pages[].markdown` | Extracted text content in Markdown format with formatting preserved |
| `pages[].images` | Array of extracted images with base64 encoding if requested |
| `pages[].images[].bbox` | Bounding box coordinates [x, y, width, height] |
| `pages[].tables` | Array of extracted tables in both HTML and Markdown formats |
| `pages[].hyperlinks` | Detected hyperlinks and their destinations |
| `pages[].width` | Page width in points |
| `pages[].height` | Page height in points |
| `model` | Name of the model used for processing |
| `usage.pages` | Number of pages processed (for billing) |

### Language Support

Mistral OCR supports:
- **All major languages**: English, Spanish, French, German, Chinese, Japanese, Arabic, and many more
- **Scripts**: Latin, Cyrillic, Arabic, CJK, Hebrew, Thai, Devanagari, etc.
- **Mixed-language documents**: Can detect and process documents with multiple languages on same page

---

## Document Processing Capabilities

### Text Extraction

- Extracts plain text with character-level accuracy
- Preserves formatting: bold, italic, underline, strikethrough
- Recognizes and maintains heading hierarchy (H1, H2, H3, etc.)
- Handles special characters and Unicode properly

### Table Recognition & Extraction

- Detects tables and extracts data structure
- **Output Format 1**: HTML tables with proper cell structure
- **Output Format 2**: Markdown tables for simpler consumption
- Handles:
  - Multi-row and multi-column headers
  - Merged cells
  - Complex table layouts
  - Tables spanning multiple pages

### Image Extraction

- Detects embedded images in documents
- Extracts images with optional base64 encoding
- Preserves image location (bounding box coordinates)
- Supports figures, diagrams, logos, and photographs
- Base64 format allows direct use in web applications

### Handwritten Content

- Recognizes handwritten text with ~94.9% accuracy across document types
- Supports cursive and printed handwriting
- Works with varying ink colors and paper conditions
- Useful for: notes, signatures, annotations, forms

### Structured Data Extraction

#### Annotations API (Advanced)

For extracting specific fields from documents:

```json
{
  "model": "mistral-ocr-2512",
  "document": {
    "type": "document_url",
    "document_url": "https://example.com/invoice.pdf"
  },
  "document_annotation": {
    "fields": [
      {
        "name": "invoice_number",
        "description": "Invoice identifier",
        "type": "string"
      },
      {
        "name": "amount",
        "description": "Total invoice amount",
        "type": "number"
      },
      {
        "name": "items",
        "description": "List of line items",
        "type": "array"
      }
    ]
  }
}
```

Response includes extracted values in structured JSON:

```json
{
  "pages": [...],
  "document_annotation": {
    "invoice_number": "INV-2025-001",
    "amount": 1500.00,
    "items": [
      {"description": "Item 1", "quantity": 2, "price": 500},
      {"description": "Item 2", "quantity": 1, "price": 500}
    ]
  }
}
```

### Accuracy & Performance

- **Overall Accuracy**: ~94.9% across diverse document types
- **Handwritten Content**: 74% improvement over previous version
- **Tables**: Significant improvement in complex table extraction
- **Forms**: Optimized for form field recognition and extraction
- **Compared to Alternatives**:
  - Google Document AI: ~83.4% accuracy
  - Azure OCR: ~89.5% accuracy

### Technical Drawings & Blueprints

Mistral OCR can process:
- **CAD Drawings**: Technical diagrams with annotations
- **Blueprints**: Architectural and engineering drawings
- **Schematics**: Electrical, mechanical, and engineering schematics
- **Engineering Drawings**: Complex technical specifications
- **Limitations**: Specialized documents with unusual fonts may require custom solutions or self-hosting

---

## Mistral API Basics

### Authentication Setup

#### Step 1: Get Your API Key

1. Visit [Mistral AI Platform](https://console.mistral.ai)
2. Sign up or log in to your account
3. Navigate to API Keys section
4. Create a new API key
5. Store it securely (never commit to version control)

#### Step 2: Set Environment Variable

```bash
export MISTRAL_API_KEY="your-api-key-here"
```

Or use a `.env` file (`.env.local` for Next.js):

```env
MISTRAL_API_KEY=your-api-key-here
```

### SDK Installation (TypeScript/Node.js)

```bash
npm install @mistralai/mistralai
```

### Basic SDK Usage

```typescript
import { Mistral } from "@mistralai/mistralai";

const mistral = new Mistral({
  apiKey: process.env["MISTRAL_API_KEY"],
});

// Use the client for API calls
```

### SDK Clients Available

| Language | Package | Repository |
|----------|---------|------------|
| TypeScript/JavaScript | `@mistralai/mistralai` | [mistralai/client-ts](https://github.com/mistralai/client-ts) |
| Python | `mistralai` | [mistralai/client-python](https://github.com/mistralai/client-python) |

### Current Model Names & Capabilities

#### Latest Models (2025)

| Model | Type | Context | Vision | Use Case |
|-------|------|---------|--------|----------|
| `mistral-medium-latest` | General | 128K | Yes | Balanced performance & cost |
| `mistral-small-latest` | Lightweight | 32K | Yes | Fast responses, lower cost |
| `mistral-large-latest` | Advanced | 128K | Yes | Complex reasoning tasks |
| `pixtral-12b-latest` | Vision | 128K | Yes | Image analysis |
| `pixtral-large-latest` | Vision | 128K | Yes | Advanced image analysis |
| `mistral-ocr-2512` | OCR | - | No | Document OCR |
| `mistral-ocr-latest` | OCR | - | No | Latest OCR version |

---

## Vision & Multimodal Capabilities

### Vision Support

Most Mistral models support multimodal input, allowing analysis of images alongside text:

**Supported Models with Vision:**
- Mistral Medium 3.1
- Mistral Small 3.2
- Magistral Small 1.2
- Magistral Medium 1.2
- Pixtral 12B
- Pixtral Large 2411

### Image Input Methods

#### Method 1: Public URL (Recommended)

```typescript
const message = await mistral.messages.create({
  model: "mistral-large-latest",
  messages: [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "What's in this image?",
        },
        {
          type: "image_url",
          imageUrl: {
            url: "https://example.com/image.jpg",
          },
        },
      ],
    },
  ],
});
```

#### Method 2: Base64 Encoding (Local Images)

```typescript
import fs from "fs";
import path from "path";

const imagePath = path.join(process.cwd(), "image.jpg");
const imageBuffer = fs.readFileSync(imagePath);
const base64Image = imageBuffer.toString("base64");

const message = await mistral.messages.create({
  model: "mistral-large-latest",
  messages: [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "What's in this image?",
        },
        {
          type: "image_url",
          imageUrl: {
            url: `data:image/jpeg;base64,${base64Image}`,
          },
        },
      ],
    },
  ],
});
```

### Vision API Limitations

- **Maximum Images per Request**: 8 images
- **Supported Formats**: JPEG, PNG, GIF, WEBP
- **File Size**: Reasonable limits per image apply
- **Use Case**: General image analysis, not specialized OCR (use OCR API for documents)

### Vision vs OCR: When to Use Which

**Use Vision API When:**
- Analyzing general images or screenshots
- Simple image understanding needed
- Cost is secondary to speed
- Complex reasoning about image content
- Maximum 8 images per request is sufficient

**Use OCR API When:**
- Processing documents (PDFs, scans)
- Extracting structured data from documents
- High accuracy text extraction needed
- Table or form field extraction required
- Processing technical drawings/blueprints
- Cost optimization is important (2x cheaper with batch API)

---

## Integration Patterns for Next.js

### Architecture Overview

For a SaaS application processing user-uploaded documents:

```
Client (Next.js Frontend)
    ↓ (upload file)
API Route Handler (Next.js App Router)
    ↓ (validate, convert to base64/URL)
Mistral OCR API
    ↓ (processed document)
Response Handler
    ↓ (store results)
Database
```

### Implementation: Next.js API Route

#### Setup File Structure

```
app/
├── api/
│   └── documents/
│       ├── ocr/
│       │   └── route.ts         # Main OCR endpoint
│       └── status/
│           └── route.ts         # Check job status
├── lib/
│   └── mistral.ts               # Mistral client setup
└── types/
    └── document.ts              # TypeScript types
```

#### 1. Mistral Client Setup (`app/lib/mistral.ts`)

```typescript
import { Mistral } from "@mistralai/mistralai";

if (!process.env.MISTRAL_API_KEY) {
  throw new Error("MISTRAL_API_KEY environment variable not set");
}

export const mistral = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY,
});

export const OCR_MODEL = "mistral-ocr-2512";
```

#### 2. Types (`app/types/document.ts`)

```typescript
export interface OcrRequest {
  documentUrl?: string;
  documentBase64?: string;
  fileName?: string;
  includeImages?: boolean;
  tableFormat?: "html" | "markdown";
}

export interface OcrResponse {
  pages: Array<{
    index: number;
    markdown: string;
    images?: Array<{
      index: number;
      base64?: string;
      bbox: [number, number, number, number];
    }>;
    tables?: Array<{
      index: number;
      html: string;
      markdown: string;
    }>;
  }>;
  model: string;
  usage: {
    pages: number;
  };
}

export interface DocumentProcessingResult {
  id: string;
  fileName: string;
  status: "processing" | "completed" | "failed";
  extractedText: string;
  pageCount: number;
  tables: Array<{ content: string; format: "html" | "markdown" }>;
  images: Array<{ id: string; base64: string; pageIndex: number }>;
  createdAt: Date;
  completedAt?: Date;
  error?: string;
}
```

#### 3. Simple OCR Route (`app/api/documents/ocr/route.ts`)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { mistral, OCR_MODEL } from "@/app/lib/mistral";
import { OcrRequest, OcrResponse } from "@/app/types/document";

export const maxDuration = 60; // Max 60 seconds for serverless function

export async function POST(request: NextRequest) {
  try {
    const body: OcrRequest = await request.json();

    // Validate input
    if (!body.documentUrl && !body.documentBase64) {
      return NextResponse.json(
        { error: "Either documentUrl or documentBase64 is required" },
        { status: 400 }
      );
    }

    // Prepare OCR request
    const ocrRequest = {
      model: OCR_MODEL,
      document: body.documentUrl
        ? {
            type: "document_url" as const,
            document_url: body.documentUrl,
          }
        : {
            type: "document_base64" as const,
            document_base64: body.documentBase64!,
          },
      include_image_base64: body.includeImages ?? false,
      table_format: body.tableFormat ?? "html",
    };

    // Call Mistral OCR API
    const response: OcrResponse = await mistral.ocr.process(ocrRequest);

    // Extract useful data
    const extractedText = response.pages
      .map((page) => page.markdown)
      .join("\n\n---\n\n");

    const allTables = response.pages.flatMap((page) => page.tables || []);
    const allImages = response.pages.flatMap((page, pageIdx) =>
      (page.images || []).map((img) => ({
        ...img,
        pageIndex: page.index,
      }))
    );

    return NextResponse.json({
      fileName: body.fileName || "document",
      pageCount: response.pages.length,
      extractedText,
      tables: allTables,
      images: allImages,
      model: response.model,
      usage: response.usage,
    });
  } catch (error) {
    console.error("OCR processing error:", error);

    if (error instanceof Error) {
      // Check for specific Mistral errors
      if (error.message.includes("429")) {
        return NextResponse.json(
          { error: "Rate limit exceeded. Please try again later." },
          { status: 429 }
        );
      }
      if (error.message.includes("invalid")) {
        return NextResponse.json(
          { error: "Invalid request format" },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to process document" },
      { status: 500 }
    );
  }
}
```

#### 4. Client-Side Usage

```typescript
// app/components/DocumentUpload.tsx
"use client";

import { useState } from "react";

export function DocumentUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);

    try {
      // Convert file to base64
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = (event.target?.result as string).split(",")[1];

        const response = await fetch("/api/documents/ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentBase64: base64,
            fileName: file.name,
            includeImages: true,
            tableFormat: "html",
          }),
        });

        const data = await response.json();
        setResult(data);
      };
      reader.readAsDataURL(file);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleUpload}>
      <input
        type="file"
        accept=".pdf,.png,.jpg,.jpeg"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />
      <button type="submit" disabled={!file || loading}>
        {loading ? "Processing..." : "Process Document"}
      </button>
      {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
    </form>
  );
}
```

### Handling Large Files

#### Strategy 1: Chunked Upload with Base64

For files under 10MB, send base64 directly:

```typescript
const MAX_BASE64_SIZE = 10 * 1024 * 1024; // 10MB

if (base64String.length > MAX_BASE64_SIZE) {
  return NextResponse.json(
    { error: "File too large. Maximum 10MB." },
    { status: 413 }
  );
}
```

#### Strategy 2: URL-Based Processing

Upload to cloud storage first, then process by URL:

```typescript
// Using AWS S3 or similar
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({ region: process.env.AWS_REGION });

const uploadToS3 = async (buffer: Buffer, fileName: string) => {
  const key = `documents/${Date.now()}-${fileName}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      Body: buffer,
    })
  );

  return `https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/${key}`;
};

// Then in OCR handler:
const fileBuffer = await fetch(request.body);
const s3Url = await uploadToS3(fileBuffer, fileName);

const response = await mistral.ocr.process({
  model: OCR_MODEL,
  document: {
    type: "document_url",
    document_url: s3Url,
  },
});
```

#### Strategy 3: Batch Processing (Recommended for 50+ documents)

```typescript
// app/api/documents/batch/route.ts
import { NextRequest, NextResponse } from "next/server";
import { mistral, OCR_MODEL } from "@/app/lib/mistral";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { documentUrls } = body; // Array of document URLs

    // Create batch request
    const batchRequests = documentUrls.map((url: string, index: number) => ({
      custom_id: `doc-${index}`,
      params: {
        model: OCR_MODEL,
        document: {
          type: "document_url",
          document_url: url,
        },
        table_format: "html",
      },
    }));

    // Submit batch job
    const batchJob = await mistral.batch.create({
      requests: batchRequests,
    });

    return NextResponse.json({
      jobId: batchJob.id,
      status: batchJob.status,
      message: "Batch job submitted. Check status with job ID.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Batch submission failed" },
      { status: 500 }
    );
  }
}

// Check batch status
export async function GET(request: NextRequest) {
  try {
    const jobId = request.nextUrl.searchParams.get("jobId");
    if (!jobId) {
      return NextResponse.json(
        { error: "jobId parameter required" },
        { status: 400 }
      );
    }

    const batchStatus = await mistral.batch.retrieve(jobId);
    return NextResponse.json(batchStatus);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to retrieve batch status" },
      { status: 500 }
    );
  }
}
```

---

## Error Handling & Rate Limiting

### Common Error Codes

| Error | HTTP Status | Cause | Solution |
|-------|------------|-------|----------|
| RateLimitError | 429 | Too many requests | Implement backoff retry |
| BadRequestError | 400 | Invalid request format | Validate input before sending |
| UnauthorizedError | 401 | Invalid API key | Check MISTRAL_API_KEY |
| ForbiddenError | 403 | Insufficient permissions | Check account status |
| NotFoundError | 404 | Invalid endpoint/model | Verify model name |
| InternalServerError | 500 | Server error | Retry with exponential backoff |

### Rate Limiting Details

**Organization-Level Rate Limits:**
- Limits are set per organization, not per API key
- Based on your subscription plan
- Measured in requests per minute/hour/day

**Typical Rate Limits:**
- Free tier: Limited requests per day
- Pro tier: Higher rate limits
- Enterprise: Custom limits

### Implementing Exponential Backoff

```typescript
async function callMistralWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelayMs = 1000
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      // Check if it's a rate limit error
      if (error.status !== 429 || attempt === maxRetries - 1) {
        throw error;
      }

      // Exponential backoff: 1s, 2s, 4s, 8s...
      const delayMs = initialDelayMs * Math.pow(2, attempt);
      console.log(`Rate limited. Retrying in ${delayMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error("Max retries exceeded");
}

// Usage
const result = await callMistralWithRetry(() =>
  mistral.ocr.process(ocrRequest)
);
```

### Request Validation Before Sending

```typescript
function validateOcrRequest(
  documentUrl?: string,
  documentBase64?: string
): { valid: boolean; error?: string } {
  if (!documentUrl && !documentBase64) {
    return { valid: false, error: "Document URL or base64 required" };
  }

  if (documentUrl && !documentUrl.startsWith("http")) {
    return { valid: false, error: "Invalid document URL" };
  }

  if (documentBase64 && documentBase64.length > 50 * 1024 * 1024) {
    return { valid: false, error: "Document too large (max 50MB)" };
  }

  return { valid: true };
}
```

### Error Response Handling

```typescript
interface ErrorResponse {
  error: {
    message: string;
    type: string;
    param?: string;
    code?: string;
  };
}

async function handleOcrError(error: any): Promise<NextResponse> {
  console.error("OCR Error:", error);

  if (error.status === 429) {
    return NextResponse.json(
      {
        error: "Rate limit exceeded",
        retryAfter: error.headers?.["retry-after"] || 60,
      },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  if (error.status === 400) {
    return NextResponse.json(
      { error: "Invalid request: " + error.message },
      { status: 400 }
    );
  }

  if (error.status === 401) {
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 401 }
    );
  }

  return NextResponse.json(
    { error: "Document processing failed" },
    { status: 500 }
  );
}
```

---

## Pricing

### Mistral OCR Pricing (2025-2026)

#### Standard Pricing

| Plan | Cost | Discount | Effective Rate |
|------|------|----------|-----------------|
| Pay-as-you-go | $2.00 per 1,000 pages | - | $2.00 |
| Batch API | $2.00 per 1,000 pages | 50% | $1.00 |
| Annotated Pages | $3.00 per 1,000 pages | 50% with batch | $1.50 |

### Cost Examples

**Scenario 1: Processing 100 documents (average 20 pages each)**
- Total pages: 2,000
- Standard API: 2,000 × $2.00 ÷ 1,000 = **$4.00**
- Batch API: 2,000 × $1.00 ÷ 1,000 = **$2.00** (50% savings)

**Scenario 2: Processing 1,000 construction blueprints (average 5 pages)**
- Total pages: 5,000
- Standard API: 5,000 × $2.00 ÷ 1,000 = **$10.00**
- Batch API: 5,000 × $1.00 ÷ 1,000 = **$5.00**

### Comparison with Alternatives

| Service | Per 1000 Pages | Features | Best For |
|---------|----------------|----------|----------|
| Mistral OCR 3 | $1-2 | Text, tables, images, handwriting | Cost-effective, general documents |
| AWS Textract | $1.50-3.00 | Tables, forms, queries | Enterprise AWS users |
| Google Document AI | $3.00-6.00 | Forms, tables, entities | Complex structured extraction |
| Azure OCR | $2.50+ | Forms, tables, layout | Microsoft ecosystem |

### When to Use Batch API

✅ **Use Batch API When:**
- Processing 50+ documents
- Timeline is flexible (can wait hours/days)
- Cost optimization is priority
- Processing recurring/scheduled jobs

❌ **Use Standard API When:**
- Real-time processing needed (< 1 minute)
- Processing individual/small batches
- User-facing synchronous workflow
- Interactive web application

### Free Tier & Trial

- **Free Trial**: Limited trial tokens available (check Mistral console)
- **No Free Tier**: No perpetual free tier; paid plan required
- **Billing**: Pay-as-you-go based on usage (pages processed)

### Cost Optimization Tips

1. **Use Batch API**: Save 50% on large document volumes
2. **Enable include_image_base64 selectively**: Only when needed
3. **Optimize table_format**: Use markdown for simple tables, HTML for complex ones
4. **Combine requests**: Batch multiple documents in single request when possible
5. **Monitor usage**: Track pages processed via Mistral console

---

## Quick Reference

### Base URL
```
https://api.mistral.ai/v1
```

### Install SDK
```bash
npm install @mistralai/mistralai
```

### Initialize Client
```typescript
import { Mistral } from "@mistralai/mistralai";
const mistral = new Mistral({ apiKey: process.env["MISTRAL_API_KEY"] });
```

### OCR Request
```typescript
const response = await mistral.ocr.process({
  model: "mistral-ocr-2512",
  document: {
    type: "document_url",
    document_url: "https://example.com/doc.pdf"
  },
  include_image_base64: true,
  table_format: "html"
});
```

### Vision Request
```typescript
const message = await mistral.messages.create({
  model: "mistral-large-latest",
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: "What's in this?" },
        { type: "image_url", imageUrl: { url: "https://example.com/image.jpg" } }
      ]
    }
  ]
});
```

---

## Resources & Documentation

- [Mistral AI Official Website](https://mistral.ai)
- [Mistral API Documentation](https://docs.mistral.ai)
- [OCR API Endpoint Reference](https://docs.mistral.ai/api/endpoint/ocr)
- [Vision Capabilities Guide](https://docs.mistral.ai/capabilities/vision)
- [TypeScript SDK on npm](https://www.npmjs.com/package/@mistralai/mistralai)
- [TypeScript SDK Repository](https://github.com/mistralai/client-ts)
- [Batch API Documentation](https://docs.mistral.ai/capabilities/batch)
- [Rate Limits & Usage Tiers](https://docs.mistral.ai/deployment/ai-studio/tier)

---

## Changelog

**December 2025**: Mistral OCR 3 released with improved handwriting, forms, and table recognition
**May 2025**: Mistral OCR (25.05) released with markdown output and HTML table reconstruction
**March 2025**: Initial Mistral OCR API launch with public documentation

---

*Last Updated: February 2026*
*Documentation Version: 1.0*
