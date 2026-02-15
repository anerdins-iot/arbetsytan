/**
 * POST /api/ai/analyze-file — AI-analys av fil (etikett + beskrivning).
 *
 * För bilder: Använder Claude Opus 4.6 vision för att analysera bildinnehållet.
 * För övriga filer: Tar OCR-text och användarens beskrivning, genererar label + description.
 * Sparar resultat på File-modellen.
 */
import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { getSession, requireProject } from "@/lib/auth";
import { prisma, tenantDb, userDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { fetchFileFromMinIO } from "@/lib/ai/ocr";
import { analyzeImageWithVision } from "@/lib/ai/file-processors";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  fileId: z.string().min(1, "fileId is required"),
  ocrText: z.string(),
  userDescription: z.string(),
});

const SYSTEM_PROMPT =
  "Du är en assistent som skapar korta, beskrivande etiketter för filer. " +
  "Baserat på all tillgänglig information (OCR-text, bildanalys, användarens beskrivning), skapa: " +
  "1. En kort etikett (max 50 tecken) som sammanfattar filens innehåll. " +
  "2. En längre beskrivning (1-3 meningar) som förklarar vad filen innehåller. " +
  'Svara ALLTID i JSON-format: {"label": "...", "description": "..."}';

const IMAGE_TYPES = /^image\/(jpeg|png|gif|webp)/i;

/**
 * Checks if error message indicates API overload/rate limit.
 */
function isOverloadError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /overload|rate.?limit|too.?many.?requests|529|503/i.test(msg);
}

/**
 * Run vision analysis on an image using Claude Opus 4.6.
 */
async function runImageVisionAnalysis(
  bucket: string,
  key: string,
  fileType: string,
  ocrText: string,
  userDescription: string
): Promise<string> {
  const buffer = await fetchFileFromMinIO(bucket, key);
  const visionResult = await analyzeImageWithVision(
    buffer,
    fileType,
    ocrText || undefined,
    userDescription || undefined
  );
  return visionResult;
}

/**
 * Generate label and description using Haiku (for text-based analysis).
 */
async function runTextAnalysis(
  context: string,
  fileName: string
): Promise<{ label: string; description: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      label: fileName.slice(0, 50) || "Fil",
      description: context.slice(0, 300) || "Ingen beskrivning tillgänglig.",
    };
  }

  const result = await generateText({
    model: anthropic("claude-haiku-4-5-20251001"),
    system: SYSTEM_PROMPT,
    prompt: context,
    maxOutputTokens: 500,
  });

  const text = result.text.trim();
  const jsonMatch = text.match(new RegExp("\\{[\\s\\S]*\\}"));
  const jsonStr = jsonMatch ? jsonMatch[0] : text;
  const parsed = JSON.parse(jsonStr) as { label?: string; description?: string };

  return {
    label:
      typeof parsed.label === "string"
        ? parsed.label.slice(0, 50)
        : fileName.slice(0, 50) || "Fil",
    description:
      typeof parsed.description === "string"
        ? parsed.description
        : text.slice(0, 500),
  };
}

async function runAiAnalysis(
  ocrText: string,
  userDescription: string,
  fileName: string,
  fileType: string,
  bucket?: string,
  key?: string
): Promise<{ label: string; description: string; error?: string }> {
  const isImage = IMAGE_TYPES.test(fileType);

  try {
    // For images: use Claude Opus 4.6 vision
    if (isImage && bucket && key && process.env.ANTHROPIC_API_KEY) {
      logger.info("Running image vision analysis with Opus 4.6", { fileName, fileType });

      const visionAnalysis = await runImageVisionAnalysis(
        bucket,
        key,
        fileType,
        ocrText,
        userDescription
      );

      // Build context for label generation
      const contextParts: string[] = [];
      if (visionAnalysis) {
        contextParts.push(`Bildanalys (AI Vision):\n${visionAnalysis}`);
      }
      if (ocrText.trim()) {
        contextParts.push(`OCR-text:\n${ocrText.trim()}`);
      }
      if (userDescription.trim()) {
        contextParts.push(`Användarens beskrivning:\n${userDescription.trim()}`);
      }

      const fullContext = contextParts.join("\n\n") || `Filnamn: ${fileName}`;
      return await runTextAnalysis(fullContext, fileName);
    }

    // For non-images or when no bucket/key: text-only analysis
    const contextParts: string[] = [];
    if (ocrText.trim()) {
      contextParts.push(`OCR-text:\n${ocrText.trim()}`);
    }
    if (userDescription.trim()) {
      contextParts.push(`Användarens beskrivning:\n${userDescription.trim()}`);
    }

    const fullContext = contextParts.join("\n\n") || `Filnamn: ${fileName}`;
    return await runTextAnalysis(fullContext, fileName);

  } catch (err) {
    logger.error("AI analyze-file failed", {
      error: err instanceof Error ? err.message : String(err),
      fileType,
      isImage,
    });

    // Return specific error message for UI
    let errorMessage: string;
    if (isOverloadError(err)) {
      errorMessage = "AI-tjänsten är överbelastad. Försök igen om en stund.";
    } else if (!process.env.ANTHROPIC_API_KEY) {
      errorMessage = "AI-analys är inte konfigurerad.";
    } else {
      errorMessage = "Analys misslyckades. Försök igen senare.";
    }

    // Return fallback values with error message
    return {
      label: fileName.slice(0, 50) || "Fil",
      description:
        userDescription.trim() ||
        ocrText.trim().slice(0, 300) ||
        "Ingen beskrivning tillgänglig.",
      error: errorMessage,
    };
  }
}

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
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      const msg =
        parsed.error.flatten().formErrors?.[0] ?? "Validation failed";
      return NextResponse.json(
        { error: msg, details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { fileId, ocrText, userDescription } = parsed.data;

    const file = await prisma.file.findUnique({
      where: { id: fileId },
      include: { project: true },
    });

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

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

    // Run AI analysis with vision for images
    const { label, description, error: analysisError } = await runAiAnalysis(
      ocrText,
      userDescription,
      file.name,
      file.type,
      file.bucket,
      file.key
    );

    // Update database using scoped client with emitContext
    if (file.projectId) {
      const db = tenantDb(tenantId, { actorUserId: userId, projectId: file.projectId });
      await db.file.update({
        where: { id: fileId },
        data: {
          label,
          userDescription: userDescription || null,
          aiAnalysis: description,
        },
      });
    } else {
      const db = userDb(userId, {});
      await db.file.update({
        where: { id: fileId },
        data: {
          label,
          userDescription: userDescription || null,
          aiAnalysis: description,
        },
      });
    }

    // Return result with optional warning if analysis had an error but still produced fallback
    if (analysisError) {
      return NextResponse.json({
        label,
        description,
        warning: analysisError,
      });
    }

    return NextResponse.json({ label, description });
  } catch (err) {
    logger.error("analyze-file route error", {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });

    // Return user-friendly error message
    let errorMessage = "Analys misslyckades. Försök igen senare.";
    if (isOverloadError(err)) {
      errorMessage = "AI-tjänsten är överbelastad. Försök igen om en stund.";
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
