/**
 * GET /api/mobile/projects/[id] — Returns project details with tasks and files.
 * Verifies JWT, uses requireProject for access control.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyBearerToken } from "@/lib/auth-mobile";
import { requireProject } from "@/lib/auth";
import { tenantDb } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = verifyBearerToken(req.headers.get("authorization"));
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;
  const { tenantId, userId } = payload;

  let project;
  try {
    project = await requireProject(tenantId, projectId, userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    const status = message === "PROJECT_NOT_FOUND" ? 404 : 403;
    return NextResponse.json({ error: message }, { status });
  }

  const db = tenantDb(tenantId);

  const [tasks, files] = await Promise.all([
    db.task.findMany({
      where: { projectId },
      include: {
        assignments: {
          include: {
            membership: {
              include: { user: { select: { id: true, name: true, email: true } } },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    db.file.findMany({
      where: { projectId },
      select: {
        id: true,
        name: true,
        type: true,
        size: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const taskList = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    deadline: t.deadline,
    assignees: t.assignments.map((a) => ({
      id: a.membership.user.id,
      name: a.membership.user.name,
      email: a.membership.user.email,
    })),
  }));

  return NextResponse.json({
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.status,
      address: project.address,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
    tasks: taskList,
    files,
  });
}
