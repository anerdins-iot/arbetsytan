/**
 * POST /api/mobile/ai — Personal AI chat.
 * Verifies JWT, scopes conversation to userId.
 * Stub implementation — returns echo if AI keys are not configured.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyBearerToken } from "@/lib/auth-mobile";
import { tenantDb } from "@/lib/db";

export async function POST(req: NextRequest) {
  const payload = verifyBearerToken(req.headers.get("authorization"));
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { tenantId, userId } = payload;

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

  // Get or create conversation
  let conversationId = body.conversationId;
  if (!conversationId) {
    const conversation = await db.conversation.create({
      data: {
        type: "PERSONAL",
        title: body.message.slice(0, 100),
        userId,
      },
    });
    conversationId = conversation.id;
  } else {
    // Verify conversation belongs to user
    const existing = await db.conversation.findFirst({
      where: { id: conversationId, userId, type: "PERSONAL" },
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
    "AI-funktionen kopplas upp med konfigurerade API-nycklar. Ditt meddelande mottogs.";

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
