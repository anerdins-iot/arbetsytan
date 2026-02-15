import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, requireProject } from "@/lib/auth";
import { tenantDb } from "@/lib/db";
import { analyzeDocxTemplate } from "@/lib/ai/tools/shared-tools";

const schema = z.object({
  fileId: z.string().min(1),
  projectId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { tenantId, userId } = await requireAuth();
    const body = await req.json();
    const parsed = schema.safeParse(body);

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

    const result = await analyzeDocxTemplate({ db, tenantId, fileId });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Template analysis failed:", error);
    return NextResponse.json(
      { error: "TEMPLATE_ANALYSIS_FAILED" },
      { status: 500 }
    );
  }
}
