---
title: Vercel AI SDK 6
description: Komplett guide till Vercel AI SDK v6 - streamText, generateText, useChat, tool-definitions och provider-integration
tags: [ai, vercel, openai, anthropic, streaming, tools, llm]
---

## Installation

```bash
npm install ai @ai-sdk/openai @ai-sdk/anthropic
```

**Aktuell version:** 6.0.26+ (stabil)

**OBS:** Undvik version 6.0.40 som har kända problem med Zod 4 och Anthropic.

---

## KRITISKT - Breaking Changes i v6

**Migration:** Kör `npx @ai-sdk/codemod v6` för automatisk uppgradering från v5.

**Ny Agent abstraction** i v6 för att bygga AI-agenter med multi-step reasoning och tool execution loops.

### 1. useChat transport parameter

> ⚠️ **OBLIGATORISKT:** `useChat` använder inte längre `api` parameter. Använd `transport` istället.

```typescript
// ❌ Fungerar INTE i v6
useChat({
  api: '/api/custom-chat',
})

// ✅ Korrekt i v6
import { DefaultChatTransport } from 'ai'

useChat({
  transport: new DefaultChatTransport('/api/custom-chat'),
})
```

### 2. Tool-definitioner: inputSchema ersätter parameters

> ⚠️ **OBLIGATORISKT:** `parameters` är borttaget. Använd `inputSchema` med Zod eller JSON Schema.

```typescript
// ❌ Gammalt (v5)
tools: {
  getWeather: {
    description: 'Get weather for a location',
    parameters: z.object({
      location: z.string(),
    }),
    execute: async ({ location }) => { ... },
  },
}

// ✅ Nytt (v6)
tools: {
  getWeather: {
    description: 'Get weather for a location',
    inputSchema: z.object({
      location: z.string(),
    }),
    execute: async ({ location }) => { ... },
  },
}
```

**Varför?** AI SDK v6 alignerar med Model Context Protocol (MCP) som använder `inputSchema` som standard.

---

## Providers Setup

### OpenAI

```typescript
// lib/ai.ts
import { openai } from '@ai-sdk/openai'
import { createOpenAI } from '@ai-sdk/openai'

// Standard provider (använder OPENAI_API_KEY env)
export const model = openai('gpt-4o')

// Custom configuration
export const customProvider = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://api.openai.com/v1', // Eller egen proxy
  compatibility: 'strict', // eller 'compatible'
})

export const customModel = customProvider('gpt-4o-mini')
```

**Tillgängliga modeller:**
- `gpt-4o` - Multimodal, snabb (<300ms response time)
- `gpt-4o-mini` - Snabbare och billigare
- `gpt-4.5` - Största och mest kapabla, bra för kreativa och agentic tasks
- `o1` - Reasoning-modell med reinforcement learning
- `o3` - Kraftfullaste reasoning-modellen (kod, matte, vetenskap)
- `o4-mini` - Reasoning till lägre kostnad

### Anthropic

```typescript
// lib/ai.ts
import { anthropic } from '@ai-sdk/anthropic'
import { createAnthropic } from '@ai-sdk/anthropic'

// Standard provider (använder ANTHROPIC_API_KEY env)
export const model = anthropic('claude-sonnet-4-5-20250929')

// Custom configuration
export const customProvider = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: 'https://api.anthropic.com/v1',
})

export const customModel = customProvider('claude-opus-4-6')
```

**Tillgängliga modeller:**
- `claude-opus-4-6` - Mest kapabel
- `claude-sonnet-4-5-20250929` - Balanserad
- `claude-haiku-4-5-20251001` - Snabbast och billigast

### Andra Providers

AI SDK stödjer 15+ providers:

- **Google**: Vertex AI + Generative AI (`@ai-sdk/google`)
- **Mistral**: `@ai-sdk/mistral`
- **AWS Bedrock**: `@ai-sdk/amazon-bedrock`
- **Groq**: `@ai-sdk/groq`
- **Azure OpenAI**: `@ai-sdk/azure`
- **Meta**: Llama-modeller via Bedrock eller Groq
- **xAI**: Grok-modeller
- **DeepSeek**: `@ai-sdk/deepseek`
- **Cohere**: `@ai-sdk/cohere`
- **Perplexity**: `@ai-sdk/perplexity`
- **Alibaba**: Qwen-modeller

**OpenAI-kompatibla providers** stöds via `createOpenAI()` med custom `baseURL`.

**AI Gateway som unified interface:**

```typescript
import { registry } from 'ai'

const model = registry.languageModel('anthropic/claude-opus-4.5')
// eller
const model = registry.languageModel('openai/gpt-4.5')
```

**Provider Registry för att mixa providers:**

```typescript
import { experimental_createProviderRegistry as createProviderRegistry } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'

export const registry = createProviderRegistry({
  anthropic,
  openai,
})

// Använd olika providers i samma app
const claudeModel = registry.languageModel('anthropic:claude-opus-4-6')
const gptModel = registry.languageModel('openai:gpt-4.5')
```

### Miljövariabler (.env.local)

```bash
# OpenAI
OPENAI_API_KEY=sk-...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Gemini (Google)
GOOGLE_GENERATIVE_AI_API_KEY=...

# Ollama (lokal)
OLLAMA_BASE_URL=http://localhost:11434
```

---

## streamText (Server-side Streaming)

### Grundläggande användning

```typescript
// app/api/chat/route.ts
import { openai } from '@ai-sdk/openai'
import { streamText } from 'ai'

export async function POST(req: Request) {
  const { messages } = await req.json()

  const result = streamText({
    model: openai('gpt-4o'),
    messages,
  })

  return result.toDataStreamResponse()
}
```

### Med system prompt

```typescript
import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'

const result = streamText({
  model: openai('gpt-4o'),
  system: 'Du är en hjälpsam AI-assistent som svarar på svenska.',
  messages,
})
```

### Med temperatur och max tokens

```typescript
const result = streamText({
  model: openai('gpt-4o'),
  messages,
  temperature: 0.7,      // 0-2 (högre = mer kreativ)
  maxTokens: 1000,       // Max antal tokens i svar
  topP: 0.9,             // Nucleus sampling
  frequencyPenalty: 0.5, // Minska upprepningar
  presencePenalty: 0.5,  // Uppmuntra nya ämnen
})
```

---

## generateText (Non-streaming)

```typescript
// app/actions/generate.ts
'use server'

import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'

export async function generateSummary(text: string) {
  const { text: summary } = await generateText({
    model: openai('gpt-4o-mini'),
    prompt: `Sammanfatta följande text:\n\n${text}`,
    maxTokens: 200,
  })

  return summary
}
```

### Med structured output

```typescript
import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

const result = await generateText({
  model: openai('gpt-4o'),
  prompt: 'Extrahera namn, e-post och telefon från: "John Doe, john@example.com, 070-123456"',
  output: 'structured',
  schema: z.object({
    name: z.string(),
    email: z.string().email(),
    phone: z.string(),
  }),
})

console.log(result.object)
// { name: 'John Doe', email: 'john@example.com', phone: '070-123456' }
```

---

## useChat (React Hook)

### Grundläggande client-side chat

```typescript
// app/chat/page.tsx
'use client'

import { useChat } from 'ai/react'

export default function ChatPage() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat()

  return (
    <div>
      <div className="messages">
        {messages.map((m) => (
          <div key={m.id} className={m.role}>
            <strong>{m.role === 'user' ? 'Du' : 'AI'}:</strong>
            <p>{m.content}</p>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={handleInputChange}
          disabled={isLoading}
          placeholder="Skriv ett meddelande..."
        />
        <button type="submit" disabled={isLoading}>
          Skicka
        </button>
      </form>
    </div>
  )
}
```

### Custom API-endpoint med transport

```typescript
'use client'

import { useChat } from 'ai/react'
import { DefaultChatTransport } from 'ai'

export default function CustomChatPage() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    transport: new DefaultChatTransport('/api/custom-chat'),
  })

  return (/* ... */)
}
```

### Custom request preparation

```typescript
import { useChat, prepareSendMessagesRequest } from 'ai/react'

const { messages, input, handleInputChange, handleSubmit } = useChat({
  transport: new DefaultChatTransport({
    url: '/api/chat',
    prepareSendMessagesRequest: (messages, extraData) => {
      return {
        messages,
        userId: extraData.userId,
        customHeader: 'value',
      }
    },
  }),
})
```

### useChat options

| Parameter | Beskrivning |
|-----------|-------------|
| `transport` | Transport för API-anrop (ersätter `api`) |
| `initialMessages` | Förladdade meddelanden |
| `id` | Chat-ID för att spara/återställa konversation |
| `body` | Extra data i requests |
| `onFinish` | Callback när svar är klart |
| `onError` | Felhanterare |
| `onResponse` | Callback för varje streaming-chunk |

---

## Tools (Function Calling)

### Tool-definition med inputSchema

```typescript
// app/api/chat/route.ts
import { openai } from '@ai-sdk/openai'
import { streamText } from 'ai'
import { z } from 'zod'

export async function POST(req: Request) {
  const { messages } = await req.json()

  const result = streamText({
    model: openai('gpt-4o'),
    messages,
    tools: {
      getWeather: {
        description: 'Get current weather for a location',
        inputSchema: z.object({
          location: z.string().describe('City name'),
          unit: z.enum(['celsius', 'fahrenheit']).optional(),
        }),
        execute: async ({ location, unit = 'celsius' }) => {
          // Anropa väder-API
          const weather = await fetchWeather(location, unit)
          return {
            temperature: weather.temp,
            conditions: weather.conditions,
          }
        },
      },
      searchDatabase: {
        description: 'Search for users in the database',
        inputSchema: z.object({
          query: z.string(),
          limit: z.number().min(1).max(100).default(10),
        }),
        execute: async ({ query, limit }) => {
          const users = await db.users.search(query, limit)
          return users
        },
      },
    },
  })

  return result.toDataStreamResponse()
}
```

### Tool execution mode

```typescript
const result = streamText({
  model: openai('gpt-4o'),
  messages,
  tools,
  toolChoice: 'auto',  // 'auto' | 'required' | 'none' | { type: 'tool', toolName: 'getWeather' }
  maxSteps: 5,          // Max antal tool-anrop i en kedja
})
```

### Med JSON Schema istället för Zod

```typescript
tools: {
  getTodo: {
    description: 'Get a todo item by ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Todo ID' },
      },
      required: ['id'],
    },
    execute: async ({ id }) => {
      return await db.todos.findById(id)
    },
  },
}
```

**VIKTIGT:** Undvik tom `inputSchema` med Anthropic-modeller. Om verktyget inte har input, använd ett dummy-fält:

```typescript
// ❌ Ger 400-fel med Anthropic
inputSchema: z.object({})

// ✅ Använd dummy-fält istället
inputSchema: z.object({
  _unused: z.literal('none').optional(),
})
```

---

## Zod 4 Kompatibilitetsproblem

> ⚠️ **VARNING:** AI SDK 6.0.40 har kända problem med Zod v4 och Anthropic.

### Problem 1: ZodFirstPartyTypeKind export saknas

**Symptom:** `ZodFirstPartyTypeKind is not exported from zod`

**Lösning:** Använd AI SDK **6.0.26** som är stabil med Zod 4.

```bash
npm install ai@6.0.26
```

### Problem 2: Enum-scheman ger Anthropic-fel

**Symptom:** `schema must be JSON Schema of 'type: object'`

**Lösning:** Wrappa enums i ett objekt:

```typescript
// ❌ Orsakar fel med Anthropic
inputSchema: z.enum(['celsius', 'fahrenheit'])

// ✅ Använd objekt med enum-fält
inputSchema: z.object({
  unit: z.enum(['celsius', 'fahrenheit']),
})
```

### Problem 3: Tom inputSchema

**Symptom:** 400-fel med Anthropic när verktyg har tom `inputSchema`

**Lösning:** Lägg till ett valfritt dummy-fält:

```typescript
inputSchema: z.object({
  _unused: z.literal('none').optional(),
})
```

**Rekommendation:** Använd AI SDK **6.0.26** och undvik 6.0.40+ tills problemen är lösta.

---

## Server Actions med AI SDK

### Generera text i Server Action

```typescript
// app/actions/ai.ts
'use server'

import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { auth } from '@/lib/auth'

export async function generateResponse(prompt: string) {
  const session = await auth()
  if (!session?.user) {
    throw new Error('Unauthorized')
  }

  const { text } = await generateText({
    model: openai('gpt-4o-mini'),
    prompt,
    maxTokens: 500,
  })

  return text
}
```

### Streaming från Server Action

```typescript
'use server'

import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { createStreamableValue } from 'ai/rsc'

export async function generateStream(prompt: string) {
  const stream = createStreamableValue('')

  ;(async () => {
    const { textStream } = streamText({
      model: openai('gpt-4o'),
      prompt,
    })

    for await (const chunk of textStream) {
      stream.update(chunk)
    }

    stream.done()
  })()

  return { output: stream.value }
}
```

### Client-side användning av stream

```typescript
'use client'

import { readStreamableValue } from 'ai/rsc'
import { generateStream } from './actions/ai'
import { useState } from 'react'

export function StreamingComponent() {
  const [output, setOutput] = useState('')

  async function handleGenerate() {
    const { output: stream } = await generateStream('Skriv en dikt')

    for await (const chunk of readStreamableValue(stream)) {
      setOutput((prev) => prev + chunk)
    }
  }

  return (
    <div>
      <button onClick={handleGenerate}>Generera</button>
      <p>{output}</p>
    </div>
  )
}
```

---

## Multimodal (Vision)

### Bildanalys med OpenAI

```typescript
import { openai } from '@ai-sdk/openai'
import { generateText } from 'ai'

const { text } = await generateText({
  model: openai('gpt-4o'),
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Vad finns på bilden?' },
        { type: 'image', image: 'https://example.com/image.jpg' },
      ],
    },
  ],
})

console.log(text) // "På bilden syns en katt som sitter på ett bord..."
```

### Base64-kodad bild

```typescript
const imageBuffer = await fs.readFile('image.jpg')
const base64Image = imageBuffer.toString('base64')

const { text } = await generateText({
  model: openai('gpt-4o'),
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Beskriv bilden' },
        { type: 'image', image: `data:image/jpeg;base64,${base64Image}` },
      ],
    },
  ],
})
```

---

## Exempel

### Chatbot med konversationshistorik

```typescript
// app/api/chat/route.ts
import { openai } from '@ai-sdk/openai'
import { streamText } from 'ai'

export async function POST(req: Request) {
  const { messages } = await req.json()

  const result = streamText({
    model: openai('gpt-4o'),
    system: `Du är en hjälpsam AI-assistent. Svara alltid på svenska.

Regler:
- Var koncis och tydlig
- Om du inte vet något, säg det
- Använd formaterad text när det är lämpligt`,
    messages,
    temperature: 0.7,
    maxTokens: 2000,
  })

  return result.toDataStreamResponse()
}
```

### RAG (Retrieval-Augmented Generation)

```typescript
'use server'

import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { embed } from 'ai'

export async function answerQuestion(question: string) {
  // 1. Hämta relevanta dokument från vektordatabas
  const embedding = await embed({
    model: openai.embedding('text-embedding-3-small'),
    value: question,
  })

  const relevantDocs = await vectorDB.search(embedding.embedding, { limit: 3 })

  // 2. Generera svar baserat på dokument
  const { text } = await generateText({
    model: openai('gpt-4o'),
    prompt: `Använd följande dokument för att svara på frågan.

Dokument:
${relevantDocs.map((doc) => doc.content).join('\n\n')}

Fråga: ${question}

Svar baserat på dokumenten:`,
  })

  return text
}
```

### JSON-extrahering

```typescript
import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

const extractionSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  phone: z.string(),
  company: z.string().optional(),
})

export async function extractContactInfo(text: string) {
  const { object } = await generateText({
    model: openai('gpt-4o'),
    prompt: `Extrahera kontaktinformation från följande text:\n\n${text}`,
    output: 'structured',
    schema: extractionSchema,
  })

  return object
}
```

### Multi-step reasoning med tools

```typescript
import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

const result = streamText({
  model: openai('gpt-4o'),
  prompt: 'Vad är vädret i Stockholm och hur många grader kallare är det i Oslo?',
  tools: {
    getWeather: {
      description: 'Get current weather',
      inputSchema: z.object({
        city: z.string(),
      }),
      execute: async ({ city }) => {
        const weather = await fetchWeather(city)
        return { temperature: weather.temp, conditions: weather.conditions }
      },
    },
    calculate: {
      description: 'Perform mathematical calculation',
      inputSchema: z.object({
        expression: z.string().describe('Math expression like "20 - 15"'),
      }),
      execute: async ({ expression }) => {
        // eslint-disable-next-line no-eval
        return eval(expression)
      },
    },
  },
  maxSteps: 5, // Tillåt flera tool-anrop i kedja
})

// Modellen kommer:
// 1. Anropa getWeather för Stockholm
// 2. Anropa getWeather för Oslo
// 3. Anropa calculate med temperaturskillnaden
// 4. Returnera slutsvar
```

---

## Rate Limiting & Error Handling

### Grundläggande felhantering

```typescript
import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'

export async function POST(req: Request) {
  try {
    const { messages } = await req.json()

    const result = streamText({
      model: openai('gpt-4o'),
      messages,
    })

    return result.toDataStreamResponse()
  } catch (error) {
    console.error('AI generation error:', error)

    return new Response(
      JSON.stringify({ error: 'Ett fel uppstod vid generering' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
```

### Med retry-logik

```typescript
async function generateWithRetry(prompt: string, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await generateText({
        model: openai('gpt-4o-mini'),
        prompt,
      })
    } catch (error) {
      if (i === maxRetries - 1) throw error
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)))
    }
  }
}
```

### Rate limiting med Upstash

```typescript
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '1 m'), // 10 requests per minut
})

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for') ?? 'anonymous'
  const { success } = await ratelimit.limit(ip)

  if (!success) {
    return new Response('Too many requests', { status: 429 })
  }

  // ... fortsätt med AI-generering
}
```

---

## Relaterade docs

- **Zod** (`/workspace/docs/zod.md`): Tool `inputSchema` använder Zod för validering, se Zod 4 för schemas och refinements
- **Next.js** (`/workspace/docs/nextjs.md`): API routes och Server Actions, `export const dynamic = 'force-dynamic'` för AI-endpoints
- **Stripe** (`/workspace/docs/stripe.md`): Kombinera AI-generering med betalningar, t.ex. "credits" för AI-anrop

---

## Referenser

- [AI SDK Documentation](https://sdk.vercel.ai/docs)
- [AI SDK v6 Migration Guide](https://sdk.vercel.ai/docs/migrations/upgrade-to-v6)
- [AI SDK Examples](https://sdk.vercel.ai/examples)
- [OpenAI Provider](https://sdk.vercel.ai/providers/openai)
- [Anthropic Provider](https://sdk.vercel.ai/providers/anthropic)
- [AI SDK GitHub](https://github.com/vercel/ai)
