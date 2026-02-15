import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, requireProject } from "@/lib/auth";
import { tenantDb } from "@/lib/db";
import { buildSimpleDocx } from "@/lib/reports/simple-content-docx";
import { saveGeneratedDocumentToProject } from "@/lib/ai/save-generated-document";

const saveWordSchema = z.object({
  sourceFileId: z.string().min(1),
  newFileName: z.string().min(1),
  content: z.string().min(1),
  projectId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { tenantId, userId } = await requireAuth();
    const body = await req.json();
    const parsed = saveWordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const { sourceFileId, newFileName, content, projectId } = parsed.data;

    // Ensure .docx extension
    const fileName = newFileName.toLowerCase().endsWith(".docx")
      ? newFileName
      : `${newFileName}.docx`;

    // Find source file to get projectId if not provided
    const db = tenantDb(tenantId, { actorUserId: userId, projectId });

    const sourceFile = await db.file.findFirst({
      where: { id: sourceFileId },
      select: { id: true, projectId: true, name: true },
    });

    if (!sourceFile) {
      return NextResponse.json(
        { error: "FILE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const fileProjectId = projectId || sourceFile.projectId;

    if (!fileProjectId) {
      return NextResponse.json(
        { error: "PROJECT_NOT_FOUND" },
        { status: 400 }
      );
    }

    // Verify project access
    await requireProject(tenantId, fileProjectId, userId);

    // Build Word document from the edited content
    const title = fileName.replace(/\.docx$/i, "");
    const buffer = await buildSimpleDocx(title, content);

    // Save as new file
    const projectDb = tenantDb(tenantId, {
      actorUserId: userId,
      projectId: fileProjectId,
      tenantId,
    });

    const saved = await saveGeneratedDocumentToProject({
      db: projectDb,
      tenantId,
      projectId: fileProjectId,
      userId,
      fileName,
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer,
      content,
    });

    if ("error" in saved) {
      return NextResponse.json({ error: saved.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      fileId: saved.fileId,
      fileName: saved.name,
    });
  } catch (error) {
    console.error("Save Word file failed:", error);
    return NextResponse.json(
      { error: "SAVE_WORD_FAILED" },
      { status: 500 }
    );
  }
}
