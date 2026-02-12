/**
 * GET /api/mobile/tasks — Returns tasks assigned to the authenticated user.
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

  const { tenantId, userId } = payload;
  const db = tenantDb(tenantId);

  // Find the user's membership to get their membershipId for task assignments
  const membership = await db.membership.findFirst({
    where: { userId },
  });

  if (!membership) {
    return NextResponse.json({ error: "No membership" }, { status: 403 });
  }

  const assignments = await db.taskAssignment.findMany({
    where: { membershipId: membership.id },
    include: {
      task: {
        include: {
          project: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { task: { updatedAt: "desc" } },
  });

  const tasks = assignments.map((a) => ({
    id: a.task.id,
    title: a.task.title,
    status: a.task.status,
    priority: a.task.priority,
    deadline: a.task.deadline,
    projectId: a.task.project.id,
    projectName: a.task.project.name,
  }));

  return NextResponse.json({ tasks });
}
