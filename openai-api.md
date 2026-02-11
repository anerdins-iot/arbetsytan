# OpenAI Image Generation & Embeddings API Reference (2025-2026)

Comprehensive guide to OpenAI's latest image generation capabilities, embeddings, vision analysis, and integration strategies for Next.js SaaS applications.

---

## Table of Contents

1. [Latest Models](#latest-models)
2. [Image Generation API](#image-generation-api)
3. [Image Editing (Inpainting & Outpainting)](#image-editing-inpainting--outpainting)
4. [Image Understanding / Vision](#image-understanding--vision)
5. [Pricing](#pricing)
6. [TypeScript/Node.js SDK](#typescriptnodejs-sdk)
7. [Embeddings API](#embeddings-api)
8. [Integration with Vercel AI SDK](#integration-with-vercel-ai-sdk)
9. [Rate Limits & Best Practices](#rate-limits--best-practices)

---

## Latest Models

### GPT Image Models (New 2025)

As of March 2025, OpenAI has transitioned from DALL-E 3 to the **GPT Image** series, representing a significant advancement in AI image generation.

#### Current Models Available:

- **gpt-image-1.5** (Latest flagship, late 2025)
  - Built on GPT-5 multimodal architecture
  - Excels at understanding complex prompts
  - Produces photorealistic results
  - Supports transparent backgrounds (PNG/WebP output)
  - Quality options: Low, Medium, High (auto)
  - Supported sizes: 1024×1024, 1536×1024 (landscape), 1024×1536 (portrait), auto

- **gpt-image-1** (Current stable)
  - Natively multimodal
  - Ideal for complex, high-fidelity edits
  - Quality options: Low, Medium, High, auto
  - Same size support as gpt-image-1.5

- **gpt-image-1-mini** (Budget-friendly)
  - Lightweight variant for cost-conscious applications
  - Lower quality but significantly cheaper ($0.005-0.006 per image)
  - Good for bulk image generation

- **DALL-E 3** (Legacy, deprecating)
  - Still available via OpenAI API
  - Scheduled deprecation: **May 2, 2026**
  - Access available through dedicated DALL-E GPT
  - Sizes: 1024×1024, 1792×1024, 1024×1792

- **DALL-E 2** (Legacy)
  - Still available for backward compatibility
  - Sizes: 256×256, 512×512, 1024×1024
  - Budget alternative to newer models

### Model Comparison

| Model | Quality | Speed | Cost | Best For |
|-------|---------|-------|------|----------|
| gpt-image-1.5 | Highest | Fast | High | Production, premium features |
| gpt-image-1 | Very High | Fast | High | Complex edits, high-fidelity |
| gpt-image-1-mini | Good | Very Fast | Low | Bulk generation, MVP |
| DALL-E 3 | High | Medium | Medium | Legacy apps, migration period |
| DALL-E 2 | Medium | Medium | Low | Budget apps, simple images |

---

## Image Generation API

### Endpoint

```
POST https://api.openai.com/v1/images/generations
```

### Request Format

```typescript
interface ImageGenerationRequest {
  model: "gpt-image-1.5" | "gpt-image-1" | "gpt-image-1-mini" | "dall-e-3" | "dall-e-2";
  prompt: string;
  n?: number; // Number of images (1-10, default 1)
  size?: "1024x1024" | "1536x1024" | "1024x1536" | "auto";
  quality?: "low" | "medium" | "high" | "auto"; // auto is default
  response_format?: "url" | "b64_json"; // default: "url"
  style?: "natural" | "vivid"; // DALL-E 3 only
  background?: "transparent" | "solid"; // GPT Image models only
}
```

### Response Format

**URL Response (default):**
```json
{
  "created": 1588866183,
  "data": [
    {
      "url": "https://oaidalleapiprodscus.blob.core.windows.net/private/..."
    }
  ]
}
```

**Base64 Response:**
```json
{
  "created": 1588866183,
  "data": [
    {
      "b64_json": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    }
  ]
}
```

### Supported Sizes

#### GPT Image Models (gpt-image-1.5, gpt-image-1, gpt-image-1-mini)
- 1024×1024 (square)
- 1536×1024 (landscape)
- 1024×1536 (portrait)
- "auto" (model selects optimal size)

#### DALL-E 3
- 1024×1024
- 1792×1024 (landscape)
- 1024×1792 (portrait)

#### DALL-E 2
- 256×256 (smallest, fastest)
- 512×512 (medium)
- 1024×1024 (largest)

### Quality Parameter Details

- **auto**: Default. Model automatically selects best quality for given parameters.
- **low**: Fastest generation, lowest cost. Useful for drafts and iterations.
- **medium**: Balanced between speed and quality. Good default for most applications.
- **high**: Best quality, slower generation, higher cost. Use for final outputs.

For **gpt-image-1** and **gpt-image-1.5**:
- Low: ~$0.01-0.02 per image
- Medium: ~$0.04-0.07 per image
- High: ~0.17-0.19 per image

### Special Features

#### Transparent Backgrounds (GPT Image models only)

```typescript
const response = await openai.images.generate({
  model: "gpt-image-1",
  prompt: "A red apple on transparent background",
  size: "1024x1024",
  background: "transparent",
  response_format: "b64_json", // or PNG/WebP format
});
```

---

## Image Editing (Inpainting & Outpainting)

### Inpainting API

Edit specific parts of an image by providing a mask indicating which areas should be replaced.

#### Endpoint
```
POST https://api.openai.com/v1/images/edits
```

#### Request Format

```typescript
interface ImageEditRequest {
  image: File; // PNG image max 4MB
  prompt: string; // Description of what to replace
  mask?: File; // PNG with alpha channel (transparent = replace, opaque = keep)
  model: "gpt-image-1" | "dall-e-2";
  n?: number; // Number of variations (1-10)
  size?: "1024x1024" | "1536x1024" | "1024x1536";
  response_format?: "url" | "b64_json";
}
```

#### Example: Node.js

```typescript
import fs from "fs";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const response = await client.images.edit({
  image: fs.createReadStream("image.png"),
  mask: fs.createReadStream("mask.png"),
  prompt: "Replace the masked area with a blue sky",
  model: "gpt-image-1",
  size: "1024x1024",
});

console.log(response.data[0].url);
```

### Outpainting

Extend the canvas of an image beyond its original boundaries.

**Note:** Outpainting is available in ChatGPT and through selected API endpoints. Direct API support for outpainting via the REST endpoint is limited; it's primarily accessed through ChatGPT or specialized providers.

#### Workaround: Inpainting for Expansion

```typescript
// Create a larger canvas with the original image positioned in the center
// Fill the new areas with a mask
// Use inpainting to generate content for the masked areas
const response = await client.images.edit({
  image: fs.createReadStream("centered-image.png"), // Original image in larger canvas
  mask: fs.createReadStream("expansion-mask.png"), // Mask the new areas
  prompt: "Extend the scene naturally. Include [specific elements]",
  model: "gpt-image-1",
  size: "1536x1024", // Larger than original
});
```

### Image Variations

Generate variations of an existing image without inpainting.

```typescript
const response = await client.images.createVariation({
  image: fs.createReadStream("image.png"),
  model: "dall-e-2", // DALL-E 2 supports variations
  n: 4,
  size: "1024x1024",
});
```

---

## Image Understanding / Vision

### Vision-Enabled Models

OpenAI's latest vision-capable models can analyze and understand images:

- **o-series** (reasoning models)
- **GPT-5** series
- **GPT-4.5**
- **GPT-4o** (most capable, end-to-end multimodal)
- **GPT-4o-mini** (lightweight, cost-effective)

### Vision API Endpoint

```
POST https://api.openai.com/v1/chat/completions
```

### Request Format

```typescript
interface VisionRequest {
  model: "gpt-4o" | "gpt-4o-mini" | "gpt-4-turbo" | "gpt-4";
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: Array<
      | { type: "text"; text: string }
      | {
          type: "image_url";
          image_url: {
            url: string; // https:// or http://
          };
        }
      | {
          type: "image_url";
          image_url: {
            url: string; // base64://[encoded_image]
          };
        }
    >;
  }>;
  max_tokens?: number;
}
```

### Example: Image Analysis

```typescript
const response = await client.messages.create({
  model: "gpt-4o",
  max_tokens: 1024,
  messages: [
    {
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: {
            url: "https://example.com/image.jpg",
          },
        },
        {
          type: "text",
          text: "What is in this image? Describe in detail.",
        },
      ],
    },
  ],
});

console.log(response.content[0].type === "text" ? response.content[0].text : "");
```

### Vision Fine-Tuning (New 2025)

You can now fine-tune GPT-4o with images to customize vision capabilities:

```typescript
const fineTuningJob = await client.fineTuning.jobs.create({
  training_file: "file-training-data-id",
  model: "gpt-4o",
  hyperparameters: {
    batch_size: 8,
    learning_rate_multiplier: 1.0,
    n_epochs: 3,
  },
});
```

### Combining Generation & Vision

Use vision models to analyze generated images or understand user uploads before generating related content:

```typescript
// 1. Analyze uploaded image
const analysis = await client.messages.create({
  model: "gpt-4o-mini",
  max_tokens: 256,
  messages: [
    {
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: {
            url: "https://example.com/user-upload.jpg",
          },
        },
        {
          type: "text",
          text: "What style is this image in?",
        },
      ],
    },
  ],
});

// 2. Use analysis to guide image generation
const style = analysis.content[0].type === "text" ? analysis.content[0].text : "";
const generated = await client.images.generate({
  model: "gpt-image-1",
  prompt: `Generate an image in the style of: ${style}. Show [subject].`,
  size: "1024x1024",
});
```

---

## Pricing

### Image Generation Pricing (2025-2026)

#### GPT Image 1.5 (Latest)
| Quality | 1024×1024 | 1536×1024 / 1024×1536 |
|---------|-----------|----------------------|
| Low | $0.02 | $0.025 |
| Medium | $0.07 | $0.09 |
| High | $0.19 | $0.25 |

#### GPT Image 1
| Quality | Square | Landscape/Portrait |
|---------|--------|-------------------|
| Low | $0.01 | $0.015 |
| Medium | $0.04 | $0.06 |
| High | $0.17 | $0.22 |

#### GPT Image 1 Mini
- Low: $0.005-0.006 per image
- Medium: $0.034-0.05 per image

#### DALL-E 3
| Size | Cost |
|------|------|
| 1024×1024 | $0.04 |
| 1792×1024 / 1024×1792 | $0.08 |

#### DALL-E 2
| Size | Cost |
|------|------|
| 256×256 | $0.016 |
| 512×512 | $0.018 |
| 1024×1024 | $0.020 |

### Embeddings Pricing (2025)

#### Text Embedding Models
| Model | Standard | Batch |
|-------|----------|-------|
| text-embedding-3-small | $0.02 / 1M tokens | $0.01 / 1M tokens |
| text-embedding-3-large | $0.13 / 1M tokens | $0.065 / 1M tokens |
| text-embedding-ada-002 (legacy) | $0.10 / 1M tokens | $0.05 / 1M tokens |

**Key Points:**
- Only input tokens are charged (no output token cost for embeddings)
- Batch pricing offers 50% discount
- Failed API calls are not charged
- No subscription required, pay-as-you-go

---

## TypeScript/Node.js SDK

### Installation

```bash
npm install openai
```

**Requirements:**
- Node.js 20 LTS or later (non-EOL versions)
- TypeScript >= 4.9 (if using TypeScript)

### Configuration

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
```

### Image Generation Examples

#### Basic Generation

```typescript
async function generateImage(prompt: string) {
  const response = await client.images.generate({
    model: "gpt-image-1",
    prompt: prompt,
    n: 1,
    size: "1024x1024",
    quality: "hd",
    response_format: "url",
  });

  return response.data[0].url;
}

// Usage
const imageUrl = await generateImage("A serene mountain landscape at sunset");
console.log(imageUrl);
```

#### With Quality Levels

```typescript
async function generateWithQuality(
  prompt: string,
  quality: "low" | "medium" | "high"
) {
  const qualityMap = {
    low: 0.01,
    medium: 0.07,
    high: 0.19, // gpt-image-1.5 pricing
  };

  console.log(`Generating image (${quality} quality, ~$${qualityMap[quality]})`);

  const response = await client.images.generate({
    model: "gpt-image-1",
    prompt: prompt,
    quality: quality,
    size: "1024x1024",
  });

  return response.data[0].url;
}
```

#### Batch Generation

```typescript
async function generateMultipleImages(
  prompts: string[],
  maxConcurrent: number = 5
) {
  const results: string[] = [];
  const semaphore = new Semaphore(maxConcurrent);

  const promises = prompts.map(async (prompt) => {
    await semaphore.acquire();
    try {
      const response = await client.images.generate({
        model: "gpt-image-1-mini", // Use mini for batch to save costs
        prompt: prompt,
        size: "1024x1024",
        quality: "low",
      });
      results.push(response.data[0].url);
    } finally {
      semaphore.release();
    }
  });

  await Promise.all(promises);
  return results;
}

// Semaphore helper
class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire() {
    if (this.permits > 0) {
      this.permits--;
    } else {
      return new Promise((resolve) => {
        this.waiting.push(() => {
          resolve(void 0);
        });
      });
    }
  }

  release() {
    this.permits++;
    const next = this.waiting.shift();
    if (next) next();
  }
}
```

#### Transparent Background

```typescript
async function generateWithTransparency(prompt: string) {
  const response = await client.images.generate({
    model: "gpt-image-1",
    prompt: prompt,
    size: "1024x1024",
    background: "transparent",
    response_format: "b64_json", // PNG or WebP format
  });

  // Save base64 image
  const imageData = response.data[0].b64_json;
  const buffer = Buffer.from(imageData, "base64");
  // Save to file or send to client
  return buffer;
}
```

#### Image Editing (Inpainting)

```typescript
import fs from "fs";

async function editImage(
  imagePath: string,
  maskPath: string,
  prompt: string
) {
  const response = await client.images.edit({
    image: fs.createReadStream(imagePath),
    mask: fs.createReadStream(maskPath),
    prompt: prompt,
    model: "gpt-image-1",
    size: "1024x1024",
    n: 1,
  });

  return response.data[0].url;
}

// Usage
const editedImage = await editImage(
  "./original.png",
  "./mask.png",
  "Replace the masked area with a beautiful blue sky with white clouds"
);
```

#### Error Handling & Retries

```typescript
async function generateWithRetry(
  prompt: string,
  maxRetries: number = 3,
  baseDelay: number = 1000
) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.images.generate({
        model: "gpt-image-1",
        prompt: prompt,
        size: "1024x1024",
      });
      return response.data[0].url;
    } catch (error: any) {
      if (error.status === 429 && attempt < maxRetries) {
        // Rate limited
        const delayMs = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
        console.log(`Rate limited. Retrying in ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else if (error.status === 500 && attempt < maxRetries) {
        // Server error
        const delayMs = baseDelay * Math.pow(2, attempt - 1);
        console.log(`Server error. Retrying in ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        throw error;
      }
    }
  }
}
```

---

## Embeddings API

### Overview

Embeddings convert text into fixed-size numerical vectors that capture semantic meaning, enabling similarity search, clustering, and recommendation systems.

### Latest Models

#### text-embedding-3-small
- **Dimensions:** 1536 (optimized from original dimensions)
- **Speed:** Very fast
- **Cost:** $0.02 per 1M tokens (standard) / $0.01 per 1M tokens (batch)
- **Quality:** Good for most use cases
- **Best for:** Similarity search, recommendations, RAG systems

#### text-embedding-3-large
- **Dimensions:** 3072 (or reducible to 256 for efficiency)
- **Speed:** Moderate
- **Cost:** $0.13 per 1M tokens (standard) / $0.065 per 1M tokens (batch)
- **Quality:** Highest quality, superior to other models
- **Best for:** High-precision similarity search, fine-grained categorization

#### text-embedding-ada-002 (Legacy)
- **Dimensions:** 1536
- **Cost:** $0.10 per 1M tokens (standard) / $0.05 per 1M tokens (batch)
- **Status:** Still available, but replaced by text-embedding-3 models

### API Endpoint

```
POST https://api.openai.com/v1/embeddings
```

### Request Format

```typescript
interface EmbeddingRequest {
  model: "text-embedding-3-small" | "text-embedding-3-large";
  input: string | string[]; // Text or array of texts
  encoding_format?: "float" | "base64"; // default: "float"
  dimensions?: number; // Optional: reduce dimensions (for text-embedding-3-large)
}
```

### Response Format

```json
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "index": 0,
      "embedding": [0.0023, -0.00234, 0.00123, ...]
    }
  ],
  "model": "text-embedding-3-small",
  "usage": {
    "prompt_tokens": 8,
    "total_tokens": 8
  }
}
```

### TypeScript Examples

#### Basic Embedding

```typescript
async function embedText(text: string) {
  const response = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });

  return response.data[0].embedding;
}

// Usage
const embedding = await embedText("This is a sample sentence");
console.log(embedding); // [0.0023, -0.00234, ...]
```

#### Batch Embeddings

```typescript
async function embedTexts(texts: string[]) {
  const response = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: texts, // Can pass multiple texts at once
  });

  return response.data.map((item) => ({
    index: item.index,
    embedding: item.embedding,
  }));
}

// Usage
const embeddings = await embedTexts([
  "First document",
  "Second document",
  "Third document",
]);
```

#### High-Precision with Dimension Reduction

```typescript
async function embedWithDimensionReduction(text: string) {
  // Use large model for better quality, but reduce dimensions for efficiency
  const response = await client.embeddings.create({
    model: "text-embedding-3-large",
    input: text,
    dimensions: 256, // Reduce from 3072 to 256 dimensions
  });

  return response.data[0].embedding;
}
```

### Text Chunking Strategies

Before embedding long documents, chunk them to optimize quality and cost.

#### Recursive Character Splitting

```typescript
interface ChunkConfig {
  chunkSize: number;
  chunkOverlap: number;
}

function recursiveCharacterSplit(
  text: string,
  config: ChunkConfig = { chunkSize: 800, chunkOverlap: 200 }
): string[] {
  const { chunkSize, chunkOverlap } = config;
  const chunks: string[] = [];

  let start = 0;
  while (start < text.length) {
    let end = start + chunkSize;

    // Try to break at a natural boundary (newline)
    if (end < text.length) {
      const lastNewline = text.lastIndexOf("\n", end);
      if (lastNewline > start) {
        end = lastNewline;
      } else {
        // Fall back to space
        const lastSpace = text.lastIndexOf(" ", end);
        if (lastSpace > start) {
          end = lastSpace;
        }
      }
    }

    chunks.push(text.substring(start, end).trim());
    start = end - chunkOverlap;
  }

  return chunks.filter((chunk) => chunk.length > 0);
}

// Usage
const text = `Long document text...`;
const chunks = recursiveCharacterSplit(text, {
  chunkSize: 800,
  chunkOverlap: 200,
});

console.log(`Split into ${chunks.length} chunks`);
```

#### Semantic Chunking (Advanced)

```typescript
async function semanticChunk(
  text: string,
  maxChunkSize: number = 800,
  similarityThreshold: number = 0.8
): Promise<string[]> {
  // Split into sentences
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const chunks: string[] = [];
  let currentChunk = sentences[0];

  for (let i = 1; i < sentences.length; i++) {
    const candidate = currentChunk + ". " + sentences[i];

    if (candidate.length > maxChunkSize) {
      chunks.push(currentChunk);
      currentChunk = sentences[i];
    } else {
      // Optionally: check semantic similarity
      // For now, just combine if under size limit
      currentChunk = candidate;
    }
  }

  if (currentChunk) chunks.push(currentChunk);

  return chunks;
}
```

### PostgreSQL & pgvector Integration

#### Setup

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create embeddings table
CREATE TABLE documents (
  id BIGSERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  embedding vector(1536),
  created_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB
);

-- Create index for similarity search
CREATE INDEX ON documents USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

#### Store Embeddings

```typescript
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

async function storeEmbedding(
  content: string,
  metadata?: Record<string, any>
) {
  // Generate embedding
  const embedding = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: content,
  });

  const vector = embedding.data[0].embedding;

  // Store in PostgreSQL
  const { data, error } = await supabase.from("documents").insert([
    {
      content,
      embedding: vector,
      metadata: metadata || {},
    },
  ]);

  if (error) throw error;
  return data;
}
```

#### Similarity Search

```typescript
async function similaritySearch(
  query: string,
  limit: number = 5,
  threshold: number = 0.7
) {
  // Embed the query
  const queryEmbedding = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });

  const vector = queryEmbedding.data[0].embedding;

  // Search in PostgreSQL
  const { data, error } = await supabase.rpc("match_documents", {
    query_embedding: vector,
    match_threshold: threshold,
    match_count: limit,
  });

  if (error) throw error;
  return data;
}

// SQL function for RPC
/*
CREATE FUNCTION match_documents(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
) RETURNS TABLE(
  id bigint,
  content text,
  similarity float
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.content,
    1 - (d.embedding <=> query_embedding) as similarity
  FROM documents d
  WHERE 1 - (d.embedding <=> query_embedding) > match_threshold
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;
*/
```

#### pgai Vectorizer (Automatic Embedding)

PostgreSQL's pgai Vectorizer automatically generates and maintains embeddings:

```sql
-- Enable pgai extension
CREATE EXTENSION IF NOT EXISTS pgai;

-- Create vectorizer for automatic embeddings
SELECT pgai.create_vectorizer(
  name := 'document_vectorizer',
  relation := 'documents'::regclass,
  column := 'content',
  embedding := 'openai.text-embedding-3-small',
  chunk_size := 800,
  chunk_overlap := 200,
  dimensions := 1536
);
```

Benefits:
- Automatically generate embeddings on INSERT/UPDATE
- Declarative configuration
- Handles chunking with configurable overlap
- Maintains embeddings in sync with source data

---

## Integration with Vercel AI SDK

### Image Generation with AI SDK

The Vercel AI SDK provides unified interfaces for image generation across providers.

#### Installation

```bash
npm install ai openai
```

#### Basic Usage

```typescript
import { generateImage } from "ai";

async function generateWithAISDK(prompt: string) {
  const image = await generateImage({
    prompt: prompt,
    model: openai.image("gpt-image-1"),
    size: "1024x1024",
  });

  return image.url;
}
```

#### With Streaming (Server Component)

```typescript
"use server";

import { generateImage } from "ai";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateImageAction(prompt: string) {
  const result = await generateImage({
    model: "openai/gpt-image-1",
    prompt: prompt,
    size: "1024x1024",
    quality: "standard",
  });

  return {
    url: result.url,
    revised_prompt: result.revised_prompt,
  };
}
```

#### With Tools in Chat Models

Some GPT models (like gpt-5.1) support image generation via tools:

```typescript
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

const response = await generateText({
  model: openai("gpt-5.1-instant"),
  tools: {
    generateImage: {
      description: "Generate an image based on the user's request",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "Description of the image to generate",
          },
          style: {
            type: "string",
            enum: ["photorealistic", "artistic", "cartoon"],
          },
        },
        required: ["prompt"],
      },
    },
  },
  prompt: "Generate an image of a sunset over mountains",
});
```

#### Image Editing Support (AI SDK 6+)

The Vercel AI SDK 6+ extends `generateImage` to support image editing:

```typescript
import { generateImage } from "ai";
import { openai } from "@ai-sdk/openai";

const editedImage = await generateImage({
  model: openai.image("gpt-image-1"),
  prompt: "Change the sky to deep purple",
  image: {
    reference: "https://example.com/original.jpg", // Reference image for editing
    format: "base64", // or "url"
  },
});
```

### Current Limitations

- Vercel AI SDK uses `gpt-image-1` backend
- Image generation returns **base64-encoded** strings in tool results
- Direct vision/analysis is handled through the chat API, not image generation
- Rate limits and pricing apply as per OpenAI's standard

---

## Rate Limits & Best Practices

### Rate Limit Types

OpenAI implements two types of limits:

1. **RPM (Requests Per Minute):** Number of API calls per minute
2. **TPM (Tokens Per Minute):** Number of tokens processed per minute

### Free/Trial Accounts
- Image generation: Limited usage
- Embeddings: Limited TPM
- Typical free tier: 20 RPM / 150,000 TPM

### Paid Accounts
- Image generation: Generally permissive (based on account usage)
- Embeddings: Higher TPM limits
- Exact limits vary by usage pattern and account age

### Retry Strategy with Exponential Backoff

```typescript
async function apiCallWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const statusCode = error.status;
      const isRetryable = statusCode === 429 || statusCode >= 500;

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      // Exponential backoff with jitter
      const delayMs =
        baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;

      console.log(
        `Attempt ${attempt} failed (${statusCode}). Retrying in ${delayMs.toFixed(0)}ms...`
      );

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error("Should not reach here");
}

// Usage
const imageUrl = await apiCallWithRetry(
  () =>
    client.images.generate({
      model: "gpt-image-1",
      prompt: "A beautiful landscape",
      size: "1024x1024",
    }),
  3,
  1000
);
```

### Client-Side Rate Limiting (Semaphore)

```typescript
class RateLimiter {
  private permits: number;
  private waiting: Array<() => void> = [];
  private requestTimes: number[] = [];
  private maxRequestsPerMinute: number;

  constructor(maxRequestsPerMinute: number = 20) {
    this.permits = maxRequestsPerMinute;
    this.maxRequestsPerMinute = maxRequestsPerMinute;
  }

  async acquire() {
    const now = Date.now();

    // Clean up old request times (older than 1 minute)
    this.requestTimes = this.requestTimes.filter((time) => now - time < 60000);

    if (this.requestTimes.length < this.maxRequestsPerMinute) {
      this.requestTimes.push(now);
      return; // Proceed immediately
    }

    // Wait until a request slot becomes available
    const oldestRequest = this.requestTimes[0];
    const waitTime = 60000 - (now - oldestRequest);

    console.log(`Rate limit approaching. Waiting ${waitTime}ms...`);
    await new Promise((resolve) => setTimeout(resolve, waitTime));

    this.requestTimes.push(Date.now());
  }
}

// Usage
const limiter = new RateLimiter(15); // 15 requests per minute

async function generateImageWithRateLimit(prompt: string) {
  await limiter.acquire();

  const response = await client.images.generate({
    model: "gpt-image-1",
    prompt: prompt,
    size: "1024x1024",
  });

  return response.data[0].url;
}
```

### Concurrent Requests Management

```typescript
async function generateBatchImages(
  prompts: string[],
  maxConcurrentRequests: number = 5
) {
  const limiter = new RateLimiter(15);
  const results: string[] = [];
  const errors: Array<{ prompt: string; error: any }> = [];

  // Create a queue of operations
  const queue = prompts.map((prompt) => async () => {
    try {
      await limiter.acquire();
      const response = await client.images.generate({
        model: "gpt-image-1-mini", // Use mini for cost efficiency
        prompt: prompt,
        size: "1024x1024",
      });
      results.push(response.data[0].url);
    } catch (error) {
      errors.push({ prompt, error });
    }
  });

  // Execute with concurrency limit
  let running = 0;
  const execute = async () => {
    while (queue.length > 0) {
      if (running < maxConcurrentRequests) {
        running++;
        const operation = queue.shift();
        if (operation) {
          operation().finally(() => {
            running--;
          });
        }
      } else {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  };

  await execute();

  return { results, errors };
}
```

### Monitoring and Alerting

```typescript
interface APIMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTokens: number;
  estimatedCost: number;
  rateLimitHits: number;
}

class APIMonitor {
  private metrics: APIMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalTokens: 0,
    estimatedCost: 0,
    rateLimitHits: 0,
  };

  recordSuccess(tokens: number, cost: number) {
    this.metrics.totalRequests++;
    this.metrics.successfulRequests++;
    this.metrics.totalTokens += tokens;
    this.metrics.estimatedCost += cost;
  }

  recordFailure(error: any) {
    this.metrics.totalRequests++;
    this.metrics.failedRequests++;

    if (error.status === 429) {
      this.metrics.rateLimitHits++;
      console.warn("⚠️ Rate limit hit");

      // Alert if too many rate limits
      if (this.metrics.rateLimitHits > 5) {
        console.error("🚨 Multiple rate limit hits detected");
        // Send alert to monitoring system
      }
    }
  }

  getMetrics(): APIMetrics {
    return { ...this.metrics };
  }

  reset() {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalTokens: 0,
      estimatedCost: 0,
      rateLimitHits: 0,
    };
  }
}
```

### Best Practices Summary

1. **Always use exponential backoff** for retries with random jitter
2. **Implement client-side rate limiting** to prevent hitting API limits
3. **Honor Retry-After headers** from API responses
4. **Batch requests when possible** to optimize cost
5. **Use appropriate models for use cases:**
   - `gpt-image-1-mini` for bulk/draft generation
   - `gpt-image-1` for standard quality
   - `gpt-image-1.5` for production/premium
   - `text-embedding-3-small` for most embedding needs
6. **Cache embeddings** for frequently queried documents
7. **Monitor metrics** to catch issues early
8. **Use batch API** for non-real-time embedding jobs (50% cost savings)
9. **Implement request queuing** for high-volume applications
10. **Set realistic max_tokens** to avoid unnecessary token consumption

---

## Resources

- [OpenAI API Documentation](https://platform.openai.com/docs)
- [OpenAI Models](https://platform.openai.com/docs/models)
- [OpenAI Image Generation Guide](https://platform.openai.com/docs/guides/image-generation)
- [OpenAI Vision Guide](https://platform.openai.com/docs/guides/vision)
- [OpenAI Embeddings Guide](https://platform.openai.com/docs/guides/embeddings)
- [OpenAI Rate Limits](https://platform.openai.com/docs/guides/rate-limits)
- [OpenAI TypeScript SDK](https://www.npmjs.com/package/openai)
- [Vercel AI SDK Documentation](https://vercel.com/docs/ai-sdk)
