/**
 * POST /api/ai/finalize-file — Slutför filuppladdning med OCR-text.
 *
 * Tar emot redigerad OCR-text och kör:
 * 1. Uppdaterar File.ocrText i DB
 * 2. Kör AI-analys i bakgrunden (label + description)
 * 3. Skapar embeddings för description-texten
 *
 * Returnerar omedelbart - all bearbetning sker asynkront.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession, requireProject } from "@/lib/auth";
import { userDb, prisma, tenantDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { queueFileAnalysis } from "@/lib/ai/queue-file-analysis";
import { chunkText } from "@/lib/ai/ocr";
import { queueEmbeddingProcessing } from "@/lib/ai/embeddings";

const bodySchema = z.object({
  fileId: z.string().min(1, "fileId is required"),
  ocrText: z.string(),
  userDescription: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { tenantId, user } = session;
    const userId = user.id;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { fileId, ocrText, userDescription } = parsed.data;

    // Försök hitta som personlig fil (userDb scopar till userId + projectId: null)
    const udb = userDb(userId, {});
    let file = await udb.file.findFirst({
      where: { id: fileId },
    });
    let isPersonalFile = !!file;

    // Om inte personlig fil, försök som projektfil
    if (!file) {
      const projectFile = await prisma.file.findFirst({
        where: { id: fileId, project: { tenantId } },
        include: { project: true },
      });
      if (projectFile?.projectId) {
        // Verifiera projektåtkomst
        try {
          await requireProject(tenantId, projectFile.projectId, userId);
          file = projectFile;
        } catch {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }
    }

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Uppdatera OCR-text och user description
    if (isPersonalFile) {
      // userDb.file.update scopar automatiskt till userId + projectId: null
      await udb.file.update({
        where: { id: fileId },
        data: {
          ocrText: ocrText || null,
          userDescription: userDescription || null,
        },
      });
    } else {
      // Projektfil: åtkomst verifierad via requireProject, använd prisma direkt
      await prisma.file.update({
        where: { id: fileId },
        data: {
          ocrText: ocrText || null,
          userDescription: userDescription || null,
        },
      });
    }

    logger.info("File OCR text and description updated", {
      fileId,
      ocrTextLength: ocrText.length,
      userDescriptionLength: userDescription?.length ?? 0,
      projectId: file.projectId,
    });

    // Create DocumentChunks from OCR text and userDescription for semantic search
    const db = tenantDb(tenantId);

    // Delete existing chunks for this file (avoid duplicates on re-finalize)
    await db.documentChunk.deleteMany({
      where: { fileId },
    });

    let totalChunksCreated = 0;

    // Chunk and store OCR text
    if (ocrText.trim()) {
      const pages = [{ index: 0, markdown: ocrText }];
      const textChunks = chunkText(pages);

      for (const chunk of textChunks) {
        await db.documentChunk.create({
          data: {
            content: chunk.content,
            page: chunk.page,
            metadata: { position: chunk.position, source: "finalize-ocr" },
            fileId,
            tenantId,
            projectId: file.projectId ?? null,
            userId: isPersonalFile ? userId : null,
          },
        });
      }
      totalChunksCreated += textChunks.length;

      logger.info("finalize-file: OCR text chunks created", {
        fileId,
        chunkCount: textChunks.length,
      });
    }

    // Create separate chunk for userDescription
    if (userDescription?.trim()) {
      await db.documentChunk.create({
        data: {
          content: userDescription.trim(),
          page: null,
          metadata: { type: "user-description" },
          fileId,
          tenantId,
          projectId: file.projectId ?? null,
          userId: isPersonalFile ? userId : null,
        },
      });
      totalChunksCreated += 1;

      logger.info("finalize-file: user description chunk created", {
        fileId,
      });
    }

    // Queue embedding processing for all chunks
    if (totalChunksCreated > 0 && process.env.OPENAI_API_KEY) {
      queueEmbeddingProcessing(fileId, tenantId);
    } else if (totalChunksCreated > 0) {
      logger.warn("OPENAI_API_KEY not set — skipping embedding queue", { fileId });
    }

    // Kö bakgrundsanalys (AI label + description + embeddings)
    queueFileAnalysis({
      fileId,
      fileName: file.name,
      fileType: file.type,
      bucket: file.bucket,
      key: file.key,
      tenantId,
      projectId: file.projectId ?? undefined,
      userId,
      ocrText,
      userDescription: userDescription ?? "",
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("finalize-file route error", {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
