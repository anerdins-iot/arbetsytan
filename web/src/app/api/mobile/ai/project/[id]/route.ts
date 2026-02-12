/**
 * POST /api/mobile/ai/project/[id] — Project AI chat.
 * Verifies JWT, uses requireProject for access control.
 * Stub implementation — returns echo if AI keys are not configured.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyBearerToken } from "@/lib/auth-mobile";
import { requireProject } from "@/lib/auth";
import { tenantDb } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = verifyBearerToken(req.headers.get("authorization"));
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;
  const { tenantId, userId } = payload;

  try {
    await requireProject(tenantId, projectId, userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    const status = message === "PROJECT_NOT_FOUND" ? 404 : 403;
    return NextResponse.json({ error: message }, { status });
  }

  let body: { message: string; conversationId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.message?.trim()) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const db = tenantDb(tenantId);

  // Get or create project conversation
  let conversationId = body.conversationId;
  if (!conversationId) {
    const conversation = await db.conversation.create({
      data: {
        type: "PROJECT",
        title: body.message.slice(0, 100),
        userId,
        projectId,
      },
    });
    conversationId = conversation.id;
  } else {
    // Verify conversation belongs to user and project
    const existing = await db.conversation.findFirst({
      where: { id: conversationId, userId, projectId, type: "PROJECT" },
    });
    if (!existing) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
  }

  // Save user message
  await db.message.create({
    data: {
      role: "USER",
      content: body.message,
      conversationId,
    },
  });

  // Stub AI response — real AI integration would use Vercel AI SDK here
  const aiResponse =
    "Projekt-AI kopplas upp med konfigurerade API-nycklar. Ditt meddelande mottogs.";

  await db.message.create({
    data: {
      role: "ASSISTANT",
      content: aiResponse,
      conversationId,
    },
  });

  return NextResponse.json({
    conversationId,
    reply: aiResponse,
  });
}
