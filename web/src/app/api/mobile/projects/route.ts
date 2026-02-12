/**
 * GET /api/mobile/projects — Returns projects the authenticated user has access to.
 * Verifies JWT via verifyBearerToken, uses tenantDb for tenant isolation.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyBearerToken } from "@/lib/auth-mobile";
import { tenantDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  const payload = verifyBearerToken(req.headers.get("authorization"));
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { tenantId } = payload;
  const db = tenantDb(tenantId);

  const projects = await db.project.findMany({
    include: {
      _count: { select: { tasks: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const result = projects.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    description: p.description,
    taskCount: p._count.tasks,
    updatedAt: p.updatedAt,
  }));

  return NextResponse.json({ projects: result });
}
