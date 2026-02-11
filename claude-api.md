# Claude API Reference Guide (2025-2026)

Comprehensive guide to implementing the Anthropic Claude API with the latest features, streaming capabilities, and tool use patterns.

## Table of Contents

1. [Streaming Responses](#streaming-responses)
2. [Tool Use (Function Calling)](#tool-use-function-calling)
3. [Combining Streaming + Tool Use](#combining-streaming--tool-use)
4. [Custom Tools](#custom-tools)
5. [Chat Flow with Tools](#chat-flow-with-tools)
6. [Anthropic SDK](#anthropic-sdk)
7. [Advanced Features](#advanced-features)

---

## Streaming Responses

### How Streaming Works

When creating a Message, set `"stream": true` to incrementally stream responses using Server-Sent Events (SSE). The SDKs provide convenient helpers to handle streaming, but the underlying mechanism uses standard SSE format.

### Event Types and Structure

Each stream follows this event flow:

1. **`message_start`** - Contains a Message object with empty `content`
2. **Content blocks** - Series of blocks, each with:
   - `content_block_start` event
   - One or more `content_block_delta` events
   - `content_block_stop` event
3. **`message_delta`** events - Indicate top-level changes (stop_reason, usage)
4. **`message_stop`** - Final event

Additional events:
- **`ping`** events - Keep the connection alive
- **`error`** events - For API errors during streaming

### Streaming Event Examples

#### Basic Text Streaming

```json
event: message_start
data: {"type":"message_start","message":{"id":"msg_...","type":"message","role":"assistant","content":[],"model":"claude-opus-4-6","stop_reason":null,"usage":{"input_tokens":25,"output_tokens":1}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"!"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":15}}

event: message_stop
data: {"type":"message_stop"}
```

### Delta Types

#### Text Delta
Used for regular text content blocks:
```json
{
  "type": "content_block_delta",
  "index": 0,
  "delta": {"type": "text_delta", "text": "ello frien"}
}
```

#### Input JSON Delta (Tool Use)
Streamed as partial JSON strings (not complete objects):
```json
{
  "type": "content_block_delta",
  "index": 1,
  "delta": {"type": "input_json_delta", "partial_json": "{\"location\": \"San Fra"}
}
```

**Important**: Accumulate partial JSON strings and parse once on `content_block_stop`. The SDKs provide helpers for this.

#### Thinking Delta (Extended Thinking)
For thinking content blocks:
```json
{
  "type": "content_block_delta",
  "index": 0,
  "delta": {"type": "thinking_delta", "thinking": "I need to find the GCD..."}
}
```

Includes `signature_delta` for integrity verification just before `content_block_stop`.

### Streaming to Client (Next.js Example)

```typescript
// app/api/chat/route.ts
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1024,
    messages: messages,
    stream: true,
  });

  // Create an SSE response
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      for await (const event of stream) {
        // Convert stream events to SSE format
        if (event.type === 'content_block_delta') {
          const data = {
            type: 'delta',
            delta: event.delta,
          };
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        } else if (event.type === 'message_stop') {
          controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
          controller.close();
        }
      }
    },
  });
}
```

### SDK Streaming Helpers (TypeScript)

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

// Simple text streaming
await client.messages.stream({
  messages: [{ role: 'user', content: 'Hello' }],
  model: 'claude-opus-4-6',
  max_tokens: 1024,
}).on('text', (text) => {
  console.log(text);
});

// Get final message from stream
const stream = client.messages.stream({
  messages: [{ role: 'user', content: 'Write a long essay...' }],
  model: 'claude-opus-4-6',
  max_tokens: 128000,
});

const message = await stream.finalMessage();
console.log(message.content[0].text);
```

---

## Tool Use (Function Calling)

### Tool Definition Format

Tools are specified in the `tools` parameter of the API request. Each tool definition includes:

```json
{
  "name": "get_weather",
  "description": "Get the current weather in a given location. This tool should be used when the user asks about weather conditions in a specific city or region. It returns temperature and conditions in the requested unit.",
  "input_schema": {
    "type": "object",
    "properties": {
      "location": {
        "type": "string",
        "description": "The city and state, e.g. San Francisco, CA"
      },
      "unit": {
        "type": "string",
        "enum": ["celsius", "fahrenheit"],
        "description": "The unit of temperature, either 'celsius' or 'fahrenheit'"
      }
    },
    "required": ["location"]
  }
}
```

### Tool Definition Best Practices

1. **Extremely detailed descriptions** - This is the most critical factor
   - What the tool does
   - When to use it (and when not to)
   - What each parameter means
   - Important caveats and limitations
   - Aim for 3-4 sentences minimum per tool

2. **Clear parameter descriptions** - Explain format, examples, constraints

3. **Use `input_examples`** (beta feature) for complex tools:
   ```json
   {
     "name": "get_weather",
     "description": "...",
     "input_schema": { ... },
     "input_examples": [
       { "location": "San Francisco, CA", "unit": "fahrenheit" },
       { "location": "Tokyo, Japan", "unit": "celsius" },
       { "location": "New York, NY" }
     ]
   }
   ```

4. **Granularity** - Tools should be focused and specific, not overly general

### Tool Response Structure

When Claude decides to use a tool, the response includes:

```json
{
  "id": "msg_01Aq9w938a90dw8q",
  "model": "claude-opus-4-6",
  "stop_reason": "tool_use",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "I'll check the current weather in San Francisco for you."
    },
    {
      "type": "tool_use",
      "id": "toolu_01A09q90qw90lq917835lq9",
      "name": "get_weather",
      "input": {
        "location": "San Francisco, CA",
        "unit": "celsius"
      }
    }
  ]
}
```

### Tool Result Format

Send back a user message with tool results:

```json
{
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      "tool_use_id": "toolu_01A09q90qw90lq917835lq9",
      "content": "15 degrees Celsius, mostly cloudy"
    }
  ]
}
```

**Critical formatting rules for tool results**:
- Tool result blocks must come FIRST in the content array
- Any text must come AFTER all tool results
- All results must be in a SINGLE user message (not separate messages)

```json
// ✅ CORRECT
{
  "role": "user",
  "content": [
    {"type": "tool_result", "tool_use_id": "toolu_01", "content": "..."},
    {"type": "tool_result", "tool_use_id": "toolu_02", "content": "..."},
    {"type": "text", "text": "What should I do next?"}
  ]
}

// ❌ WRONG - Text before tool results
{
  "role": "user",
  "content": [
    {"type": "text", "text": "Here are results:"},
    {"type": "tool_result", "tool_use_id": "toolu_01", "content": "..."}
  ]
}
```

### Tool Results with Media

```json
{
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      "tool_use_id": "toolu_01A09q90qw90lq917835lq9",
      "content": [
        {"type": "text", "text": "Weather image:"},
        {
          "type": "image",
          "source": {
            "type": "base64",
            "media_type": "image/jpeg",
            "data": "/9j/4AAQSkZJRg..."
          }
        }
      ]
    }
  ]
}
```

### Error Handling

For tool execution errors, set `is_error: true`:

```json
{
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      "tool_use_id": "toolu_01A09q90qw90lq917835lq9",
      "content": "ConnectionError: Weather service unavailable",
      "is_error": true
    }
  ]
}
```

---

## Combining Streaming + Tool Use

### Fine-Grained Tool Streaming

Fine-grained tool streaming is now generally available (no beta header required). Claude can stream tool parameters without buffering, reducing latency for large parameters.

### Streaming Request with Tool Use

When you request streaming with tools enabled:

```json
{
  "model": "claude-opus-4-6",
  "max_tokens": 1024,
  "stream": true,
  "tools": [
    {
      "name": "get_weather",
      "description": "Get the current weather in a given location",
      "input_schema": {
        "type": "object",
        "properties": {
          "location": { "type": "string" }
        },
        "required": ["location"]
      }
    }
  ],
  "messages": [
    { "role": "user", "content": "What's the weather in San Francisco?" }
  ]
}
```

### Stream Events with Tool Use

The stream includes:

1. **Initial text** (content_block_start + text_delta events)
2. **Tool use block** (content_block_start for tool_use)
3. **Input JSON deltas** (input_json_delta events for tool parameters)
4. **Tool use completion** (content_block_stop)
5. **Final message state** (message_delta with stop_reason: "tool_use")

```json
event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Let me check"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: content_block_start
data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_01...","name":"get_weather","input":{}}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"location\":"}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":" \"San Francisco\""}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":""}}

event: content_block_stop
data: {"type":"content_block_stop","index":1}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":89}}

event: message_stop
data: {"type":"message_stop"}
```

### Handling Tool Use in Streams (TypeScript)

```typescript
const stream = client.messages.stream({
  model: 'claude-opus-4-6',
  max_tokens: 1024,
  tools: [getWeatherTool],
  messages: [{ role: 'user', content: 'What is the weather?' }],
  stream: true,
});

for await (const chunk of stream) {
  if (chunk.type === 'content_block_delta') {
    if (chunk.delta.type === 'text_delta') {
      // Text content
      console.log(chunk.delta.text);
    } else if (chunk.delta.type === 'input_json_delta') {
      // Tool parameter (partial JSON)
      console.log('Tool param chunk:', chunk.delta.partial_json);
    }
  } else if (chunk.type === 'message_delta') {
    if (chunk.delta.stop_reason === 'tool_use') {
      // Claude wants to use a tool
      console.log('Tool use requested');
    }
  }
}

// After stream completes, execute tools and continue
const finalMessage = await stream.finalMessage();
if (finalMessage.stop_reason === 'tool_use') {
  // Handle tool execution
}
```

### Tool Runner (Beta) - Automatic Tool Handling

The SDK provides a `tool_runner` that automatically handles the tool call loop:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

const anthropic = new Anthropic();

const getWeatherTool = betaZodTool({
  name: 'get_weather',
  description: 'Get the current weather',
  inputSchema: z.object({
    location: z.string().describe('City name'),
  }),
  run: async (input) => {
    // Execute actual tool
    return JSON.stringify({ temperature: 72, condition: 'sunny' });
  },
});

// Tool runner handles streaming + tool use automatically
const runner = anthropic.beta.messages.toolRunner({
  model: 'claude-opus-4-6',
  max_tokens: 1024,
  tools: [getWeatherTool],
  messages: [{ role: 'user', content: 'What is the weather?' }],
  stream: true,
});

for await (const message of runner) {
  console.log(message.content[0].text);
}

// Or get final message directly
const finalMessage = await runner;
console.log(finalMessage.content[0].text);
```

---

## Custom Tools

### Basic Tool Structure

```typescript
// Tool definition with descriptions
const tools = [
  {
    name: "search_knowledge_base",
    description: "Search through our internal knowledge base for information. Use this when the user asks questions about our company, products, policies, or any documented information. Returns relevant excerpts and document titles.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query. Use keywords from the user's question. Be concise but specific."
        },
        max_results: {
          type: "number",
          description: "Maximum number of results to return. Default is 5.",
          default: 5
        }
      },
      required: ["query"]
    }
  },
  {
    name: "create_ticket",
    description: "Create a support ticket in our system. Use this when the user reports an issue or needs to create a formal support request. Returns a ticket number for tracking.",
    input_schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Brief title of the issue"
        },
        description: {
          type: "string",
          description: "Detailed description of the problem"
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high", "critical"],
          description: "Priority level of the ticket"
        },
        category: {
          type: "string",
          enum: ["billing", "technical", "feature_request", "other"],
          description: "Category of the issue"
        }
      },
      required: ["title", "description", "priority", "category"]
    }
  }
];
```

### Tool Execution Pattern

```typescript
async function executeToolUseResponse(
  response: Anthropic.Message
): Promise<ToolResult[]> {
  const toolResults: ToolResult[] = [];

  for (const block of response.content) {
    if (block.type === 'tool_use') {
      const toolName = block.name;
      const toolInput = block.input;

      try {
        let result: string;

        if (toolName === 'search_knowledge_base') {
          result = await searchKnowledgeBase(
            toolInput.query,
            toolInput.max_results
          );
        } else if (toolName === 'create_ticket') {
          result = await createTicket(
            toolInput.title,
            toolInput.description,
            toolInput.priority,
            toolInput.category
          );
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result,
        });
      } catch (error) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Error: ${error.message}`,
          is_error: true,
        });
      }
    }
  }

  return toolResults;
}
```

### Granular Tool Design

Don't create monolithic tools. Instead, create focused, single-purpose tools:

```typescript
// ❌ Too broad
{
  "name": "database_query",
  "description": "Run any database query"
}

// ✅ Better - specific tools
{
  "name": "get_user_by_id",
  "description": "Get user information by ID",
  "input_schema": {
    "properties": { "user_id": { "type": "string" } },
    "required": ["user_id"]
  }
}

{
  "name": "list_orders_by_user",
  "description": "Get all orders for a specific user",
  "input_schema": {
    "properties": { "user_id": { "type": "string" } },
    "required": ["user_id"]
  }
}
```

---

## Chat Flow with Tools

### Complete Multi-Turn Conversation

Here's a full example of a conversation with tool use:

```json
// Step 1: User asks a question
{
  "messages": [
    {
      "role": "user",
      "content": "What's the weather in San Francisco and New York?"
    }
  ]
}

// Step 2: API Response - Claude wants to use tools
{
  "stop_reason": "tool_use",
  "content": [
    {
      "type": "text",
      "text": "I'll check the weather in both cities for you."
    },
    {
      "type": "tool_use",
      "id": "toolu_01",
      "name": "get_weather",
      "input": { "location": "San Francisco, CA" }
    },
    {
      "type": "tool_use",
      "id": "toolu_02",
      "name": "get_weather",
      "input": { "location": "New York, NY" }
    }
  ]
}

// Step 3: Send tool results back
{
  "messages": [
    {
      "role": "user",
      "content": "What's the weather in San Francisco and New York?"
    },
    {
      "role": "assistant",
      "content": [
        { "type": "text", "text": "I'll check the weather..." },
        { "type": "tool_use", "id": "toolu_01", "name": "get_weather", "input": {...} },
        { "type": "tool_use", "id": "toolu_02", "name": "get_weather", "input": {...} }
      ]
    },
    {
      "role": "user",
      "content": [
        {
          "type": "tool_result",
          "tool_use_id": "toolu_01",
          "content": "San Francisco: 72°F, sunny"
        },
        {
          "type": "tool_result",
          "tool_use_id": "toolu_02",
          "content": "New York: 65°F, cloudy"
        }
      ]
    }
  ]
}

// Step 4: API Response - Final answer
{
  "stop_reason": "end_turn",
  "content": [
    {
      "type": "text",
      "text": "Here's the weather in both cities:\n- San Francisco: 72°F and sunny\n- New York: 65°F and cloudy"
    }
  ]
}
```

### Complete TypeScript Implementation

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const tools = [
  {
    name: 'get_weather',
    description: 'Get the current weather in a location',
    input_schema: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City, State' },
      },
      required: ['location'],
    },
  },
];

async function chat(userMessage: string) {
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userMessage },
  ];

  // Step 1: Send message with tools
  let response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1024,
    tools: tools,
    messages: messages,
  });

  // Step 2: Loop until no more tool calls
  while (response.stop_reason === 'tool_use') {
    // Add assistant response
    messages.push({
      role: 'assistant',
      content: response.content,
    });

    // Collect tool results
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type === 'tool_use') {
        let toolResult: string;

        if (block.name === 'get_weather') {
          // Execute tool
          toolResult = await getWeather(block.input.location);
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: toolResult,
        });
      }
    }

    // Add tool results
    messages.push({
      role: 'user',
      content: toolResults,
    });

    // Continue conversation
    response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      tools: tools,
      messages: messages,
    });
  }

  // Step 3: Extract final text response
  for (const block of response.content) {
    if (block.type === 'text') {
      return block.text;
    }
  }
}

async function getWeather(location: string): Promise<string> {
  // Simulated weather service
  return `${location}: 72°F, sunny`;
}

// Usage
const answer = await chat('What is the weather in San Francisco and New York?');
console.log(answer);
```

---

## Anthropic SDK

### Latest SDK Versions (2025)

**TypeScript/Node.js**:
- Package: `@anthropic-ai/sdk`
- Latest version: 0.71.2+
- Install: `npm install @anthropic-ai/sdk`

**Python**:
- Package: `anthropic`
- Install: `pip install anthropic`

**Ruby**:
- Package: `anthropic`
- Install: `gem install anthropic`

### SDK Features

- **Streaming helpers** - Built-in text and event streaming
- **Tool runner (beta)** - Automatic tool execution loops
- **Type safety** - Full TypeScript support with type inference
- **Async/await** - Native async/await with streams
- **Error handling** - Automatic retries and error management
- **Beta features** - Easy beta header management

### Basic SDK Usage

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Simple request
const message = await client.messages.create({
  model: 'claude-opus-4-6',
  max_tokens: 1024,
  messages: [
    { role: 'user', content: 'Hello!' },
  ],
});

console.log(message.content[0].text);

// Streaming
const stream = client.messages.stream({
  model: 'claude-opus-4-6',
  max_tokens: 1024,
  messages: [
    { role: 'user', content: 'Hello!' },
  ],
});

for await (const chunk of stream) {
  if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
    process.stdout.write(chunk.delta.text);
  }
}
```

---

## Advanced Features

### Structured Outputs (Strict Tool Use)

Guarantee tool inputs match your schema exactly:

```typescript
const tools = [
  {
    name: 'extract_data',
    description: 'Extract structured data',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
      },
      required: ['name', 'age'],
    },
    strict: true,  // Guarantee schema conformance
  },
];
```

With `strict: true`, Claude's tool calls are guaranteed to match the schema exactly (no missing fields, correct types).

### Extended Thinking (Beta)

Enable Claude to think through complex problems:

```typescript
const response = await client.messages.create({
  model: 'claude-opus-4-6',
  max_tokens: 20000,
  thinking: {
    type: 'enabled',
    budget_tokens: 10000,
  },
  messages: [
    { role: 'user', content: 'Solve this complex problem...' },
  ],
});

// Response includes thinking blocks
for (const block of response.content) {
  if (block.type === 'thinking') {
    console.log('Thinking:', block.thinking);
  } else if (block.type === 'text') {
    console.log('Response:', block.text);
  }
}
```

### Tool Search (Beta)

For hundreds of tools, defer loading until needed:

```typescript
const tools = [
  {
    name: 'math_tools',
    description: 'Various mathematical operations',
    defer_loading: true,
  },
  // ...more deferred tools
];
```

Claude will automatically search and load only the tools it needs.

### Web Search Tool

Built-in server tool for web searching:

```typescript
const response = await client.messages.create({
  model: 'claude-opus-4-6',
  max_tokens: 1024,
  tools: [
    {
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: 5,
    },
  ],
  messages: [
    { role: 'user', content: 'What is the latest news about AI?' },
  ],
});
```

### Parallel Tool Use

Claude can call multiple tools simultaneously. Ensure proper formatting:

```typescript
// Multiple tools called in parallel
// Response has multiple tool_use blocks

// When sending results, put all in one user message
const messages = [
  { role: 'user', content: 'Get weather for SF and NYC' },
  { role: 'assistant', content: [toolUse1, toolUse2] },
  {
    role: 'user',
    content: [
      { type: 'tool_result', tool_use_id: id1, content: 'SF: 72°F' },
      { type: 'tool_result', tool_use_id: id2, content: 'NYC: 65°F' },
    ],
  },
];
```

### Prompt Caching

Cache frequently-used content:

```typescript
const response = await client.messages.create({
  model: 'claude-opus-4-6',
  max_tokens: 1024,
  system: [
    {
      type: 'text',
      text: 'You are a helpful assistant.',
      cache_control: { type: 'ephemeral' },
    },
  ],
  messages: [
    { role: 'user', content: 'Hello!' },
  ],
});
```

---

## Models Available (2025)

| Model | Latest Version | Notes |
|-------|---|---|
| **Claude Opus 4.6** | Latest | Most capable, best for complex tasks |
| **Claude Sonnet 4.5** | Latest | Balanced performance/cost |
| **Claude Haiku 4.5** | Latest | Fastest, lowest cost |

Use `claude-opus-4-6` for the best tool use capabilities and reasoning.

---

## Error Handling

### Common Stop Reasons

- `end_turn` - Response complete
- `tool_use` - Claude wants to use a tool
- `max_tokens` - Hit token limit (increase `max_tokens`)
- `stop_sequence` - Custom stop sequence reached

### Handling Tool Errors

```typescript
const toolResult = {
  type: 'tool_result',
  tool_use_id: toolUseId,
  content: 'Error: API request failed',
  is_error: true,
};

// Claude will handle the error and retry or ask for clarification
```

### Rate Limits

The SDK includes automatic retry logic with exponential backoff. For rate limit handling:

```typescript
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 5,  // Number of retries for rate limits
  timeout: 60000, // Timeout in ms
});
```

---

## Best Practices Summary

1. **Streaming**: Use for all responses where latency matters
2. **Tool definitions**: Write detailed descriptions, minimum 3-4 sentences
3. **Tool results**: Always send in a single user message, results first
4. **Granular tools**: Create specific, focused tools instead of monolithic ones
5. **Error handling**: Use `is_error: true` for execution errors
6. **Parallel tools**: Format results correctly to enable and maintain parallel calling
7. **Model selection**: Use Opus 4.6 for complex tool use, Sonnet/Haiku for simpler tasks
8. **Streaming + tools**: Use tool runner or handle events manually for combined streaming/tool use

---

## References

- [Streaming Messages](https://platform.claude.com/docs/en/build-with-claude/streaming)
- [Tool Use Implementation](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use)
- [Tool Use Overview](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)
- [Fine-Grained Tool Streaming](https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming)
- [Anthropic SDK - TypeScript](https://github.com/anthropics/anthropic-sdk-typescript)
- [Anthropic SDK - Python](https://github.com/anthropics/anthropic-sdk-python)
