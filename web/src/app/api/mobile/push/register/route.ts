/**
 * POST /api/mobile/push/register — Register Expo push token for the authenticated user.
 * Stores the token in the User.pushToken field for Expo Push API delivery.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyBearerToken } from "@/lib/auth-mobile";
import { prisma } from "@/lib/db";
import { z } from "zod";

const registerSchema = z.object({
  pushToken: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const payload = verifyBearerToken(req.headers.get("authorization"));
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid push token" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: payload.userId },
    data: { pushToken: parsed.data.pushToken },
  });

  return NextResponse.json({ success: true });
}
