/**
 * Shared AI core module.
 * Extracts reusable AI logic from the HTTP chat route so that both
 * the web app (Next.js API route) and other consumers (e.g. Discord bot)
 * can share the same system prompt, tool schemas, and streamText wrapper.
 *
 * This module is server-only (imports DB clients and AI providers).
 */
import { streamText, stepCountIs, type UIMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { tenantDb, userDb, prisma, type TenantScopedClient, type UserScopedClient } from "@/lib/db";
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

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

/** Context for an AI chat session. Contains all auth/tenant/user/project info. */
export interface AIContext {
  tenantId: string;
  userId: string;
  userName?: string;
  userRole: string;
  projectId?: string | null;
  conversationId: string;
  conversationType: "PERSONAL" | "PROJECT";
  /**
   * Whether this is a Discord DM (direct message).
   * When false (guild channel): personal tools are excluded, and if projectId is set,
   * only that project's tools are available.
   * When true or undefined (web/DM): all tools are available.
   */
  isDiscordDM?: boolean;
}

/** Options for executing an AI chat stream. */
export interface ExecuteAIChatOptions {
  context: AIContext;
  messages: UIMessage[];
  provider?: ProviderKey;
  imageFileIds?: string[];
  /** Pre-resolved image data URLs (e.g. from Discord bot). Merged with imageFileIds results. */
  inlineImageDataUrls?: string[];
  /** Pre-resolved conversation summary (if known). */
  conversationSummary?: string | null;
  /** Callback when the AI stream encounters an error. */
  onStreamError?: (error: unknown) => void;
  /** Callback when the AI stream finishes (text only). */
  onStreamFinish?: (text: string) => void;
  /** AbortSignal to cancel the AI request (e.g. from request.signal). */
  abortSignal?: AbortSignal;
}

/** RAG source metadata returned alongside the stream. */
export type RagSource = {
  fileName: string;
  page: number | null;
  similarity: number;
  excerpt: string;
};

/** A file created by a tool during the AI chat (e.g. PDF, Excel, Word). */
export interface AIChatFile {
  fileId: string;
  fileName: string;
  downloadUrl: string;
}

/** Result from executeAIChat containing the stream and metadata. */
export interface AIChatResult {
  /** The Vercel AI SDK streamText result. Use toUIMessageStreamResponse(), toTextStreamResponse(), etc. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stream: ReturnType<typeof streamText<any, any>>;
  /** The resolved provider key actually used. */
  providerKey: ProviderKey;
  /** RAG document sources found for this request. */
  ragSources: RagSource[];
  /** Unified search results for debug context. */
  searchResults: UnifiedSearchResult[];
  /** The system prompt that was used. */
  systemPrompt: string;
  /**
   * Files created by tools during the AI chat.
   * This is a promise that resolves after the stream is fully consumed.
   * Call `await result.files` after `await result.stream.text` (or equivalent).
   */
  files: Promise<AIChatFile[]>;
}

// ─────────────────────────────────────────
// Provider Resolution
// ─────────────────────────────────────────

const FALLBACK_ORDER: ProviderKey[] = [
  "GEMINI_FLASH",
  "OPENAI",
  "CLAUDE_HAIKU",
  "GEMINI_PRO",
  "MISTRAL_SMALL",
];

/** Env var name required for each chat provider. */
export function getRequiredEnvKeyForProvider(
  provider: ProviderKey
): string | null {
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

/**
 * Resolve the best available provider.
 * Tries the requested provider first, then falls back in FALLBACK_ORDER.
 * Returns null if no provider has a configured API key.
 */
export function resolveProvider(
  requested: ProviderKey | undefined
): ProviderKey | null {
  const candidates = requested
    ? [requested, ...FALLBACK_ORDER.filter((p) => p !== requested)]
    : FALLBACK_ORDER;
  for (const candidate of candidates) {
    const key = getRequiredEnvKeyForProvider(candidate);
    if (key && process.env[key]?.trim()) return candidate;
  }
  return null;
}

// ─────────────────────────────────────────
// Tool Schemas
// ─────────────────────────────────────────

/**
 * Tool names that are personal/private and should ONLY be available in DMs.
 * These deal with personal files, personal notes, email, and conversation history.
 */
const PERSONAL_ONLY_TOOLS = new Set([
  // Personal files
  "getPersonalFiles",
  "analyzePersonalFile",
  "movePersonalFileToProject",
  "moveProjectFileToPersonal",
  "deletePersonalFile",
  // Personal notes
  "getPersonalNotes",
  "createPersonalNote",
  "updatePersonalNote",
  "deletePersonalNote",
  "togglePersonalNotePin",
  "searchPersonalNotes",
  "getPersonalNoteAttachments",
  "attachFileToPersonalNote",
  "detachFileFromPersonalNote",
  // Email
  "searchMyEmails",
  "getConversationContext",
  "getMyRecentEmails",
  "listEmailTemplates",
  "getEmailTemplate",
  "updateEmailTemplate",
  "previewEmailTemplate",
  "prepareEmailToExternalRecipients",
  "prepareEmailToTeamMembers",
  "prepareEmailToProjectMembers",
  "getTeamMembersForEmailTool",
  "getProjectsForEmailTool",
  "getProjectMembersForEmailTool",
  // Conversation history
  "searchConversations",
  // Notification settings
  "getNotificationSettings",
  "updateNotificationSettings",
  // Invitations (admin)
  "sendInvitation",
  "listInvitations",
  "cancelInvitation",
  // Automations
  "createAutomation",
  "listAutomations",
  "getAutomation",
  "updateAutomation",
  "pauseAutomation",
  "resumeAutomation",
  "deleteAutomation",
]);

/**
 * Tool names that span across projects and should be excluded in project channels.
 * In a project channel, the AI should only work within that specific project.
 */
const CROSS_PROJECT_TOOLS = new Set([
  "getProjectList",
  "createProject",
  "archiveProject",
  "getUserTasks",
  "getMyTimeEntries",
]);

/**
 * Build the tool schemas for an AI chat session.
 * Returns personal tools + optional web search (Anthropic-only).
 *
 * When called from a Discord guild channel (isDiscordDM === false):
 * - Personal tools are excluded (files, notes, email, conversations)
 * - If a projectId is set, cross-project tools are also excluded
 */
export function buildToolSchemas(context: AIContext, providerKey: ProviderKey) {
  const db = tenantDb(context.tenantId);
  const udb = userDb(context.userId, {});

  const allPersonalTools = createPersonalTools({
    db,
    tenantId: context.tenantId,
    userId: context.userId,
    udb,
  });

  // Determine if we need to filter tools (Discord guild channels only)
  const isGuildChannel = context.isDiscordDM === false;
  const isProjectChannel = isGuildChannel && !!context.projectId;

  let tools: Record<string, unknown>;

  if (isGuildChannel) {
    // Filter out personal-only tools in guild channels
    tools = Object.fromEntries(
      Object.entries(allPersonalTools).filter(([name]) => {
        // Always exclude personal tools in guild channels
        if (PERSONAL_ONLY_TOOLS.has(name)) return false;
        // In project channels, also exclude cross-project tools
        if (isProjectChannel && CROSS_PROJECT_TOOLS.has(name)) return false;
        return true;
      })
    );
  } else {
    // DM or web: all tools available
    tools = allPersonalTools;
  }

  const isAnthropicProvider =
    providerKey === "CLAUDE_HAIKU" || providerKey === "CLAUDE_SONNET";

  return {
    ...tools,
    ...(isAnthropicProvider
      ? {
          web_search: anthropic.tools.webSearch_20250305({
            maxUses: isGuildChannel ? 3 : 10,
            blockedDomains: [
              "facebook.com",
              "instagram.com",
              "tiktok.com",
              "twitter.com",
              "x.com",
              "snapchat.com",
              "linkedin.com",
              "reddit.com",
              "youtube.com",
              "twitch.tv",
              "pinterest.com",
              "tumblr.com",
            ],
          }),
        }
      : {}),
  };
}

// ─────────────────────────────────────────
// RAG Context
// ─────────────────────────────────────────

/** Fetch project-scoped RAG document chunks for the last user message. */
export async function fetchRagContext(
  tenantId: string,
  projectId: string,
  lastUserText: string
): Promise<{ ragSources: RagSource[]; ragContext: string }> {
  let ragSources: RagSource[] = [];
  let ragContext = "";

  if (!lastUserText.trim()) return { ragSources, ragContext };

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
        excerpt:
          chunk.content.slice(0, 120) +
          (chunk.content.length > 120 ? "..." : ""),
      }));
    }
  } catch (ragErr) {
    logger.warn("RAG search failed, continuing without context", {
      projectId,
      error: ragErr instanceof Error ? ragErr.message : String(ragErr),
    });
  }

  return { ragSources, ragContext };
}

// ─────────────────────────────────────────
// Unified Search / Knowledge Context
// ─────────────────────────────────────────

/** Fetch unified search context (knowledge, conversations, documents). */
export async function fetchKnowledgeContext(
  messages: UIMessage[],
  userId: string,
  tenantId: string,
  projectId: string | undefined | null,
  db: TenantScopedClient
): Promise<{ knowledgeContext: string; searchResults: UnifiedSearchResult[] }> {
  let knowledgeContext = "";
  let searchResults: UnifiedSearchResult[] = [];

  try {
    const recentUserMsgs = [...messages]
      .filter((m) => m.role === "user")
      .slice(-3);
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
          const knowledge = searchResults
            .filter((r) => r.source === "knowledge")
            .slice(0, 10);
          const conversations = searchResults
            .filter((r) => r.source === "conversation")
            .slice(0, 10);
          const documents = searchResults
            .filter((r) => r.source === "document")
            .slice(0, 10);

          const sections: string[] = [];
          if (knowledge.length > 0) {
            sections.push(
              "Från kunskapsbas:\n" +
                knowledge.map((r) => `- ${r.text}`).join("\n")
            );
          }
          if (conversations.length > 0) {
            sections.push(
              "Från tidigare konversationer:\n" +
                conversations.map((r) => `- ${r.text}`).join("\n")
            );
          }
          if (documents.length > 0) {
            sections.push(
              "Från projektdokument:\n" +
                documents.map((r) => `- ${r.text}`).join("\n")
            );
          }
          if (sections.length > 0) {
            knowledgeContext =
              "=== AUTOMATISK KONTEXT ===\n" + sections.join("\n\n");
          }
        }
      }
    }
  } catch (searchErr) {
    logger.warn("Unified search failed, continuing without context", {
      error:
        searchErr instanceof Error ? searchErr.message : String(searchErr),
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
            (e: {
              entityType: string;
              entityId: string;
              metadata: unknown;
            }) => `- ${e.entityType} ${e.entityId}: ${JSON.stringify(e.metadata)}`
          )
          .join("\n");
      }
    } catch (fallbackErr) {
      logger.warn("Fallback knowledge fetch also failed", {
        error:
          fallbackErr instanceof Error
            ? fallbackErr.message
            : String(fallbackErr),
      });
    }
  }

  return { knowledgeContext, searchResults };
}

// ─────────────────────────────────────────
// Project Context
// ─────────────────────────────────────────

export interface ProjectContext {
  name: string;
  address: string | null;
  status: string;
  taskCount: number;
  memberCount: number;
}

/** Fetch project summary context for the system prompt. */
export async function fetchProjectContext(
  db: TenantScopedClient,
  projectId: string
): Promise<ProjectContext | undefined> {
  const [project, taskCount, memberCount] = await Promise.all([
    db.project.findUnique({
      where: { id: projectId },
      select: { name: true, address: true, status: true },
    }),
    db.task.count({ where: { projectId } }),
    db.projectMember.count({ where: { projectId } }),
  ]);
  if (!project) return undefined;
  return {
    name: project.name,
    address: project.address,
    status: project.status,
    taskCount,
    memberCount,
  };
}

// ─────────────────────────────────────────
// Image Handling
// ─────────────────────────────────────────

/** Fetch image files from MinIO and return base64 data URLs for vision. */
export async function fetchImageDataUrls(
  imageFileIds: string[]
): Promise<string[]> {
  const imageDataUrls: string[] = [];
  if (imageFileIds.length === 0) return imageDataUrls;

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

  return imageDataUrls;
}

// ─────────────────────────────────────────
// System Prompt
// ─────────────────────────────────────────

export interface BuildSystemPromptOptions {
  userName?: string;
  userRole: string;
  projectId?: string;
  projectContext?: ProjectContext;
  ragContext?: string;
  knowledgeContext?: string;
  checkUnreadOnStart?: boolean;
  conversationSummary?: string | null;
  hasAttachedImages?: boolean;
  /** When true, the AI is in a Discord guild channel (not DM). Limits scope. */
  isDiscordGuildChannel?: boolean;
}

/** Build the full system prompt for an AI chat session. */
export function buildSystemPrompt(opts: BuildSystemPromptOptions): string {
  const {
    userName,
    userRole,
    projectId,
    projectContext,
    ragContext,
    knowledgeContext,
    checkUnreadOnStart,
    conversationSummary,
    hasAttachedImages,
    isDiscordGuildChannel,
  } = opts;

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
      '[Kontext: Användaren jobbar just nu med projektet "' +
        projectContext.name +
        '".]',
      "",
      "AKTIVT PROJEKT:",
      "- Projektnamn: " + projectContext.name,
      "- ID: " + projectId,
      "- Alla frågor om 'projektet', 'detta projekt' eller 'mitt projekt' refererar till detta projekt.",
      "- Använd alltid detta projectId i verktygsanrop som kräver projektkontext.",
      "- Övrig info: status " +
        projectContext.status +
        ", adress " +
        (projectContext.address ?? "ej angiven") +
        ", " +
        projectContext.taskCount +
        " uppgifter, " +
        projectContext.memberCount +
        " medlemmar.",
      ""
    );
  }

  if (isDiscordGuildChannel && projectId && projectContext) {
    // Guild channel with a project: scoped assistant
    parts.push(
      `Du är en projektassistent för "${projectContext.name}" i en Discord-kanal.`,
      `Användaren har rollen ${userRole}.`,
      "Du hjälper ENBART med detta specifika projekt. Du har INTE tillgång till personliga filer, personliga anteckningar, e-post eller andra projekt.",
      "Om användaren frågar om personliga saker eller andra projekt, hänvisa dem till att skicka ett DM (direktmeddelande) till botten istället.",
      unreadHint
    );
  } else if (isDiscordGuildChannel) {
    // Guild channel without a project: limited assistant
    parts.push(
      `Du är en arbetsassistent i en Discord-kanal.`,
      `Användaren har rollen ${userRole}.`,
      "Du hjälper med projektrelaterade frågor. Du har INTE tillgång till personliga filer, personliga anteckningar eller e-post.",
      "Om användaren frågar om personliga saker, hänvisa dem till att skicka ett DM (direktmeddelande) till botten istället.",
      unreadHint
    );
  } else {
    // DM or web: full assistant
    parts.push(
      `Du är en personlig arbetsassistent åt ${userName ?? "användaren"}.`,
      `Användaren har rollen ${userRole}.`,
      "Du hjälper med personliga saker och med projekt — användaren kan byta projekt när som helst. Du har tillgång till verktyg för alla användarens projekt (ange projectId när du arbetar i ett specifikt projekt).",
      unreadHint
    );
  }

  // Factual accuracy - never invent dates or numbers
  const factualPolicy = `
FAKTA OCH DATUM - KRITISKT:
- Hitta ALDRIG på datum, deadlines eller tidsangivelser. Om källan säger "inom 3–4 veckor", skriv det — ange INTE ett konkret datum som "15 mars".
- Ange endast datum och siffror som uttryckligen finns i källan (protokoll, dokument, uppgifter). Om något inte nämns, säg att det inte angavs — uppskatta inte.
- Skapa inte "rimliga" eller "uppskattade" deadlines för att "ha något att följa upp". Användaren ska kunna lita på att allt du anger kommer från källan.
`;

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
VISNING AV BILDER/FILER I CHATTEN: När användaren vill se, visa eller öppna en bild (eller fil), använd getFilePreviewUrl med fileId (och projectId om det är en projektfil). Inkludera sedan bilden i svaret med markdown: ![filnamn eller beskrivning](previewUrl). För icke-bilder kan du returnera previewUrl så användaren kan öppna filen. I Discord visas bilder direkt inline i chatten via markdown-syntax.`;

  // File creation - AI should always include download links for created files
  const fileCreationGuidance = `
FILSKAPNING I DISCORD: När du skapar en fil (PDF, Word, Excel) via ett verktyg och verktyget returnerar en downloadUrl, MÅSTE du alltid inkludera denna URL som en markdown-länk i ditt svar på formatet [filnamn](downloadUrl). Discord-botten plockar automatiskt upp länken och bifogar filen direkt i chatten — användaren ska ALDRIG behöva gå till hemsidan för att ladda ner en fil du skapat.`;

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

  // List formatting - chat renders markdown; pipe-separated lines look bad
  const listFormatRule = `
FORMAT FÖR LISTOR: När du listar dokument, alternativ eller val (t.ex. sökresultat), använd ALLTID markdown med ett alternativ per rad — antingen numrerad lista (1. 2. 3.) eller punktlista (- [1] ... - [2] ...). Skriv ALDRIG listan som en enda rad med "|" mellan alternativen; det blir oläsligt. Exempel rätt:
- [1] Dokument A
- [2] Dokument B
Exempel fel: [1] Dokument A | [2] Dokument B`;

  parts.push(
    "Svara på svenska, var konkret och kort.",
    "När du använder information från dokument, citera källan med [1], [2] enligt numreringen nedan.",
    listFormatRule,
    "Om du inte vet svaret efter att ha sökt ordentligt, säg det.",
    factualPolicy,
    proactivePolicy,
    searchStrategy,
    emailSearchGuidance,
    imageDisplayGuidance,
    fileCreationGuidance,
    webSearchGuidance,
    searchGuidance,
    imageAnalysisInstruction,
    knowledgeBlock,
    summaryBlock
  );

  const base = parts.join(" ");
  return ragContext ? base + ragContext : base;
}

// ─────────────────────────────────────────
// Mistral Tool-Call ID Normalization
// ─────────────────────────────────────────

/**
 * Mistral API requires tool call IDs to be exactly 9 characters, a-z, A-Z, 0-9.
 * Normalize IDs in model messages so multi-turn conversations with tool calls work.
 */
export function normalizeMistralToolCallIds(
  messages: Array<{ role: string; content: unknown }>
): void {
  const ALPHANUM =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const idMap = new Map<string, string>();
  let counter = 0;

  function toMistralId(id: string): string {
    let mapped = idMap.get(id);
    if (mapped == null) {
      let n = counter++;
      let s = "";
      for (let i = 0; i < 9; i++) {
        s += ALPHANUM[n % ALPHANUM.length];
        n = Math.floor(n / ALPHANUM.length);
      }
      mapped = s;
      idMap.set(id, mapped);
    }
    return mapped;
  }

  function processPart(part: Record<string, unknown>): void {
    if (typeof part.toolCallId === "string") {
      part.toolCallId = toMistralId(part.toolCallId);
    }
  }

  for (const msg of messages) {
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      for (const part of msg.content as Array<Record<string, unknown>>) {
        if (part && typeof part === "object") processPart(part);
      }
    } else if (msg.role === "tool" && Array.isArray(msg.content)) {
      for (const part of msg.content as Array<Record<string, unknown>>) {
        if (part && typeof part === "object") processPart(part);
      }
    }
  }
}

// ─────────────────────────────────────────
// Text Extraction
// ─────────────────────────────────────────

/** Extract text content from a UIMessage's parts array. */
export function extractTextFromParts(message: UIMessage): string {
  return (message.parts ?? [])
    .filter(
      (part): part is { type: "text"; text: string } => part.type === "text"
    )
    .map((part) => part.text)
    .join("");
}

// ─────────────────────────────────────────
// Message Persistence Helpers
// ─────────────────────────────────────────

/** Save the latest user message to DB and queue embedding processing. */
export async function saveUserMessage(opts: {
  udb: UserScopedClient;
  message: UIMessage;
  conversationId: string;
  tenantId: string;
  userId: string;
  projectId: string | null;
}): Promise<void> {
  const { udb, message, conversationId, tenantId, userId, projectId } = opts;
  const userMsg = await udb.message.create({
    data: {
      role: "USER",
      content: extractTextFromParts(message),
      conversationId,
      projectId,
    },
    select: { id: true },
  });
  queueMessageEmbeddingProcessing(
    udb as unknown as MessageEmbeddingsDb,
    userMsg.id,
    conversationId,
    tenantId,
    userId,
    projectId
  );
}

/** Save assistant response, queue embeddings, trigger summarization and knowledge extraction. */
export async function saveAssistantMessage(opts: {
  udb: UserScopedClient;
  db: TenantScopedClient;
  responseMessage: { id?: string; role: string; parts?: unknown[]; content?: unknown[] };
  conversationId: string;
  tenantId: string;
  userId: string;
  projectId: string | null;
}): Promise<void> {
  const { udb, db, responseMessage, conversationId, tenantId, userId, projectId } =
    opts;

  if (responseMessage.role !== "assistant") return;

  const parts = Array.isArray(responseMessage.parts)
    ? responseMessage.parts
    : Array.isArray(responseMessage.content)
      ? responseMessage.content
      : [];
  const serializable = {
    v: 1,
    id: responseMessage.id,
    role: responseMessage.role,
    parts: parts.map((p) => {
      const part = p as Record<string, unknown>;
      return {
        type: part.type,
        text: part.text,
        state: part.state,
        output: part.output,
        toolCallId: part.toolCallId,
        toolName: part.toolName,
      };
    }),
  };
  const content = JSON.stringify(serializable);
  const assistantMsg = await udb.message.create({
    data: {
      role: "ASSISTANT",
      content,
      conversationId,
      projectId,
    },
    select: { id: true },
  });
  queueMessageEmbeddingProcessing(
    udb as unknown as MessageEmbeddingsDb,
    assistantMsg.id,
    conversationId,
    tenantId,
    userId,
    projectId
  );

  const count = await udb.message.count({
    where: { conversationId },
  });
  if (count >= MESSAGE_SUMMARY_THRESHOLD) {
    summarizeConversationIfNeeded({
      db: udb,
      conversationId,
    }).catch((err) =>
      logger.warn("Conversation summarization failed", {
        conversationId,
        error: err instanceof Error ? err.message : String(err),
      })
    );
  }

  extractAndSaveKnowledge({
    db,
    udb,
    conversationId,
    tenantId,
    userId,
  }).catch((err) =>
    logger.warn("Knowledge extraction failed", {
      conversationId,
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

// ─────────────────────────────────────────
// File Extraction from Tool Results
// ─────────────────────────────────────────

/**
 * Extract files created by tools from stream steps.
 * Looks for tool results with `__fileCreated: true` and extracts file metadata.
 */
async function extractFilesFromSteps(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stepsPromise: PromiseLike<Array<any>>
): Promise<AIChatFile[]> {
  const files: AIChatFile[] = [];
  try {
    const steps = await stepsPromise;
    for (const step of steps) {
      for (const result of step.toolResults ?? []) {
        if (!result) continue;
        const output = result.output;
        if (
          output &&
          typeof output === "object" &&
          output.__fileCreated === true &&
          typeof output.downloadUrl === "string" &&
          typeof output.fileName === "string"
        ) {
          files.push({
            fileId: output.fileId ?? "",
            fileName: output.fileName,
            downloadUrl: output.downloadUrl,
          });
        }
      }
    }
  } catch (err) {
    logger.warn("Failed to extract files from stream steps", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return files;
}

// ─────────────────────────────────────────
// Main: executeAIChat
// ─────────────────────────────────────────

/**
 * Execute a full AI chat session. Resolves provider, builds tools & system prompt,
 * fetches RAG/knowledge context, and streams the response.
 *
 * This is the main entry point for both the HTTP route and non-HTTP consumers.
 * The caller is responsible for:
 * - Authentication and authorization
 * - Creating/validating the conversation
 * - Converting the result to an appropriate response format (HTTP SSE, Discord message, etc.)
 */
export async function executeAIChat(
  options: ExecuteAIChatOptions
): Promise<AIChatResult> {
  const {
    context,
    messages,
    provider,
    imageFileIds,
    inlineImageDataUrls,
    conversationSummary,
    onStreamError,
    onStreamFinish,
    abortSignal,
  } = options;

  const { tenantId, userId, projectId } = context;
  const db = tenantDb(tenantId);

  // Resolve provider
  const resolvedProvider = resolveProvider(provider);
  if (!resolvedProvider) {
    throw new Error(
      "AI provider not configured. Check server environment variables."
    );
  }
  const providerKey = resolvedProvider;

  logger.info("AI chat ENV check", {
    requestedProvider: provider,
    resolvedProvider,
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    hasOpenaiKey: !!process.env.OPENAI_API_KEY,
    hasGoogleKey: !!process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  });

  // Fetch RAG context for project chats
  let ragSources: RagSource[] = [];
  let ragContext = "";
  const lastUserMsg = messages.filter((m) => m.role === "user").pop();
  const lastUserText = lastUserMsg ? extractTextFromParts(lastUserMsg) : "";

  if (projectId && lastUserText.trim()) {
    const rag = await fetchRagContext(tenantId, projectId, lastUserText);
    ragSources = rag.ragSources;
    ragContext = rag.ragContext;
  }

  // Fetch knowledge/unified search context
  const { knowledgeContext, searchResults } = await fetchKnowledgeContext(
    messages,
    userId,
    tenantId,
    projectId,
    db
  );

  // Fetch image data URLs (from DB files + inline from Discord)
  const fetchedImageUrls = await fetchImageDataUrls(imageFileIds ?? []);
  const imageDataUrls = [...fetchedImageUrls, ...(inlineImageDataUrls ?? [])];

  // Fetch project context for system prompt
  let projectContext: ProjectContext | undefined;
  if (projectId) {
    projectContext = await fetchProjectContext(db, projectId);
  }

  // Build system prompt
  const isFirstTurn = messages.filter((m) => m.role === "user").length <= 1;
  const hasAttachedImages = imageDataUrls.length > 0;
  const systemPrompt = buildSystemPrompt({
    userName: context.userName,
    userRole: context.userRole,
    projectId: projectId ?? undefined,
    projectContext,
    ragContext,
    knowledgeContext,
    checkUnreadOnStart: isFirstTurn,
    conversationSummary,
    hasAttachedImages,
    isDiscordGuildChannel: context.isDiscordDM === false,
  });

  // Build tools
  const tools = buildToolSchemas(context, providerKey);

  // Select model
  const model = getModel(providerKey);

  // Convert messages (caller should have already converted, but we accept UIMessage[])
  const { convertToModelMessages } = await import("ai");
  let modelMessages;
  try {
    modelMessages = await convertToModelMessages(messages);
  } catch (convertErr) {
    logger.error("AI chat: invalid message format", {
      error:
        convertErr instanceof Error ? convertErr.message : String(convertErr),
    });
    throw new Error("Invalid message format");
  }

  // Inject image parts into the last user model message
  if (imageDataUrls.length > 0) {
    for (let i = modelMessages.length - 1; i >= 0; i--) {
      const msg = modelMessages[i];
      if (msg.role === "user") {
        const imageParts = imageDataUrls.map((dataUrl) => ({
          type: "image" as const,
          image: dataUrl,
        }));
        const existingContent = Array.isArray(msg.content)
          ? msg.content
          : [
              {
                type: "text" as const,
                text:
                  typeof msg.content === "string" ? msg.content : "",
              },
            ];
        modelMessages[i] = {
          ...msg,
          content: [...existingContent, ...imageParts],
        };
        break;
      }
    }
  }

  // Normalize Mistral tool call IDs
  const isMistral =
    providerKey === "MISTRAL_LARGE" || providerKey === "MISTRAL_SMALL";
  if (isMistral) {
    normalizeMistralToolCallIds(modelMessages);
  }

  // Stream options
  const streamOptions = {
    ...streamConfig,
    ...(isMistral ? { maxRetries: 5 } : {}),
  };

  // Step counter for logging
  let stepCounter = 0;

  // Stream the response
  const stream = streamText({
    model,
    system: systemPrompt,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(8),
    ...(abortSignal && { abortSignal }),
    ...streamOptions,
    onError: ({ error }) => {
      logger.error("AI stream error", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
        hasOpenaiKey: !!process.env.OPENAI_API_KEY,
      });
      onStreamError?.(error);
    },
    onStepFinish: ({ toolCalls, finishReason }) => {
      stepCounter++;
      logger.info("[AI step]", {
        userId: context.userId,
        conversationId: context.conversationId,
        step: stepCounter,
        finishReason,
        toolCallCount: toolCalls?.length ?? 0,
        toolCalls: toolCalls
          ?.map((tc) => {
            if (!tc) return null;
            return {
              toolName: tc.toolName,
              // Truncate input to avoid huge logs
              input: JSON.stringify(tc.input).slice(0, 200),
            };
          })
          .filter((tc) => tc !== null),
      });
    },
    onFinish: async ({ text }) => {
      logger.info("onFinish: triggered", {
        conversationId: context.conversationId,
        textLength: text?.length ?? 0,
      });
      onStreamFinish?.(text);
    },
  });

  logger.info("AI chat request", {
    userId,
    tenantId,
    provider: providerKey,
    conversationId: context.conversationId,
    projectId: projectId ?? null,
    messageCount: messages.length,
    ragChunks: ragSources.length,
  });

  // Extract files from tool results (resolves after stream is consumed)
  const filesPromise = extractFilesFromSteps(stream.steps);

  return {
    stream,
    providerKey,
    ragSources,
    searchResults,
    systemPrompt,
    files: filesPromise,
  };
}
