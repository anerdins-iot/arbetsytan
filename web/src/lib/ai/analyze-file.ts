/**
 * Asynkron filanalys efter uppladdning via AI-chatten.
 * Kör OCR + bildanalys + embeddings i bakgrunden.
 * Sparar resultat i File.ocrText och skapar DocumentChunks (om projektkontext finns).
 * Skickar systemmeddelande till konversationen när klart (userDb/tenantDb med emitContext för auto-emit).
 */
import { tenantDb, userDb } from "@/lib/db";
import { processFileOcr, processPersonalFileOcr } from "@/lib/ai/ocr";
import { logger } from "@/lib/logger";

type AnalyzeFileParams = {
  fileId: string;
  fileName: string;
  fileType: string;
  bucket: string;
  key: string;
  tenantId: string;
  projectId?: string;
  conversationId?: string;
  userId: string;
};

// Filtyper som stöder OCR
const OCR_ELIGIBLE_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function isOcrEligible(fileType: string, fileName: string): boolean {
  if (OCR_ELIGIBLE_TYPES.has(fileType)) return true;
  return /\.(pdf|jpe?g|png|webp)$/i.test(fileName);
}

/**
 * Kör asynkron filanalys (fire-and-forget).
 * Blockerar INTE chatten — analysresultat skickas som systemmeddelande.
 */
export function analyzeFileAsync(params: AnalyzeFileParams): void {
  runAnalysis(params).catch((err) => {
    logger.error("Async file analysis failed", {
      fileId: params.fileId,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

async function runAnalysis(params: AnalyzeFileParams): Promise<void> {
  const {
    fileId,
    fileName,
    fileType,
    bucket,
    key,
    tenantId,
    projectId,
    conversationId,
    userId,
  } = params;

  logger.info("Starting async file analysis", { fileId, fileName, fileType });

  let analysisResult = "";
  let chunkCount = 0;

  if (isOcrEligible(fileType, fileName)) {
    if (projectId) {
      // Med projektkontext: full pipeline (OCR + chunkning + embeddings)
      const ocrResult = await processFileOcr({
        fileId,
        projectId,
        tenantId,
        bucket,
        key,
        fileType,
        fileName,
      });

      if (ocrResult.success) {
        chunkCount = ocrResult.chunkCount;
        const db = tenantDb(tenantId);
        const file = await db.file.findFirst({
          where: { id: fileId },
          select: { ocrText: true },
        });
        if (file?.ocrText) {
          const preview = file.ocrText.slice(0, 500);
          analysisResult = `OCR-analys klar. ${chunkCount} textblock extraherade.\n\nFörhandsvisning:\n${preview}${file.ocrText.length > 500 ? "…" : ""}`;
        } else {
          analysisResult = "OCR-analys klar, men ingen text kunde extraheras.";
        }
      } else {
        analysisResult = `OCR-analys misslyckades: ${ocrResult.error}`;
      }
    } else {
      // Personlig fil utan projekt: kör OCR + chunkning + embeddings med userId
      if (!process.env.MISTRAL_API_KEY) {
        analysisResult = `Filen "${fileName}" har laddats upp. OCR ej konfigurerat.`;
      } else {
        try {
          const ocrResult = await processPersonalFileOcr({
            fileId,
            tenantId,
            userId,
            bucket,
            key,
            fileType,
            fileName,
          });

          if (ocrResult.success) {
            chunkCount = ocrResult.chunkCount;
            const db = tenantDb(tenantId);
            const file = await db.file.findFirst({
              where: { id: fileId },
              select: { ocrText: true },
            });
            if (file?.ocrText) {
              const preview = file.ocrText.slice(0, 500);
              analysisResult = `OCR-analys klar. ${chunkCount} textblock extraherade.\n\nFörhandsvisning:\n${preview}${file.ocrText.length > 500 ? "…" : ""}`;
            } else {
              analysisResult = "OCR-analys klar, men ingen text kunde extraheras.";
            }
          } else {
            analysisResult = `OCR-analys misslyckades: ${ocrResult.error}`;
          }
        } catch (err) {
          logger.warn("Personal file OCR failed", {
            fileId,
            error: err instanceof Error ? err.message : String(err),
          });
          analysisResult = "OCR-analys misslyckades.";
        }
      }
    }
  } else {
    // Ej OCR-berättigad filtyp (t.ex. DOCX, XLSX)
    analysisResult = `Filen "${fileName}" har laddats upp. Filtypen ${fileType} stöder inte automatisk textextrahering.`;
  }

  // Skicka analysresultat som meddelande i konversationen (med auto-emit)
  if (conversationId && analysisResult) {
    try {
      const readDb = tenantDb(tenantId);
      const conv = await readDb.conversation.findFirst({
        where: { id: conversationId, userId },
        select: { id: true, projectId: true },
      });
      if (conv) {
        const messageDb =
          conv.projectId == null
            ? userDb(userId, {})
            : tenantDb(tenantId, { actorUserId: userId, projectId: conv.projectId });
        await messageDb.message.create({
          data: {
            role: "ASSISTANT",
            content: `Filanalys klar for "${fileName}":\n\n${analysisResult}`,
            conversationId,
          },
        });
      }
    } catch (err) {
      logger.warn("Failed to save analysis result to conversation", {
        conversationId,
        fileId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info("Async file analysis completed", {
    fileId,
    fileName,
    chunkCount,
    hasConversation: !!conversationId,
  });
}
