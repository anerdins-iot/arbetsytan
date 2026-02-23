/**
 * POST /api/ai/chat — AI chat streaming endpoint.
 * Personal AI only. Frontend sends projectId in request body when a project is selected.
 * RAG uses request projectId when present. All conversations are PERSONAL.
 * Uses Vercel AI SDK for streaming via SSE.
 */
import { streamText, stepCountIs, type UIMessage, convertToModelMessages } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { NextRequest, NextResponse } from "next/server";
import { getSession, requireProject } from "@/lib/auth";
import { tenantDb, userDb } from "@/lib/db";
import { getModel, streamConfig, type ProviderKey } from "@/lib/ai/providers";
import { searchDocuments } from "@/lib/ai/embeddings";
import { createPersonalTools } from "@/lib/ai/tools/personal-tools";
import { summarizeConversationIfNeeded } from "@/lib/ai/summarize-conversation";
import {
  extractAndSaveKnowledge,
  cleanupOldKnowledge,
} from "@/lib/ai/knowledge-extractor";
import { MESSAGE_SUMMARY_THRESHOLD } from "@/lib/ai/conversation-config";
import {
  type MessageEmbeddingsDb,
  queueMessageEmbeddingProcessing,
} from "@/lib/ai/message-embeddings";
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
  const udb = userDb(userId, {});

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

    const conversation = await udb.conversation.create({
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
    const existing = await udb.conversation.findFirst({
      where: { id: activeConversationId },
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

  // Save the latest user message to DB (personal AI: use userDb for auto-emit)
  const lastUserMessage = messages[messages.length - 1];
  if (lastUserMessage && lastUserMessage.role === "user") {
    const userMsg = await udb.message.create({
      data: {
        role: "USER",
        content: extractTextFromParts(lastUserMessage),
        conversationId: activeConversationId,
        projectId: projectId ?? null,
      },
      select: { id: true },
    });
    queueMessageEmbeddingProcessing(
      udb as unknown as MessageEmbeddingsDb,
      userMsg.id,
      activeConversationId,
      tenantId,
      userId,
      projectId ?? null
    );
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
  const personalTools = createPersonalTools({ db, tenantId, userId, udb });

  // Add web search tool
  const webSearchTool = anthropic.tools.webSearch_20250305({
    maxUses: 10,  // Max 10 sökningar per konversation
    blockedDomains: [
      // Sociala medier
      'facebook.com', 'instagram.com', 'tiktok.com', 'twitter.com', 'x.com',
      'snapchat.com', 'linkedin.com',
      // Underhållning
      'reddit.com', 'youtube.com', 'twitch.tv',
      // Övrigt irrelevant
      'pinterest.com', 'tumblr.com',
    ],
  });

  const tools = {
    ...personalTools,
    web_search: webSearchTool,
  };

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

  // Knowledge base: fetch relevant entities for this user (tenantId + userId in metadata), max 15, lastSeen desc
  let knowledgeContext = "";
  try {
    const entities = await db.knowledgeEntity.findMany({
      where: {
        tenantId,
        metadata: { path: ["userId"], equals: userId },
      },
      orderBy: { lastSeen: "desc" },
      take: 15,
      select: { entityType: true, entityId: true, metadata: true },
    });
    if (entities.length > 0) {
      knowledgeContext = entities
        .map(
          (e: { entityType: string; entityId: string; metadata: unknown }) =>
            `- ${e.entityType} ${e.entityId}: ${JSON.stringify(e.metadata)}`
        )
        .join("\n");
    }
  } catch (knowledgeErr) {
    logger.warn("Knowledge base fetch failed, continuing without context", {
      error: knowledgeErr instanceof Error ? knowledgeErr.message : String(knowledgeErr),
    });
  }

  const isFirstTurn = messages.filter((m) => m.role === "user").length <= 1;
  const systemPrompt = buildSystemPrompt({
    userName: user.name ?? undefined,
    userRole: role,
    projectId: projectId ?? undefined,
    projectContext,
    ragContext,
    knowledgeContext,
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
      // Save assistant response to DB (personal AI: use userDb for auto-emit)
      if (text && activeConversationId) {
        const assistantMsg = await udb.message.create({
          data: {
            role: "ASSISTANT",
            content: text,
            conversationId: activeConversationId,
            projectId: projectId ?? null,
          },
          select: { id: true },
        });
        queueMessageEmbeddingProcessing(
          udb as unknown as MessageEmbeddingsDb,
          assistantMsg.id,
          activeConversationId,
          tenantId,
          userId,
          projectId ?? null
        );
        const count = await udb.message.count({
          where: { conversationId: activeConversationId },
        });
        if (count >= MESSAGE_SUMMARY_THRESHOLD) {
          summarizeConversationIfNeeded({ db: udb, conversationId: activeConversationId }).catch(
            (err) =>
              logger.warn("Conversation summarization failed", {
                conversationId: activeConversationId,
                error: err instanceof Error ? err.message : String(err),
              })
          );
        }
        extractAndSaveKnowledge({
          db,
          conversationId: activeConversationId,
          tenantId,
          userId,
        }).catch((err) =>
          logger.warn("Knowledge extraction failed", {
            conversationId: activeConversationId,
            error: err instanceof Error ? err.message : String(err),
          })
        );
        if (Math.random() < 0.01) {
          cleanupOldKnowledge(tenantId, db).catch((err) =>
            logger.warn("Knowledge cleanup failed", {
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
  knowledgeContext?: string;
  checkUnreadOnStart?: boolean;
  conversationSummary?: string | null;
}): string {
  const { userName, userRole, projectId, projectContext, ragContext, knowledgeContext, checkUnreadOnStart, conversationSummary } = opts;

  const knowledgeBlock =
    knowledgeContext && knowledgeContext.trim()
      ? `\n\nKunskapsbas (relevant kontext för användaren):\n${knowledgeContext}`
      : "";

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

  // PROACTIVE POLICY - Strict rules for agent behavior
  const proactivePolicy = `
PROAKTIV POLICY - Du MÅSTE följa dessa regler:
1. VAR ALLTID PROAKTIV: Vid otydliga eller korta frågor, börja undersöka direkt istället för att ställa motfrågor.
2. INGA MOTFRÅGOR FÖRST: Om det går att undersöka med verktyg först, gör det. Fråga aldrig "Vilket projekt menar du?" om du kan hitta svaret genom att söka i projektlistan eller senast ändrade projekt.
3. BRED SÖKNING: Kör breda sökningar (gärna parallellt om möjligt) över alla relevanta verktyg och datakällor innan du ger upp.
4. MEST SANNOLIKA RESULTAT FÖRST: Presentera de mest troliga svaren/resultaten tydligt.
5. GE ALLTID ETT FÖRSLAG: Om osäkerhet kvarstår efter sökning, ge ett konkret förslag baserat på vad du hittat och fråga "Menar du detta?" istället för en generell fråga.
6. SLUTA ALDRIG MED EN FRÅGA UTAN ATT HA GJORT NÅGOT: Du ska alltid ha utfört minst ett verktygsanrop eller presenterat information innan du frågar användaren om något.
7. OBLIGATORISK SÖKNING: Innan du svarar på någon fråga, sök alltid först i användarens data. Svara aldrig "jag vet inte" eller "vill du att jag söker" utan att först ha sökt. Om sökningen inte ger resultat, säg det, men sök först.`;

  // Search strategy guidance - helps AI find information systematically
  const searchStrategy = `
SÖKSTRATEGI - Använd denna ordning när användaren söker efter något:
1. searchFiles - Semantisk sökning i alla dokument (PDF, ritningar med OCR-text)
2. getProjectFiles/listFiles - Lista filer i specifikt projekt (om projectId känt)
3. searchNotes/searchPersonalNotes - Sök i anteckningar
4. getProjectTasks/getUserTasks - Kolla uppgifter
5. getProjectNotes/getPersonalNotes - Lista alla anteckningar
6. searchMyEmails - Sök i användarens e-post (inkommande och utgående). Om ett resultat har conversationId, använd getConversationContext(conversationId) för att läsa hela mailtråden.

GE INTE UPP efter ett misslyckat verktygsanrop! Prova nästa verktyg i listan.
Om searchFiles ger 0 resultat, prova getProjectFiles för att lista alla filer och sök manuellt.
Om användaren nämner ett specifikt projekt eller är i ett projekt, börja där.`;

  // E-mail search - AI can search and read full threads
  const emailSearchGuidance = `
E-POST: Du kan söka i användarens mail med searchMyEmails. När ett resultat har conversationId kan du använda getConversationContext(conversationId) för att läsa hela tråden (alla meddelanden).`;

  // Image display - AI can show images in chat via presigned URL
  const imageDisplayGuidance = `
VISNING AV BILDER/FILER I CHATTEN: När användaren vill se, visa eller öppna en bild (eller fil), använd getFilePreviewUrl med fileId (och projectId om det är en projektfil). Inkludera sedan bilden i svaret med markdown: ![filnamn eller beskrivning](previewUrl). För icke-bilder kan du returnera previewUrl så användaren kan öppna filen.`;

  // Web search guidance - when and how to use web search
  const webSearchGuidance = `
WEB SEARCH - Du har tillgång till web_search för att hitta aktuell information från internet.

Använd web_search när:
- Användaren frågar om aktuella priser, nyheter eller händelser
- Information kan vara föråldrad (lagar, regler, byggstandarder)
- Specifika produkter, leverantörer eller kontaktinfo behövs
- Tekniska specifikationer eller produktdata saknas i systemet

Använd INTE web_search för:
- Projektdata som finns i systemet (använd dina andra verktyg först)
- Generella frågor du redan kan svara på
- Uppgifter, filer, tidrapporter, anteckningar etc.

VIKTIGT: När du använder web_search, citera alltid källorna i ditt svar.`;

  // Document search guidance - always instruct, but especially when no project context
  const searchGuidance = projectId
    ? ""
    : " VIKTIGT: När användaren frågar om dokument, filer, ritningar, eller specifikt innehåll — använd sökstrategin ovan. Svara ALDRIG 'jag hittade inget' utan att ha provat minst 2-3 verktyg!";

  parts.push(
    "Svara på svenska, var konkret och kort.",
    "När du använder information från dokument, citera källan med [1], [2] enligt numreringen nedan.",
    "Om du inte vet svaret efter att ha sökt ordentligt, säg det.",
    proactivePolicy,
    searchStrategy,
    emailSearchGuidance,
    imageDisplayGuidance,
    webSearchGuidance,
    searchGuidance,
    knowledgeBlock,
    summaryBlock
  );

  const base = parts.join(" ");
  return ragContext ? base + ragContext : base;
}
