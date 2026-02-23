/**
 * GET /api/ai/upload/file-info?fileId=xxx — Get file info for the OcrReviewDialog.
 * Returns file name, type, presigned URL, and OCR text.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createPresignedDownloadUrl } from "@/lib/minio";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { user } = session;
    const fileId = req.nextUrl.searchParams.get("fileId");

    if (!fileId) {
      return NextResponse.json({ error: "fileId is required" }, { status: 400 });
    }

    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: {
        id: true,
        name: true,
        type: true,
        size: true,
        bucket: true,
        key: true,
        ocrText: true,
        uploadedById: true,
        projectId: true,
      },
    });

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Only allow file owner to get info
    if (file.uploadedById !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = await createPresignedDownloadUrl({
      bucket: file.bucket,
      key: file.key,
      expiresInSeconds: 60 * 60,
    });

    return NextResponse.json({
      id: file.id,
      name: file.name,
      type: file.type,
      size: file.size,
      url,
      ocrText: file.ocrText,
    });
  } catch (err) {
    logger.error("file-info route error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
