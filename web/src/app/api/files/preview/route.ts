import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, requireProject } from "@/lib/auth";
import { tenantDb } from "@/lib/db";
import { fetchFileFromMinIO } from "@/lib/ai/ocr";
import ExcelJS from "exceljs";
import mammoth from "mammoth";
import { Readable } from "stream";

const previewSchema = z.object({
  fileId: z.string().min(1),
  projectId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { tenantId, userId } = await requireAuth();
    const body = await req.json();
    const parsed = previewSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const { fileId, projectId } = parsed.data;

    if (projectId) {
      await requireProject(tenantId, projectId, userId);
    }

    const db = tenantDb(tenantId, { actorUserId: userId, projectId });

    const whereClause: Record<string, unknown> = { id: fileId };
    if (projectId) {
      whereClause.projectId = projectId;
    } else {
      // Personal file
      whereClause.projectId = null;
      whereClause.uploadedById = userId;
    }

    const file = await db.file.findFirst({
      where: whereClause,
      select: {
        id: true,
        name: true,
        type: true,
        bucket: true,
        key: true,
      },
    });

    if (!file) {
      return NextResponse.json({ error: "FILE_NOT_FOUND" }, { status: 404 });
    }

    const isExcel =
      file.type ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.type === "application/vnd.ms-excel" ||
      /\.xlsx?$/i.test(file.name);

    const isWord =
      file.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.type === "application/msword" ||
      /\.docx?$/i.test(file.name);

    if (!isExcel && !isWord) {
      return NextResponse.json(
        { error: "UNSUPPORTED_FILE_TYPE" },
        { status: 400 }
      );
    }

    // Fetch file from MinIO
    const buffer = await fetchFileFromMinIO(file.bucket, file.key);

    if (isExcel) {
      // Process Excel file
      const stream = Readable.from(buffer);
      const workbook = await new ExcelJS.Workbook().xlsx.read(stream);

      const sheets: {
        sheetName: string;
        headers: string[];
        rows: (string | number | null)[][];
      }[] = [];

      workbook.eachSheet((sheet) => {
        const headers: string[] = [];
        const rows: (string | number | null)[][] = [];

        sheet.eachRow((row, rowIndex) => {
          const values = row.values as (string | number | null)[];
          // Skip first element (Excel rows are 1-indexed, values[0] is empty)
          const rowData = values.slice(1);

          if (rowIndex === 1) {
            // First row as headers
            headers.push(...rowData.map((v) => (v !== null && v !== undefined ? String(v) : "")));
          } else {
            rows.push(rowData);
          }
        });

        // If no headers were found, create default ones
        if (headers.length === 0 && rows.length > 0) {
          const colCount = Math.max(...rows.map((r) => r.length));
          for (let i = 0; i < colCount; i++) {
            headers.push(`Column ${i + 1}`);
          }
        }

        sheets.push({
          sheetName: sheet.name,
          headers,
          rows,
        });
      });

      return NextResponse.json({
        type: "excel",
        sheets,
      });
    }

    if (isWord) {
      // Process Word file
      const result = await mammoth.convertToHtml({ buffer });

      return NextResponse.json({
        type: "word",
        html: result.value,
      });
    }

    return NextResponse.json(
      { error: "UNSUPPORTED_FILE_TYPE" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Preview generation failed:", error);
    return NextResponse.json(
      { error: "PREVIEW_GENERATION_FAILED" },
      { status: 500 }
    );
  }
}
