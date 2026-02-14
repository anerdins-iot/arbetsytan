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
import { tenantDb, prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { queueFileAnalysis } from "@/lib/ai/queue-file-analysis";

const bodySchema = z.object({
  fileId: z.string().min(1, "fileId is required"),
  ocrText: z.string(),
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

    const { fileId, ocrText } = parsed.data;

    // Hämta fil och verifiera åtkomst
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      include: { project: true },
    });

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Verifiera åtkomst
    if (file.projectId) {
      if (file.project?.tenantId !== tenantId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      try {
        await requireProject(tenantId, file.projectId, userId);
      } catch {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else {
      if (file.uploadedById !== userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Uppdatera OCR-text i DB
    const db = tenantDb(tenantId);
    await db.file.update({
      where: { id: fileId },
      data: { ocrText: ocrText || null },
    });

    logger.info("File OCR text updated", {
      fileId,
      ocrTextLength: ocrText.length,
      projectId: file.projectId,
    });

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
