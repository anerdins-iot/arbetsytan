import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { tenantDb } from "@/lib/db";

/**
 * GET /api/files/projects
 * Returns files from all projects where the current user is a member.
 * Includes project name for display.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id || !session.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = tenantDb(session.tenantId);

    // First, find user's membership in this tenant
    const membership = await db.membership.findFirst({
      where: {
        userId: session.user.id,
      },
      select: {
        id: true,
      },
    });

    if (!membership) {
      return NextResponse.json({ files: [], projects: [] });
    }

    // Get all projects where the user is a member via their membership
    const projectMemberships = await db.projectMember.findMany({
      where: {
        membershipId: membership.id,
      },
      select: {
        projectId: true,
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const projectIds = projectMemberships.map((m) => m.projectId);

    if (projectIds.length === 0) {
      return NextResponse.json({ files: [], projects: [] });
    }

    // Create a map of projectId -> projectName
    const projectMap = new Map(
      projectMemberships.map((m) => [m.project.id, m.project.name])
    );

    // Get files from these projects
    const files = await db.file.findMany({
      where: {
        projectId: {
          in: projectIds,
        },
      },
      select: {
        id: true,
        name: true,
        type: true,
        size: true,
        projectId: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 200,
    });

    // Also return the list of projects for filtering UI
    const projects = projectMemberships.map((m) => ({
      id: m.project.id,
      name: m.project.name,
    }));

    return NextResponse.json({
      files: files.map((f) => ({
        id: f.id,
        name: f.name,
        type: f.type,
        size: f.size,
        projectId: f.projectId,
        projectName: f.projectId ? projectMap.get(f.projectId) : undefined,
        createdAt: f.createdAt.toISOString(),
      })),
      projects,
    });
  } catch (error) {
    console.error("Failed to fetch project files:", error);
    return NextResponse.json(
      { error: "Failed to fetch files" },
      { status: 500 }
    );
  }
}
