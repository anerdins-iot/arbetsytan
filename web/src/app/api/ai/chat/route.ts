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
import { prisma, tenantDb, userDb } from "@/lib/db";
import { getModel, streamConfig, type ProviderKey } from "@/lib/ai/providers";
import { searchDocuments } from "@/lib/ai/embeddings";
import { searchAllSources, type UnifiedSearchResult } from "@/lib/ai/unified-search";
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
import { fetchFileFromMinIO } from "@/lib/ai/ocr";
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
  imageFileIds?: string[];
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

  const { messages, conversationId, projectId, provider, imageFileIds } = body;

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
  // Fallback priority: requested provider → GEMINI_FLASH → OPENAI → CLAUDE_HAIKU
  const FALLBACK_ORDER: ProviderKey[] = ["GEMINI_FLASH", "OPENAI", "CLAUDE_HAIKU", "GEMINI_PRO", "MISTRAL_SMALL"];
  const resolveProvider = (requested: ProviderKey | undefined): ProviderKey | null => {
    const candidates = requested ? [requested, ...FALLBACK_ORDER.filter(p => p !== requested)] : FALLBACK_ORDER;
    for (const candidate of candidates) {
      const key = getRequiredEnvKeyForProvider(candidate);
      if (key && process.env[key]?.trim()) return candidate;
    }
    return null;
  };
  const resolvedProvider = resolveProvider(provider as ProviderKey | undefined);

  logger.info("AI chat ENV check", {
    requestedProvider: provider,
    resolvedProvider,
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    hasOpenaiKey: !!process.env.OPENAI_API_KEY,
    hasGoogleKey: !!process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  });

  if (!resolvedProvider) {
    logger.warn("AI chat: no API key configured for any provider");
    return NextResponse.json(
      { error: "AI provider not configured. Check server environment variables." },
      { status: 503 }
    );
  }

  const providerKey = resolvedProvider;

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
        provider: provider ?? "CLAUDE_HAIKU",
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

  // Add web search tool (Anthropic-only: uses anthropic.tools.webSearch)
  const isAnthropicProvider = providerKey === "CLAUDE_HAIKU" || providerKey === "CLAUDE_SONNET";

  const tools = {
    ...personalTools,
    ...(isAnthropicProvider
      ? {
          web_search: anthropic.tools.webSearch_20250305({
            maxUses: 10,
            blockedDomains: [
              'facebook.com', 'instagram.com', 'tiktok.com', 'twitter.com', 'x.com',
              'snapchat.com', 'linkedin.com',
              'reddit.com', 'youtube.com', 'twitch.tv',
              'pinterest.com', 'tumblr.com',
            ],
          }),
        }
      : {}),
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

  // Unified semantic search: search knowledge, conversations, and documents (with 500ms timeout)
  let knowledgeContext = "";
  let searchResults: UnifiedSearchResult[] = [];
  try {
    // Use last 3 user messages as query to handle follow-up questions like "Och kontaktpersonen?"
    const recentUserMsgs = [...messages].filter(m => m.role === "user").slice(-3);
    if (recentUserMsgs.length > 0) {
      const queryText = recentUserMsgs.map(extractTextFromParts).join(" ");

      if (queryText.trim()) {
        const searchPromise = searchAllSources({
          queryText,
          userId,
          tenantId,
          projectId: projectId ?? undefined,
          limit: 20,
          threshold: 0.5,
        });
        const timeoutPromise = new Promise<UnifiedSearchResult[]>((resolve) =>
          setTimeout(() => resolve([]), 500)
        );
        searchResults = await Promise.race([searchPromise, timeoutPromise]);

        if (searchResults.length > 0) {
          const knowledge = searchResults.filter(r => r.source === "knowledge").slice(0, 10);
          const conversations = searchResults.filter(r => r.source === "conversation").slice(0, 10);
          const documents = searchResults.filter(r => r.source === "document").slice(0, 10);

          const sections: string[] = [];
          if (knowledge.length > 0) {
            sections.push("Från kunskapsbas:\n" + knowledge.map(r => `- ${r.text}`).join("\n"));
          }
          if (conversations.length > 0) {
            sections.push("Från tidigare konversationer:\n" + conversations.map(r => `- ${r.text}`).join("\n"));
          }
          if (documents.length > 0) {
            sections.push("Från projektdokument:\n" + documents.map(r => `- ${r.text}`).join("\n"));
          }
          if (sections.length > 0) {
            knowledgeContext = "=== AUTOMATISK KONTEXT ===\n" + sections.join("\n\n");
          }
        }
      }
    }
  } catch (searchErr) {
    logger.warn("Unified search failed, continuing without context", {
      error: searchErr instanceof Error ? searchErr.message : String(searchErr),
    });
    // Fallback to time-based knowledge entities
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
    } catch (fallbackErr) {
      logger.warn("Fallback knowledge fetch also failed", {
        error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
      });
    }
  }

  // Fetch image files from MinIO and prepare base64 data URLs for vision
  const imageDataUrls: string[] = [];
  if (imageFileIds && imageFileIds.length > 0) {
    try {
      const imageFiles = await prisma.file.findMany({
        where: { id: { in: imageFileIds } },
        select: { id: true, bucket: true, key: true, type: true, name: true },
      });

      for (const imgFile of imageFiles) {
        try {
          const buffer = await fetchFileFromMinIO(imgFile.bucket, imgFile.key);
          const base64 = buffer.toString("base64");
          const mimeType = imgFile.type || "image/jpeg";
          imageDataUrls.push(`data:${mimeType};base64,${base64}`);
        } catch (imgErr) {
          logger.warn("Failed to fetch image file from MinIO", {
            fileId: imgFile.id,
            error: imgErr instanceof Error ? imgErr.message : String(imgErr),
          });
        }
      }
    } catch (dbErr) {
      logger.warn("Failed to fetch image files from DB", {
        imageFileIds,
        error: dbErr instanceof Error ? dbErr.message : String(dbErr),
      });
    }
  }

  const isFirstTurn = messages.filter((m) => m.role === "user").length <= 1;
  const hasAttachedImages = imageDataUrls.length > 0;
  const systemPrompt = buildSystemPrompt({
    userName: user.name ?? undefined,
    userRole: role,
    projectId: projectId ?? undefined,
    projectContext,
    ragContext,
    knowledgeContext,
    checkUnreadOnStart: isFirstTurn,
    conversationSummary,
    hasAttachedImages,
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

  // If we have images, inject image parts into the last user model message
  if (imageDataUrls.length > 0) {
    for (let i = modelMessages.length - 1; i >= 0; i--) {
      const msg = modelMessages[i];
      if (msg.role === "user") {
        const imageParts = imageDataUrls.map((dataUrl) => ({
          type: "image" as const,
          image: dataUrl,
        }));
        // ModelMessage user content can be an array of parts
        const existingContent = Array.isArray(msg.content)
          ? msg.content
          : [{ type: "text" as const, text: typeof msg.content === "string" ? msg.content : "" }];
        modelMessages[i] = {
          ...msg,
          content: [...existingContent, ...imageParts],
        };
        break;
      }
    }
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
    onFinish: async ({ text, response }) => {
      const actualModelId = response?.modelId;
      logger.info("onFinish: triggered", { activeConversationId, textLength: text?.length ?? 0, actualModelId });
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
          udb,
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

  // Headers: conversation ID, model key and optional RAG sources for client
  const responseHeaders: Record<string, string> = {
    "X-Conversation-Id": activeConversationId,
    "X-Model-Key": providerKey,
  };
  if (ragSources.length > 0) {
    // Base64 encode to avoid ByteString errors with Unicode characters in excerpts
    responseHeaders["X-Sources"] = Buffer.from(JSON.stringify(ragSources), "utf-8").toString("base64");
  }

  // Debug context: send unified search results to frontend for RAG debug modal
  if (searchResults.length > 0) {
    const recentUserMsgsForDebug = [...messages].filter(m => m.role === "user").slice(-3);
    const debugQueryText = recentUserMsgsForDebug.map(extractTextFromParts).join(" ");
    const knowledge = searchResults.filter(r => r.source === "knowledge").slice(0, 10);
    const conversations = searchResults.filter(r => r.source === "conversation").slice(0, 10);
    const documents = searchResults.filter(r => r.source === "document").slice(0, 10);
    const debugContext = {
      knowledge: knowledge.map(r => ({ text: r.text, similarity: r.similarity })),
      conversations: conversations.map(r => ({ text: r.text, similarity: r.similarity })),
      documents: documents.map(r => ({ text: r.text, similarity: r.similarity, metadata: r.metadata })),
      totalResults: searchResults.length,
      queryText: debugQueryText,
    };
    responseHeaders["X-Debug-Context"] = Buffer.from(JSON.stringify(debugContext), "utf-8").toString("base64");
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
    case "CLAUDE_HAIKU":
    case "CLAUDE_SONNET":
      return "ANTHROPIC_API_KEY";
    case "OPENAI":
      return "OPENAI_API_KEY";
    case "MISTRAL_LARGE":
    case "MISTRAL_SMALL":
      return "MISTRAL_API_KEY";
    case "GROK_FAST":
      return "XAI_API_KEY";
    case "GEMINI_PRO":
    case "GEMINI_FLASH":
      return "GOOGLE_GENERATIVE_AI_API_KEY";
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
  hasAttachedImages?: boolean;
}): string {
  const { userName, userRole, projectId, projectContext, ragContext, knowledgeContext, checkUnreadOnStart, conversationSummary, hasAttachedImages } = opts;

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

  // Image analysis instruction when user attaches images
  const imageAnalysisInstruction = hasAttachedImages
    ? "\n\nBILDANALYS: Användaren har bifogat en eller flera bilder. Analysera bilden/bilderna noggrant och beskriv vad du ser. Ställ EN konkret följdfråga för att förstå sammanhanget bättre — t.ex. vad bilden föreställer, var den togs, eller hur den relaterar till arbetet."
    : "";

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
    imageAnalysisInstruction,
    knowledgeBlock,
    summaryBlock
  );

  const base = parts.join(" ");
  return ragContext ? base + ragContext : base;
}
