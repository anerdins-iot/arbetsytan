/**
 * POST /api/ai/chat — AI chat streaming endpoint.
 * Personal AI only. Frontend sends projectId in request body when a project is selected.
 * RAG uses request projectId when present. All conversations are PERSONAL.
 * Uses Vercel AI SDK for streaming via SSE.
 */
import { streamText, stepCountIs, type UIMessage, convertToModelMessages } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { getSession, requireProject } from "@/lib/auth";
import { tenantDb } from "@/lib/db";
import { getModel, streamConfig, type ProviderKey } from "@/lib/ai/providers";
import { searchDocuments } from "@/lib/ai/embeddings";
import { createPersonalTools } from "@/lib/ai/tools/personal-tools";
import { summarizeConversationIfNeeded } from "@/lib/ai/summarize-conversation";
import { MESSAGE_SUMMARY_THRESHOLD } from "@/lib/ai/conversation-config";
import { logger } from "@/lib/logger";

export type RagSource = {
  fileName: string;
  page: number | null;
  similarity: number;
  excerpt: string;
};

type ChatRequestBody = {
  messages: UIMessage[];
  conversationId?: string;
  projectId?: string;
  provider?: ProviderKey;
};

export async function POST(req: NextRequest) {
  try {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { user, tenantId, role } = session;
  const userId = user.id;
  const db = tenantDb(tenantId);

  let body: ChatRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { messages, conversationId, projectId, provider } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: "Messages array is required" },
      { status: 400 }
    );
  }

  // Validate project access when projectId is provided
  if (projectId) {
    try {
      await requireProject(tenantId, projectId, userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Forbidden";
      const status = message === "PROJECT_NOT_FOUND" ? 404 : 403;
      return NextResponse.json({ error: message }, { status });
    }
  }

  // Debug: runtime ENV visibility (Next.js standalone may not load Coolify ENV at runtime)
  const providerKey = provider ?? "CLAUDE";
  logger.info("AI chat ENV check", {
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    anthropicKeyLength: process.env.ANTHROPIC_API_KEY?.length ?? 0,
    hasOpenaiKey: !!process.env.OPENAI_API_KEY,
    openaiKeyLength: process.env.OPENAI_API_KEY?.length ?? 0,
    relevantEnvKeys: Object.keys(process.env).filter(
      (k) => k.includes("ANTHROPIC") || k.includes("OPENAI") || k.includes("MISTRAL")
    ),
  });

  // Ensure AI provider API key is configured (fail fast with clear error)
  const envKey = getRequiredEnvKeyForProvider(providerKey);
  if (!envKey || !process.env[envKey]?.trim()) {
    logger.warn("AI chat: missing API key for provider", { provider: providerKey, envKey });
    return NextResponse.json(
      { error: "AI provider not configured. Check server environment variables." },
      { status: 503 }
    );
  }

  // Get or create conversation
  let activeConversationId = conversationId;
  let conversationSummary: string | null = null;

  if (!activeConversationId) {
    const lastUserMsg = messages.filter((m) => m.role === "user").pop();
    const title = lastUserMsg
      ? extractTextFromParts(lastUserMsg).slice(0, 100)
      : "Ny konversation";

    const conversation = await db.conversation.create({
      data: {
        type: "PERSONAL",
        title,
        provider: provider ?? "CLAUDE",
        userId,
        projectId: null,
      },
    });
    activeConversationId = conversation.id;
  } else {
    // Verify conversation belongs to this user and get summary for context
    const existing = await db.conversation.findFirst({
      where: {
        id: activeConversationId,
        userId,
      },
      select: { id: true, summary: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }
    conversationSummary = existing.summary;
  }

  // Save the latest user message to DB (with projectId when provided)
  const lastUserMessage = messages[messages.length - 1];
  if (lastUserMessage && lastUserMessage.role === "user") {
    await db.message.create({
      data: {
        role: "USER",
        content: extractTextFromParts(lastUserMessage),
        conversationId: activeConversationId,
        projectId: projectId ?? null,
      },
    });
  }

  // RAG: for project chats, fetch relevant document chunks and build context
  let ragSources: RagSource[] = [];
  let ragContext = "";
  const lastUserMsg = messages.filter((m) => m.role === "user").pop();
  const lastUserText = lastUserMsg ? extractTextFromParts(lastUserMsg) : "";

  if (projectId && lastUserText.trim()) {
    try {
      const chunks = await searchDocuments(tenantId, projectId, lastUserText, {
        limit: 8,
        threshold: 0.5,
      });
      if (chunks.length > 0) {
        const contextParts = chunks.map(
          (chunk, i) =>
            `[${i + 1}] (fil: ${chunk.fileName}${chunk.page != null ? `, sida ${chunk.page}` : ""})\n${chunk.content}`
        );
        ragContext = `\n\nRelevanta dokument från projektet (citera med [1], [2] osv. när du använder dem):\n\n${contextParts.join("\n\n")}`;
        ragSources = chunks.map((chunk) => ({
          fileName: chunk.fileName,
          page: chunk.page,
          similarity: chunk.similarity,
          excerpt: chunk.content.slice(0, 120) + (chunk.content.length > 120 ? "..." : ""),
        }));
      }
    } catch (ragErr) {
      logger.warn("RAG search failed, continuing without context", {
        projectId,
        error: ragErr instanceof Error ? ragErr.message : String(ragErr),
      });
    }
  }

  // Select AI model
  const model = getModel(providerKey);

  // Always use personal tools (they accept projectId per call when user works in a project)
  const tools = createPersonalTools({ db, tenantId, userId });

  // Project context for system prompt when request has projectId
  let projectContext: { name: string; address: string | null; status: string; taskCount: number; memberCount: number } | undefined;
  if (projectId) {
    const [project, taskCount, memberCount] = await Promise.all([
      db.project.findUnique({
        where: { id: projectId },
        select: { name: true, address: true, status: true },
      }),
      db.task.count({ where: { projectId } }),
      db.projectMember.count({ where: { projectId } }),
    ]);
    if (project) {
      projectContext = {
        name: project.name,
        address: project.address,
        status: project.status,
        taskCount,
        memberCount,
      };
    }
  }

  const isFirstTurn = messages.filter((m) => m.role === "user").length <= 1;
  const systemPrompt = buildSystemPrompt({
    userName: user.name ?? undefined,
    userRole: role,
    projectId: projectId ?? undefined,
    projectContext,
    ragContext,
    checkUnreadOnStart: isFirstTurn,
    conversationSummary,
  });

  logger.info("AI chat request", {
    userId,
    tenantId,
    provider: providerKey,
    conversationId: activeConversationId,
    projectId: projectId ?? null,
    messageCount: messages.length,
    ragChunks: ragSources.length,
  });

  // Convert UI messages to model messages for streamText
  let modelMessages;
  try {
    modelMessages = await convertToModelMessages(messages);
  } catch (convertErr) {
    logger.error("AI chat: invalid message format", {
      error: convertErr instanceof Error ? convertErr.message : String(convertErr),
    });
    return NextResponse.json(
      { error: "Invalid message format" },
      { status: 400 }
    );
  }

  // Stream the response (with tools for project and personal AI)
  const result = streamText({
    model,
    system: systemPrompt,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(8),
    ...streamConfig,
    onError: ({ error }) => {
      logger.error("AI stream error", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
        hasOpenaiKey: !!process.env.OPENAI_API_KEY,
      });
    },
    onFinish: async ({ text }) => {
      // Save assistant response to DB (with same projectId as request)
      if (text && activeConversationId) {
        await db.message.create({
          data: {
            role: "ASSISTANT",
            content: text,
            conversationId: activeConversationId,
            projectId: projectId ?? null,
          },
        });
        const count = await db.message.count({
          where: { conversationId: activeConversationId },
        });
        if (count >= MESSAGE_SUMMARY_THRESHOLD) {
          summarizeConversationIfNeeded({ db, conversationId: activeConversationId }).catch(
            (err) =>
              logger.warn("Conversation summarization failed", {
                conversationId: activeConversationId,
                error: err instanceof Error ? err.message : String(err),
              })
          );
        }
      }
    },
  });

  // Headers: conversation ID and optional RAG sources for client
  const responseHeaders: Record<string, string> = {
    "X-Conversation-Id": activeConversationId,
  };
  if (ragSources.length > 0) {
    // Base64 encode to avoid ByteString errors with Unicode characters in excerpts
    responseHeaders["X-Sources"] = Buffer.from(JSON.stringify(ragSources), "utf-8").toString("base64");
  }

  return result.toUIMessageStreamResponse({
    headers: responseHeaders,
  });
  } catch (err) {
    logger.error("AI chat route error", {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
      hasOpenaiKey: !!process.env.OPENAI_API_KEY,
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

/** Env var name required for each chat provider. */
function getRequiredEnvKeyForProvider(provider: ProviderKey): string | null {
  switch (provider) {
    case "CLAUDE":
      return "ANTHROPIC_API_KEY";
    case "OPENAI":
      return "OPENAI_API_KEY";
    case "MISTRAL":
      return "MISTRAL_API_KEY";
    default:
      return null;
  }
}

/** Extract text content from a UIMessage's parts array. */
function extractTextFromParts(message: UIMessage): string {
  return (message.parts ?? [])
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function buildSystemPrompt(opts: {
  userName?: string;
  userRole: string;
  projectId?: string;
  projectContext?: {
    name: string;
    address: string | null;
    status: string;
    taskCount: number;
    memberCount: number;
  };
  ragContext?: string;
  checkUnreadOnStart?: boolean;
  conversationSummary?: string | null;
}): string {
  const { userName, userRole, projectId, projectContext, ragContext, checkUnreadOnStart, conversationSummary } = opts;

  const summaryBlock =
    conversationSummary && conversationSummary.trim()
      ? `\n\nTidigare sammanfattning av konversationen:\n${conversationSummary}`
      : "";

  const unreadHint =
    checkUnreadOnStart === true
      ? " Användaren har precis öppnat chatten — anropa getUnreadAIMessages nu och sammanfatta eventuella olästa meddelanden från projekt-AI:er."
      : " Börja alltid med att kolla om det finns olästa meddelanden från projekt-AI:er (använd verktyget getUnreadAIMessages).";

  const parts: string[] = [];

  // When project is selected: lead with explicit context so the model always knows the active project
  if (projectContext && projectId) {
    parts.push(
      "[Kontext: Användaren jobbar just nu med projektet \"" + projectContext.name + "\".]",
      "",
      "AKTIVT PROJEKT:",
      "- Projektnamn: " + projectContext.name,
      "- ID: " + projectId,
      "- Alla frågor om 'projektet', 'detta projekt' eller 'mitt projekt' refererar till detta projekt.",
      "- Använd alltid detta projectId i verktygsanrop som kräver projektkontext.",
      "- Övrig info: status " + projectContext.status + ", adress " + (projectContext.address ?? "ej angiven") + ", " + projectContext.taskCount + " uppgifter, " + projectContext.memberCount + " medlemmar.",
      ""
    );
  }

  parts.push(
    `Du är en personlig arbetsassistent åt ${userName ?? "användaren"}.`,
    `Användaren har rollen ${userRole}.`,
    "Du hjälper med personliga saker och med projekt — användaren kan byta projekt när som helst. Du har tillgång till verktyg för alla användarens projekt (ange projectId när du arbetar i ett specifikt projekt).",
    unreadHint,
  );

  parts.push(
    "Svara på svenska, var konkret och kort.",
    "När du använder information från dokument, citera källan med [1], [2] enligt numreringen nedan.",
    "Om du inte vet svaret, säg det istället för att gissa.",
    summaryBlock
  );

  const base = parts.join(" ");
  return ragContext ? base + ragContext : base;
}
