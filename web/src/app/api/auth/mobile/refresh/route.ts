/**
 * POST /api/auth/mobile/refresh
 * Refresh access token using a valid refresh token.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  verifyRefreshToken,
  createAccessToken,
  createRefreshToken,
} from "@/lib/auth-mobile";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const refreshToken =
      typeof body.refreshToken === "string" ? body.refreshToken : "";

    if (!refreshToken) {
      return NextResponse.json(
        { error: "Refresh token krävs" },
        { status: 400 }
      );
    }

    const payload = verifyRefreshToken(refreshToken);
    if (!payload) {
      return NextResponse.json(
        { error: "Ogiltig eller utgången refresh token" },
        { status: 401 }
      );
    }

    // Verify user still exists and has membership
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        memberships: {
          where: { tenantId: payload.tenantId },
          take: 1,
        },
      },
    });

    if (!user || user.lockedAt || !user.memberships[0]) {
      return NextResponse.json(
        { error: "Kontot är inte längre giltigt" },
        { status: 401 }
      );
    }

    const membership = user.memberships[0];
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      name: user.name,
      tenantId: membership.tenantId,
      role: membership.role,
    };

    return NextResponse.json({
      accessToken: createAccessToken(tokenPayload),
      refreshToken: createRefreshToken(tokenPayload),
    });
  } catch {
    return NextResponse.json(
      { error: "Internt serverfel" },
      { status: 500 }
    );
  }
}
