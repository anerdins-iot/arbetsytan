/**
 * Kör filanalys i bakgrunden (fire-and-forget).
 *
 * 1. Generera label + description med AI
 * 2. Spara till File-modellen
 * 3. Skapa DocumentChunk för description med embedding
 * 4. Emit websocket-event
 */
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { tenantDb, userDb, prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { generateEmbedding } from "@/lib/ai/embeddings";
import { fetchFileFromMinIO } from "@/lib/ai/ocr";
import { analyzeImageWithVisionHaiku } from "@/lib/ai/file-processors";

type QueueFileAnalysisParams = {
  fileId: string;
  fileName: string;
  fileType: string;
  bucket: string;
  key: string;
  tenantId: string;
  projectId?: string;
  userId: string;
  ocrText: string;
  userDescription: string;
};

const IMAGE_TYPES = /^image\/(jpeg|png|gif|webp)/i;

const SYSTEM_PROMPT = `Du är en assistent som skapar korta, beskrivande etiketter för filer.
Baserat på all tillgänglig information (OCR-text, bildanalys, användarens beskrivning), skapa:
1. En kort etikett (max 50 tecken) som sammanfattar filens innehåll.
2. En längre beskrivning (1-3 meningar) som förklarar vad filen innehåller.
Svara ALLTID i JSON-format: {"label": "...", "description": "..."}`;

/**
 * Kör filanalys i bakgrunden.
 * Blockerar INTE anroparen - allt körs asynkront.
 */
export function queueFileAnalysis(params: QueueFileAnalysisParams): void {
  runAnalysis(params).catch((err) => {
    logger.error("Background file analysis failed", {
      fileId: params.fileId,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
  });
}

async function runAnalysis(params: QueueFileAnalysisParams): Promise<void> {
  const {
    fileId,
    fileName,
    fileType,
    bucket,
    key,
    tenantId,
    projectId,
    userId,
    ocrText,
    userDescription,
  } = params;

  logger.info("Starting background file analysis", { fileId, fileName, fileType });

  let label = fileName.slice(0, 50);
  let description = userDescription || ocrText.slice(0, 300) || "Ingen beskrivning tillgänglig.";
  let visionAnalysis = "";

  // Kör vision-analys för bilder
  const isImage = IMAGE_TYPES.test(fileType);
  if (isImage && process.env.ANTHROPIC_API_KEY) {
    try {
      const buffer = await fetchFileFromMinIO(bucket, key);
      visionAnalysis = await analyzeImageWithVisionHaiku(
        buffer,
        fileType,
        ocrText || undefined,
        userDescription || undefined
      );
      logger.info("Vision analysis completed", { fileId, analysisLength: visionAnalysis.length });
    } catch (err) {
      logger.warn("Vision analysis failed", {
        fileId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Generera label + description med AI
  const hasContent = ocrText.trim() || userDescription.trim() || visionAnalysis;
  if (process.env.ANTHROPIC_API_KEY && hasContent) {
    try {
      const contextParts: string[] = [];
      if (visionAnalysis) {
        contextParts.push(`Bildanalys:\n${visionAnalysis}`);
      }
      if (ocrText.trim()) {
        contextParts.push(`OCR-text:\n${ocrText.trim()}`);
      }
      if (userDescription.trim()) {
        contextParts.push(`Användarens beskrivning:\n${userDescription.trim()}`);
      }
      const context = contextParts.join("\n\n") || `Filnamn: ${fileName}`;

      const result = await generateText({
        model: anthropic("claude-haiku-4-5-20251001"),
        system: SYSTEM_PROMPT,
        prompt: context,
        maxOutputTokens: 500,
      });

      const text = result.text.trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : text;
      const parsed = JSON.parse(jsonStr) as { label?: string; description?: string };

      if (typeof parsed.label === "string") {
        label = parsed.label.slice(0, 50);
      }
      if (typeof parsed.description === "string") {
        description = parsed.description;
      }

      logger.info("AI analysis completed", { fileId, label });
    } catch (err) {
      logger.warn("AI text analysis failed, using fallback", {
        fileId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Spara till DB - använd rätt klient beroende på om det är projektfil eller personlig fil
  if (projectId) {
    const db = tenantDb(tenantId, { actorUserId: userId, projectId });
    await db.file.update({
      where: { id: fileId, projectId },
      data: { label, aiAnalysis: description },
    });
  } else {
    const udb = userDb(userId, {});
    await udb.file.update({
      where: { id: fileId },
      data: { label, aiAnalysis: description },
    });
  }

  // Skapa FileAnalysis-post
  await prisma.fileAnalysis.create({
    data: {
      content: description,
      prompt: null, // Generell auto-analys
      model: "claude-haiku-4-5-20251001",
      type: "auto",
      fileId,
      tenantId,
      projectId: projectId || null,
      userId,
    },
  });

  logger.info("File label and description saved", { fileId, label });

  // Skapa embedding för description (så det blir sökbart)
  if (description && process.env.OPENAI_API_KEY) {
    try {
      // Kombinera label + description för bättre sökbarhet
      const embeddingText = `${label}\n\n${description}`;
      const embedding = await generateEmbedding(embeddingText);

      // Skapa eller uppdatera DocumentChunk för filens AI-analys
      // Vi använder metadata.type = "ai-analysis" för att markera denna chunk
      const chunkId = `${fileId}-analysis`;
      const existingChunk = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT "id" FROM "DocumentChunk" WHERE "id" = $1 LIMIT 1`,
        chunkId
      );

      const vectorStr = `[${embedding.join(",")}]`;
      const metadata = JSON.stringify({ type: "ai-analysis", label });

      if (existingChunk.length > 0) {
        // Uppdatera befintlig chunk
        await prisma.$queryRawUnsafe(
          `UPDATE "DocumentChunk" SET "content" = $1, "embedding" = $2::vector, "metadata" = $3::jsonb WHERE "id" = $4`,
          embeddingText,
          vectorStr,
          metadata,
          chunkId
        );
      } else {
        // Skapa ny chunk med metadata.type = "ai-analysis"
        await prisma.$queryRawUnsafe(
          `INSERT INTO "DocumentChunk" ("id", "fileId", "tenantId", "projectId", "userId", "page", "content", "embedding", "metadata", "createdAt")
           VALUES ($1, $2, $3, $4, $5, NULL, $6, $7::vector, $8::jsonb, NOW())`,
          chunkId,
          fileId,
          tenantId,
          projectId ?? null,
          projectId ? null : userId,
          embeddingText,
          vectorStr,
          metadata
        );
      }

      logger.info("File analysis embedding created", { fileId });
    } catch (err) {
      logger.error("Failed to create embedding for file analysis", {
        fileId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info("Background file analysis completed", { fileId, label });
}
