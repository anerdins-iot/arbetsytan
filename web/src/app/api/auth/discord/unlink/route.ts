/**
 * POST /api/auth/discord/unlink
 *
 * Removes the Discord account link for the currently authenticated user.
 *
 * 1. Verifies the user is authenticated.
 * 2. Finds and deletes the Account with provider="discord" belonging to this user.
 * 3. Publishes a `discord:user-unlinked` event via Redis so the bot can revoke roles.
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishDiscordEvent } from "@/lib/redis-pubsub";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Find the Discord account for this user
    const account = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: "discord",
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: "No Discord account linked" },
        { status: 404 }
      );
    }

    const discordUserId = account.providerAccountId;

    // Delete the account link
    await prisma.account.delete({
      where: { id: account.id },
    });

    // Publish event for Discord bot to revoke roles
    await publishDiscordEvent("discord:user-unlinked", {
      userId: session.user.id,
      tenantId: session.tenantId,
      discordUserId,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[discord-unlink] Error:", err);
    return NextResponse.json(
      { error: "Failed to unlink Discord account" },
      { status: 500 }
    );
  }
}
