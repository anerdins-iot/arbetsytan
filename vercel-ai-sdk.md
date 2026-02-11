# Vercel AI SDK - Comprehensive Guide

**Last Updated:** February 2026
**Scope:** AI SDK v6 and latest developments

---

## Table of Contents

1. [Overview](#overview)
2. [Provider System](#provider-system)
3. [Streaming](#streaming)
4. [Tool Use & Function Calling](#tool-use--function-calling)
5. [React Hooks: useChat & useCompletion](#react-hooks-usechat--usecompletion)
6. [Structured Output](#structured-output)
7. [Multi-Modal Capabilities](#multi-modal-capabilities)
8. [Advanced Claude Features](#advanced-claude-features)
9. [Middleware & Customization](#middleware--customization)
10. [Vercel AI SDK vs Direct API Usage](#vercel-ai-sdk-vs-direct-api-usage)
11. [Next.js App Router Integration](#nextjs-app-router-integration)
12. [Mistral OCR & Special Capabilities](#mistral-ocr--special-capabilities)

---

## Overview

### What is Vercel AI SDK?

The **Vercel AI SDK** (npm package: `ai`) is a free, open-source TypeScript library created by the makers of Next.js for building AI-powered applications and agents. It provides a unified abstraction layer that simplifies working with multiple AI providers through a single, consistent API.

### Latest Version: AI SDK 6 (2025)

Released in 2025, **AI SDK 6** introduces major architectural improvements:
- **Agent Abstraction**: A clean interface for defining and reusing AI agents
- **Human-in-the-Loop Approval**: Tool execution approval workflows
- **DevTools**: Built-in developer tools for debugging and monitoring
- **Full MCP Support**: Complete Model Context Protocol integration
- **Reranking**: Native support for reranking capabilities
- **Image Editing**: Direct image manipulation support
- **Unified generateObject + generateText**: Tool calling with structured output in a single loop

### AI SDK 5 (July 2025)

Previous major release featuring:
- Type-safe chat
- Agentic loop control
- Tool enhancements
- Speech generation
- Transport-based architecture

### How It Works

The SDK acts as a unified abstraction layer that:
1. Standardizes API calls across different AI providers (Claude, OpenAI, Mistral, Google, etc.)
2. Handles streaming, buffering, and real-time responses
3. Provides type-safe tool calling with automatic validation
4. Integrates seamlessly with React and Next.js for frontend streaming
5. Supports multi-step agentic reasoning with tool execution

---

## Provider System

### Overview

The SDK uses the **Vercel AI Gateway** by default, providing access to all major providers without additional SDK setup. Alternatively, you can install provider-specific packages for direct provider integration.

### Default: Vercel AI Gateway

No additional configuration needed. Use model strings like:
```javascript
import { generateText } from 'ai';

const result = await generateText({
  model: 'anthropic/claude-opus-4.5',
  prompt: 'Hello!',
});

// Or with OpenAI
const result = await generateText({
  model: 'openai/gpt-5.2',
  prompt: 'Hello!',
});

// Or with Mistral
const result = await generateText({
  model: 'mistral/mistral-large-latest',
  prompt: 'Hello!',
});
```

### Direct Provider Integration

Install provider-specific packages for more control and potentially better performance:

#### Anthropic (Claude)
```bash
npm install @ai-sdk/anthropic
```

```javascript
import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';

const result = await generateText({
  model: anthropic('claude-opus-4.5'),
  prompt: 'Hello!',
  // Additional Anthropic-specific options like thinking budget
  thinking: {
    type: 'enabled',
    budgetTokens: 10000,
  },
});
```

#### OpenAI
```bash
npm install @ai-sdk/openai
```

```javascript
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

const result = await generateText({
  model: openai('gpt-4-turbo'),
  prompt: 'Hello!',
});
```

#### Mistral
```bash
npm install @ai-sdk/mistral
```

```javascript
import { mistral } from '@ai-sdk/mistral';
import { generateText } from 'ai';

const result = await generateText({
  model: mistral('mistral-large-latest'),
  prompt: 'Hello!',
});
```

### Switching Providers

The biggest advantage: switch providers with a single line of code change without refactoring your entire application:

```javascript
// Original - OpenAI
import { openai } from '@ai-sdk/openai';
const model = openai('gpt-4');

// Switch to Anthropic - same code structure
import { anthropic } from '@ai-sdk/anthropic';
const model = anthropic('claude-opus-4.5');

// All functions (generateText, streamText, tool calling, etc.) work identically
```

### Supported Providers

- Anthropic (Claude)
- OpenAI
- Google Generative AI
- Google Vertex AI
- Mistral AI
- xAI Grok
- Azure OpenAI
- Amazon Bedrock
- Groq
- Fal AI
- DeepInfra
- Together AI
- And many more through OpenAI-compatible APIs

---

## Streaming

### Core Functions

The SDK provides several core functions for streaming:

#### **streamText**

Streams text responses word-by-word for real-time user feedback.

```javascript
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

const result = await streamText({
  model: openai('gpt-4'),
  prompt: 'Explain quantum computing',
});

// Iterate over streamed tokens
for await (const chunk of result.textStream) {
  console.log(chunk);
}

// Or use the async iterable directly
const text = await result.text;
console.log('Final text:', text);
```

#### **generateText**

Generates complete text responses (non-streaming). Ideal for background tasks, content generation, and agent workflows.

```javascript
import { generateText } from 'ai';

const result = await generateText({
  model: anthropic('claude-opus-4.5'),
  prompt: 'Draft an email',
  temperature: 0.7,
});

console.log(result.text);
console.log(result.usage); // { inputTokens: X, outputTokens: Y }
console.log(result.finishReason); // 'stop', 'length', 'tool-call', etc.
```

#### **generateObject**

Generates and validates structured JSON responses (non-streaming).

```javascript
import { generateObject } from 'ai';
import { z } from 'zod';

const schema = z.object({
  name: z.string(),
  age: z.number(),
  interests: z.array(z.string()),
});

const result = await generateObject({
  model: openai('gpt-4'),
  prompt: 'Extract person details from text',
  schema,
});

// result.object is fully typed
console.log(result.object.name, result.object.age);
```

#### **streamObject**

Streams structured JSON responses incrementally.

```javascript
import { streamObject } from 'ai';

const result = await streamObject({
  model: anthropic('claude-opus-4.5'),
  prompt: 'Generate a recipe',
  schema: recipeSchema,
});

for await (const chunk of result.partialObjectStream) {
  console.log('Partial object:', chunk);
}

const finalObject = await result.object;
```

### Response Data

All streaming functions return objects with:

```typescript
{
  // Streamed content
  textStream: AsyncIterable<string>;
  fullStream: AsyncIterable<StreamEvent>; // For complex events
  text: Promise<string>; // Full text when complete
  object: Promise<T>; // For structured outputs

  // Metadata
  usage: { inputTokens: number; outputTokens: number };
  finishReason: 'stop' | 'length' | 'tool-calls' | 'error' | 'other';

  // For tool calling
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
}
```

### Next.js App Router Integration (API Routes)

Streaming responses directly to the client with `NextResponse.stream`:

```typescript
// app/api/chat/route.ts
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { messages } = await request.json();

  const result = await streamText({
    model: openai('gpt-4'),
    messages,
  });

  // Return as streaming response
  return result.toDataStreamResponse();
  // Or for more control:
  // return new StreamingTextResponse(result.textStream);
}
```

### Server Actions Streaming

Stream directly from Server Actions without API routes:

```typescript
// app/actions.ts
'use server'

import { streamText } from 'ai';

export async function chat(messages: Message[]) {
  const result = await streamText({
    model: openai('gpt-4'),
    messages,
  });

  return result.toDataStream();
}
```

### Stream Protocol

The SDK uses **Server-Sent Events (SSE)** for streaming:
- Standardized event format
- Keep-alive pings to maintain connection
- Automatic reconnection handling
- Better cache compatibility than chunked encoding

---

## Tool Use & Function Calling

### Overview

The AI SDK abstracts tool calling across all providers with a single, unified API. You define tools once, and they work with Claude, OpenAI, Mistral, and other providers.

### Defining Tools

Use the `tool()` function with Zod schema validation:

```typescript
import { tool } from 'ai';
import { z } from 'zod';

const getWeather = tool({
  description: 'Get weather for a location',
  parameters: z.object({
    location: z.string().describe('City name'),
    unit: z.enum(['C', 'F']).describe('Temperature unit'),
  }),
  execute: async ({ location, unit }) => {
    // Call API, database, etc.
    const response = await fetch(`/api/weather?location=${location}`);
    return response.json();
  },
});

const calculateTax = tool({
  description: 'Calculate sales tax',
  parameters: z.object({
    amount: z.number(),
    taxRate: z.number().default(0.08),
  }),
  execute: async ({ amount, taxRate }) => {
    return amount * taxRate;
  },
});
```

### Using Tools with generateText

```typescript
const result = await generateText({
  model: anthropic('claude-opus-4.5'),
  prompt: "What's the weather in London?",
  tools: {
    getWeather,
    calculateTax,
  },
  maxSteps: 5, // Allow multiple tool calls
});

console.log(result.text); // Final response after tool execution
console.log(result.toolCalls); // Array of tool calls made
```

### Tool Execution Loop

The SDK automatically handles the agent loop:

1. **Model Call**: Send prompt + tools to the LLM
2. **Tool Calls**: Model returns which tools to call with what parameters
3. **Execution**: SDK validates parameters and executes tool.execute()
4. **Results**: Add results to conversation context
5. **Next Step**: Repeat until model returns `stop` or max steps reached

```
User: "What's the weather in London and convert it to Fahrenheit"
      ↓
Model: "I'll check the weather. [calls getWeather]"
      ↓
Execute: getWeather({ location: 'London', unit: 'C' })
      ↓
Result: { temperature: 15, condition: 'rainy' }
      ↓
Model: "The weather is 15°C (59°F) and rainy"
      ↓
Return final response to user
```

### Streaming with Tools

Tools work seamlessly with streaming:

```typescript
const result = await streamText({
  model: openai('gpt-4'),
  prompt: "What's the weather?",
  tools: { getWeather },
});

// Watch tool calls happen in real-time
for await (const event of result.fullStream) {
  if (event.type === 'tool-call') {
    console.log('Tool called:', event.toolName, event.args);
  } else if (event.type === 'tool-result') {
    console.log('Tool result:', event.result);
  } else if (event.type === 'text-delta') {
    console.log('Text:', event.delta);
  }
}
```

### AI SDK 6 Agent Abstraction

In AI SDK 6, tools are managed through an **Agent interface**:

```typescript
import { Agent, ToolLoopAgent } from 'ai';

// Define tools as before
const tools = {
  getWeather,
  calculateTax,
};

// Create an agent
const agent = new ToolLoopAgent({
  model: anthropic('claude-opus-4.5'),
  tools,
  maxSteps: 10,
});

// Use agent
const result = await agent.run({
  prompt: "What's the weather in London and what would the tax be on £100?",
});

console.log(result.text);
```

For complex agent logic, implement the `Agent` interface:

```typescript
interface Agent {
  run(input: { prompt: string; context?: string }): Promise<AgentResult>;
}

class CustomAgent implements Agent {
  constructor(private model: LanguageModel, private tools: Record<string, Tool>) {}

  async run(input: { prompt: string; context?: string }) {
    // Custom agent logic here
  }
}
```

### Tool Input Examples (Claude-specific)

Add examples to help Claude better understand tool parameters:

```typescript
const searchTool = tool({
  description: 'Search the web',
  parameters: z.object({
    query: z.string(),
  }),
  examples: [
    {
      query: 'latest AI news',
      result: 'Found 10 recent articles about AI...',
    },
    {
      query: 'Claude documentation',
      result: 'Found Claude API documentation...',
    },
  ],
  execute: async ({ query }) => {
    // Search implementation
  },
});
```

**Note**: Only Anthropic Claude natively supports input examples. For other providers, the SDK uses `addToolInputExamplesMiddleware` to append examples to tool descriptions.

---

## React Hooks: useChat & useCompletion

### useChat Hook

Manages multi-turn conversations with streaming support. This is the primary hook for building chatbots.

```typescript
'use client'

import { useChat } from '@ai-sdk/react';

export function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } =
    useChat({
      api: '/api/chat',
      onFinish: (message) => {
        console.log('Message finished:', message);
      },
      onError: (error) => {
        console.error('Error:', error);
      },
    });

  return (
    <div>
      <div className="messages">
        {messages.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            {message.content}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask something..."
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading}>
          Send
        </button>
      </form>
    </div>
  );
}
```

**AI SDK 5.0 Changes**: The architecture switched to transport-based with better streaming. The hook no longer manages input state internally—you manage it with `handleInputChange`.

### useChat Hook Features

```typescript
const {
  // State
  messages,           // Array of Message objects with id, role, content
  input,              // Current input value
  isLoading,          // Whether a request is in flight
  stop,               // Function to stop generation
  append,             // Function to manually add messages

  // Event handlers
  handleInputChange,  // onChange handler for input
  handleSubmit,       // onSubmit handler for form
  reload,             // Retry last message

  // Configuration
  setMessages,        // Manually set message history
  setInput,           // Manually set input value

  // Experimental
  data,               // Data from experimental_onToolCall
} = useChat({
  api: '/api/chat',   // Required: API endpoint
  body: {},           // Extra data to send with requests
  headers: {},        // Custom headers
  credentials: 'same-origin',
});
```

### useCompletion Hook

For single-turn text completions (not conversations):

```typescript
'use client'

import { useCompletion } from '@ai-sdk/react';

export function CodeCompletion() {
  const {
    completion,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
  } = useCompletion({
    api: '/api/complete',
    onFinish: (text) => {
      console.log('Completion finished:', text);
    },
  });

  return (
    <form onSubmit={handleSubmit}>
      <textarea
        value={input}
        onChange={handleInputChange}
        placeholder="Write code..."
      />
      <div className="completion">{completion}</div>
      <button type="submit" disabled={isLoading}>
        Complete
      </button>
    </form>
  );
}
```

### Hook Architecture Differences

- **useChat**: Multi-turn conversations, maintains message history
- **useCompletion**: Single turn, for code completion or autocomplete use cases
- **useObject**: Streams structured objects (data streaming)
- **useAssistant**: For multi-file, persistent assistant interactions

These hooks are designed for specific use cases and should not be combined.

### Tool Calling with useChat

Enable tool calling in the API route:

```typescript
// app/api/chat/route.ts
export async function POST(request: Request) {
  const { messages } = await request.json();

  const result = await streamText({
    model: openai('gpt-4'),
    messages,
    tools: { getWeather, calculateTax },
  });

  return result.toDataStreamResponse();
}
```

The `useChat` hook automatically handles tool calls sent from the server, including tool execution UI rendering.

---

## Structured Output

### Overview

Structured output ensures the LLM returns data in a specific format (JSON schema) with automatic validation.

### Basic Example with generateObject

```typescript
import { generateObject } from 'ai';
import { z } from 'zod';

const userSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  age: z.number().int().min(0).max(150),
  interests: z.array(z.string()),
});

const result = await generateObject({
  model: anthropic('claude-opus-4.5'),
  prompt: 'Extract user information from: John Doe, john@example.com, age 30, interested in AI and music',
  schema: userSchema,
});

// result.object is fully typed as z.infer<typeof userSchema>
console.log(result.object.name);      // TypeScript autocomplete works
console.log(result.object.interests); // Fully typed array
```

### Enhanced Schema Descriptions

Help the AI understand what each field should contain:

```typescript
const extractSchema = z.object({
  sentiment: z
    .enum(['positive', 'negative', 'neutral'])
    .describe('Overall sentiment of the review'),

  rating: z
    .number()
    .min(1)
    .max(5)
    .describe('Star rating from 1 (worst) to 5 (best)'),

  summary: z
    .string()
    .describe('Brief one-line summary of the review'),

  issues: z
    .array(
      z.object({
        category: z.string().describe('Type of issue (e.g., "Performance", "Design")'),
        description: z.string().describe('Detailed description of the issue'),
        severity: z.enum(['low', 'medium', 'high']),
      })
    )
    .describe('List of problems mentioned in the review'),
});
```

### Streaming Structured Output with streamObject

```typescript
const result = await streamObject({
  model: openai('gpt-4'),
  prompt: 'Generate a multi-step recipe',
  schema: recipeSchema,
});

// Receive partial objects as they stream in
for await (const partialObject of result.partialObjectStream) {
  console.log('Partial:', partialObject);
  // Might be incomplete but shows progress
}

// Get the final validated object
const finalRecipe = await result.object;
```

### Tool Calling + Structured Output (AI SDK 6)

In AI SDK 6, you can combine tool calling with structured output in a single loop:

```typescript
const result = await generateText({
  model: anthropic('claude-opus-4.5'),
  prompt: 'Answer the user question then provide structured analysis',
  tools: { searchWeb, fetchAPI },
  output: 'no-schema', // Or pass a schema for final output
  maxSteps: 5, // Execute multiple tools
});

// Model can call tools, then return structured response
```

### Zod Schema Libraries

AI SDK 6 supports any schema library implementing the Standard JSON Schema interface, not just Zod. This means you could use:
- Zod
- TypeBox
- Ajv
- Other JSON Schema validators

---

## Multi-Modal Capabilities

### Image Input Support

The SDK supports image input through multiple methods:

#### Base64 Images

```typescript
const result = await generateText({
  model: openai('gpt-4-vision'),
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Describe this image' },
        {
          type: 'image',
          image: Buffer.from(imageData).toString('base64'),
          mimeType: 'image/jpeg',
        },
      ],
    },
  ],
});
```

#### Image URLs

```typescript
const result = await generateText({
  model: anthropic('claude-opus-4.5'),
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Analyze this screenshot' },
        {
          type: 'image',
          image: new URL('https://example.com/image.png'),
        },
      ],
    },
  ],
});
```

### Multi-Modal with useChat

Attach files/images using experimental_attachments:

```typescript
const { messages, handleSubmit } = useChat({
  api: '/api/chat',
});

return (
  <form
    onSubmit={(e) => {
      handleSubmit(e, {
        experimental_attachments: [file1, file2], // Image/PDF files
      });
    }}
  >
    <input type="file" multiple accept="image/*,application/pdf" />
    <button>Send with attachments</button>
  </form>
);
```

The SDK automatically:
- Converts files to data URLs
- Passes them to the model
- Maintains compatibility across environments

### Supported File Types

- **Images**: PNG, JPG, WebP, GIF
- **PDFs**: Through multi-modal capable models

### Provider Support

Multi-modal support varies by provider:
- **Claude (3.5 Sonnet+)**: Full image support
- **GPT-4 Vision**: Image input
- **Mistral Vision Models**: Image input
- **Google Gemini**: Image and video input
- **Mistral OCR**: Specialized for document analysis

---

## Advanced Claude Features

### Extended Thinking (Reasoning)

Claude 3.7 Sonnet supports extended thinking—the ability to reason through complex problems step-by-step:

```typescript
const result = await generateText({
  model: anthropic('claude-opus-4.5'),
  prompt: 'Solve this complex math problem: ...',
  thinking: {
    type: 'enabled',
    budgetTokens: 5000, // How many tokens Claude can use for thinking
  },
});

// result.text contains the final answer
// The thinking process itself is not exposed in the streaming API
```

You can also use `extractReasoningMiddleware` to extract reasoning from models that include it in their text output:

```typescript
import { extractReasoningMiddleware } from 'ai';

const result = await generateText({
  model: openai('gpt-4-turbo'),
  prompt: 'Solve...',
  experimental_middleware: extractReasoningMiddleware(),
});

// For OpenAI o1/o3 models that include <thinking> tags
```

### Prompt Caching

Anthropic Claude models support prompt caching to reduce costs and latency for repeated or similar prompts:

```typescript
const result = await generateText({
  model: anthropic('claude-opus-4.5'),
  system: {
    type: 'text',
    text: 'You are a helpful assistant.',
    cache_control: { type: 'ephemeral' },
  },
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Long context that will be cached...',
          cache_control: { type: 'ephemeral' },
        },
        {
          type: 'text',
          text: 'Question about the context',
        },
      ],
    },
  ],
});

// Subsequent requests with the same cached context use fewer tokens
```

**Token Savings**:
- Cache write: Pay for all tokens
- Cache hit: Pay 10% of cached tokens + full tokens for new content
- Great for RAG systems where context repeats

### All Claude Features Supported

The SDK supports:
- ✅ Extended thinking / reasoning
- ✅ Prompt caching
- ✅ Tool calling (native)
- ✅ Multi-modal input (images, PDFs through vision)
- ✅ Structured output via JSON schema
- ✅ Vision capabilities (Claude 3.5 Sonnet+)
- ✅ Tool input examples (native support)

### Max Tokens Configuration

```typescript
const result = await generateText({
  model: anthropic('claude-opus-4.5'),
  prompt: 'Write a long essay',
  maxTokens: 4096,
});
```

---

## Middleware & Customization

### Middleware System Overview

Language model middleware lets you enhance behavior by intercepting and modifying calls. Use cases:
- Custom logging
- RAG integration
- Caching
- Guardrails
- Rate limiting

### Custom Logging Middleware

```typescript
import { generateText, experimental_wrapLanguageModel } from 'ai';

const loggingModel = experimental_wrapLanguageModel({
  model: anthropic('claude-opus-4.5'),
  middleware: {
    async wrapGenerate(params) {
      console.log('Prompt:', params.prompt);
      console.log('Tools:', Object.keys(params.tools || {}));

      const result = await params.doGenerate();

      console.log('Generated text:', result.text.slice(0, 100) + '...');
      console.log('Tokens:', result.usage);

      return result;
    },
  },
});

const result = await generateText({
  model: loggingModel,
  prompt: 'Hello',
});
```

### Production Middleware Options

The SDK includes three built-in middleware:

**extractReasoningMiddleware**: Extracts reasoning from models that include it

```typescript
import { extractReasoningMiddleware } from 'ai';

const model = experimental_wrapLanguageModel({
  model: openai('gpt-4-turbo'),
  middleware: extractReasoningMiddleware(),
});
```

**simulateStreamingMiddleware**: Simulates streaming for non-streaming models

```typescript
import { simulateStreamingMiddleware } from 'ai';

const model = experimental_wrapLanguageModel({
  model: someNonStreamingModel,
  middleware: simulateStreamingMiddleware(),
});
```

**defaultSettingsMiddleware**: Apply consistent defaults

```typescript
import { defaultSettingsMiddleware } from 'ai';

const model = experimental_wrapLanguageModel({
  model: anthropic('claude-opus-4.5'),
  middleware: defaultSettingsMiddleware({ temperature: 0.7 }),
});
```

### Rate Limiting

#### Vercel WAF Rate Limiting

Configure rate limiting at Vercel infrastructure level:

```typescript
// vercel.json
{
  "crons": [
    {
      "path": "/api/chat",
      "schedule": "* * * * *"
    }
  ]
}

// Vercel Dashboard: WAF → Create custom rule → Rate limit
```

#### Edge Middleware Rate Limiting

```typescript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@vercel/firewall';

const ratelimit = new Ratelimit({
  key: 'ip',
  limit: 100, // requests
  window: '1 h', // per hour
});

export async function middleware(request: NextRequest) {
  const { success } = await ratelimit.limit(request.ip ?? 'unknown');

  if (!success) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  return NextResponse.next();
}
```

#### SDK-Level Rate Limiting

Implement custom rate limiting in your API route:

```typescript
import { RateLimiter } from 'some-rate-limiter';

const limiter = new RateLimiter({
  points: 100,
  duration: 60, // per minute
});

export async function POST(request: Request) {
  const clientId = request.headers.get('x-client-id');

  try {
    await limiter.consume(clientId);
  } catch (error) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429 }
    );
  }

  const result = await streamText({
    model: openai('gpt-4'),
    prompt: '...',
  });

  return result.toDataStreamResponse();
}
```

---

## Vercel AI SDK vs Direct API Usage

### Advantages of Vercel AI SDK

| Feature | AI SDK | Direct Anthropic SDK |
|---------|--------|---------------------|
| **Provider Abstraction** | Switch with 1 line | Must change SDK + logic |
| **Streaming Helpers** | Built-in for all providers | Each provider different |
| **React Integration** | `useChat`, `useCompletion` hooks | Manual implementation |
| **Tool Calling** | Unified API | Provider-specific |
| **Structured Output** | `generateObject` + Zod | Provider-specific |
| **Node.js Runtime** | Edge runtime only | ✅ Full support |
| **Bundle Size** | 19.5 kB gzipped | Larger SDKs |
| **Boilerplate Reduction** | ~60% less for streaming chat | More manual work |

### Disadvantages of Vercel AI SDK

| Limitation | Impact |
|-----------|--------|
| **Edge Runtime Only** | Can't use Node.js runtime features |
| **Abstraction Overhead** | Slightly less granular control |
| **Learning Curve** | Different from direct SDK patterns |
| **Limited Feature Parity** | May lag behind latest provider features temporarily |

### Advantages of Direct Anthropic SDK

| Feature | Direct SDK |
|---------|-----------|
| **Full API Control** | Access ALL features immediately |
| **Node.js + Edge** | Works in any runtime |
| **Mature API** | Stable, battle-tested |
| **No Abstraction** | Know exactly what's happening |
| **Native Input Examples** | First-class support |

### When to Use AI SDK

✅ **Use Vercel AI SDK when:**
- Building chat interfaces in Next.js
- Want multi-provider flexibility
- Need streaming chat with React hooks
- Building with Server Components
- Want reduced boilerplate
- Okay with Edge runtime constraints

❌ **Use Direct SDK when:**
- Need Node.js runtime features
- Building backend services (Python, Rust, etc.)
- Want maximum API control
- Don't plan to switch providers
- Building non-web applications

### Feature Parity Note

The SDK supports nearly all Claude features:
- ✅ Extended thinking
- ✅ Prompt caching
- ✅ Tool calling
- ✅ Vision input
- ✅ Batch processing (through Vercel API)

However, cutting-edge features may take slightly longer to reach the SDK vs direct API.

---

## Next.js App Router Integration

### Setup

```bash
npm install ai @ai-sdk/openai
# or
npm install ai @ai-sdk/anthropic
```

### Basic API Route (Streaming)

```typescript
// app/api/chat/route.ts
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { messages } = await request.json();

  // Validate authentication
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await streamText({
    model: openai('gpt-4'),
    messages,
    temperature: 0.7,
    maxTokens: 1024,
  });

  return result.toDataStreamResponse();
}
```

### Client Component (useChat)

```typescript
// app/components/ChatUI.tsx
'use client'

import { useChat } from '@ai-sdk/react';
import { useState } from 'react';

export function ChatUI() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, error } =
    useChat({
      api: '/api/chat',
      headers: {
        authorization: `Bearer ${process.env.NEXT_PUBLIC_API_KEY}`,
      },
      onError: (error) => {
        console.error('Chat error:', error);
      },
    });

  if (error) return <div>Error: {error.message}</div>;

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            <p>{message.content}</p>
          </div>
        ))}
        {isLoading && <div className="loading">Thinking...</div>}
      </div>

      <form onSubmit={handleSubmit} className="input-form">
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask anything..."
          disabled={isLoading}
          className="input"
        />
        <button type="submit" disabled={isLoading}>
          Send
        </button>
      </form>
    </div>
  );
}
```

### Server Action (Alternative to API Route)

```typescript
// app/actions.ts
'use server'

import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

export async function chat(messages: Message[]) {
  const result = await streamText({
    model: anthropic('claude-opus-4.5'),
    messages,
  });

  return result.toDataStream();
}
```

Usage in client:

```typescript
'use client'

import { useTransition, useRef, useEffect } from 'react';
import { chat } from './actions';

export function ChatUI() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newMessages = [...messages, { role: 'user', content: input }];
    setMessages(newMessages);
    setInput('');

    startTransition(async () => {
      const stream = await chat(newMessages);
      // Handle streaming response
    });
  };

  return (
    // UI implementation
  );
}
```

### Tool Calling in App Router

```typescript
// app/api/chat/route.ts
const result = await streamText({
  model: openai('gpt-4'),
  messages,
  tools: {
    weather: tool({
      description: 'Get weather for a location',
      parameters: z.object({
        location: z.string(),
      }),
      execute: async ({ location }) => {
        // Fetch weather data
        return { temp: 72, condition: 'sunny' };
      },
    }),
  },
  maxSteps: 5,
});

return result.toDataStreamResponse();
```

The `useChat` hook automatically handles tool execution and UI rendering.

### Server Components + Streaming

Stream directly to Server Components without API routes:

```typescript
// app/page.tsx
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

async function AIContent() {
  const result = await streamText({
    model: openai('gpt-4'),
    prompt: 'Generate a blog post about AI',
  });

  return (
    <div>
      {/* Render streamed content */}
    </div>
  );
}

export default function Page() {
  return <AIContent />;
}
```

### Configuration Best Practices

```typescript
// lib/ai.ts
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';

// Environment-based model selection
const model = process.env.AI_MODEL === 'anthropic'
  ? anthropic('claude-opus-4.5')
  : openai('gpt-4');

// Reusable configuration
export const defaultConfig = {
  temperature: 0.7,
  maxTokens: 2048,
  topP: 0.9,
};

export { model };
```

```typescript
// app/api/chat/route.ts
import { model, defaultConfig } from '@/lib/ai';

const result = await streamText({
  model,
  messages,
  ...defaultConfig,
});
```

---

## Mistral OCR & Special Capabilities

### Mistral OCR Support

Mistral provides specialized OCR models for document processing:

#### Mistral OCR Models

- **mistral-ocr-latest**: Latest OCR model
- **mistral-ocr-2512**: December 2025 release, optimized for structure preservation
- **Mistral OCR 3**: Newest version with enhanced accuracy

```typescript
import { mistral } from '@ai-sdk/mistral';

const result = await generateText({
  model: mistral('mistral-ocr-latest'),
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Extract all text from this PDF' },
        {
          type: 'document',
          data: pdfBuffer,
          mimeType: 'application/pdf',
        },
      ],
    },
  ],
});
```

#### Capabilities

Mistral OCR excels at:
- **Text Extraction**: Preserve formatting, structure
- **Tables**: Extract table data maintaining relationships
- **Mixed Content**: Handle interleaved text and images
- **Complex Layouts**: LaTeX, equations, special formatting
- **Multi-page Documents**: Process full PDFs efficiently

#### Provider Options

```typescript
const result = await generateText({
  model: mistral('mistral-ocr-2512'),
  messages: [...],
  // Provider-specific options
  maxImageCount: 10, // Optional: limit images processed
  pageLimit: 50, // Optional: limit pages to process
});
```

#### Cost

- **$2 per 1,000 pages** (standard)
- **50% discount** through Batch API
- Efficient for large document processing

### Integration with Vercel AI SDK

```typescript
import { mistral } from '@ai-sdk/mistral';
import { generateText, streamObject } from 'ai';
import { z } from 'zod';

// Extract structured data from document
const invoiceSchema = z.object({
  invoiceNumber: z.string(),
  date: z.string(),
  total: z.number(),
  items: z.array(z.object({
    description: z.string(),
    quantity: z.number(),
    price: z.number(),
  })),
});

const result = await streamObject({
  model: mistral('mistral-ocr-latest'),
  prompt: 'Extract invoice details from this PDF',
  schema: invoiceSchema,
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'document',
          data: invoicePdfBuffer,
          mimeType: 'application/pdf',
        },
      ],
    },
  ],
});

const extractedInvoice = await result.object;
console.log(extractedInvoice.invoiceNumber);
```

### MCP Integration (AI SDK 6)

AI SDK 6 adds full **Model Context Protocol (MCP)** support for connecting to external tools and data sources:

```typescript
import { createClient } from '@ai-sdk/mcp';

const filesystem = createClient({
  type: 'stdio',
  command: 'node',
  args: ['./mcp-servers/filesystem.js'],
});

const result = await generateText({
  model: openai('gpt-4'),
  tools: filesystem.tools,
  prompt: 'Read and summarize project.md',
});
```

### Image Editing (AI SDK 6)

New capability for AI-powered image manipulation:

```typescript
import { editImage } from 'ai';
import { openai } from '@ai-sdk/openai';

const editedImage = await editImage({
  model: openai('gpt-4-vision'),
  image: originalImageBuffer,
  prompt: 'Remove the background',
  mimeType: 'image/png',
});

// Returns edited image as buffer
```

---

## Summary & Decision Guide

### When to Choose Vercel AI SDK

**Best for:**
- Next.js applications (App Router + Server Components)
- Real-time streaming chat interfaces
- Multi-provider flexibility (want to switch between Claude, OpenAI, Mistral)
- React/TypeScript projects
- Rapid development (less boilerplate)
- Tool calling + structured output together

**Key Strengths:**
- Unified abstraction for 15+ providers
- Built-in React hooks reduce ~60% of streaming chat boilerplate
- Type-safe tool and schema definitions
- Excellent Next.js integration
- Active development (AI SDK 6 in 2025)

**Limitations:**
- Edge runtime only (not Node.js)
- Slightly less granular control than direct SDKs
- May lag behind bleeding-edge provider features by weeks

### When to Use Direct Anthropic SDK

**Best for:**
- Backend services, Node.js applications
- Maximum API control and early access to new features
- Systems where you won't switch providers
- Non-web applications (Python, Rust, Go backends)
- Situations requiring Node.js runtime

**Key Strengths:**
- Full access to Anthropic API
- Works in Node.js + Edge runtimes
- Native support for all Claude features immediately
- Mature, battle-tested API
- First-class input examples support

**Limitations:**
- Provider lock-in
- More boilerplate for streaming/UI integration
- Must manage different SDKs for multi-provider scenarios

### Feature Support Comparison

| Feature | AI SDK | Direct |
|---------|--------|--------|
| Claude Extended Thinking | ✅ | ✅ |
| Prompt Caching | ✅ | ✅ |
| Tool Calling | ✅ | ✅ |
| Vision Input | ✅ | ✅ |
| Structured Output | ✅ | ✅ |
| Batch API | ✅ | ✅ |
| Token Counting | ✅ | ✅ |
| Streaming | ✅ | ✅ |
| Input Examples | ✅ (via middleware) | ✅ (native) |
| Node.js Runtime | ❌ | ✅ |
| Multi-Provider | ✅ | ❌ |

### Recommendation

**For your project requirements:**

If building a **Next.js web application** with potential for multi-provider support and you want to minimize boilerplate for streaming chat interfaces → **Use Vercel AI SDK**

If building a **production system** that needs maximum control over Claude features, Node.js backend capabilities, or plan to use Anthropic exclusively → **Use Direct SDK + Vercel AI SDK for frontend**

**Hybrid Approach** (Recommended for large projects):
- Backend: Direct Anthropic SDK (Node.js services)
- Frontend: Vercel AI SDK (Next.js, streaming, React hooks)
- This gives you full control on backend + optimized streaming on frontend

---

## Resources

- [Official AI SDK Docs](https://ai-sdk.dev)
- [Vercel Blog - AI SDK Updates](https://vercel.com/blog)
- [GitHub Repository](https://github.com/vercel/ai)
- [Examples & Templates](https://vercel.com/templates)
- [Discord Community](https://discord.gg/vercel)

