import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { userDb } from "@/lib/db";

/**
 * GET /api/files/personal
 * Returns files uploaded by the current user that are not attached to any project.
 * These are "personal" files in the user's workspace.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id || !session.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const udb = userDb(session.user.id);

    // Get files uploaded by this user that have no project (personal files)
    const files = await udb.file.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        size: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
    });

    return NextResponse.json({
      files: files.map((f) => ({
        id: f.id,
        name: f.name,
        type: f.type,
        size: f.size,
        createdAt: f.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Failed to fetch personal files:", error);
    return NextResponse.json(
      { error: "Failed to fetch files" },
      { status: 500 }
    );
  }
}
