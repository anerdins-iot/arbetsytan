/**
 * Emit Discord-related events to Redis for the Discord bot to consume.
 * Used when user role changes or user is deactivated so the bot can sync/revoke roles.
 */
import { prisma } from "@/lib/db";
import { publishDiscordEvent } from "@/lib/redis-pubsub";

export async function emitUserRoleChanged(
  userId: string,
  tenantId: string,
  newRole: string
): Promise<void> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "discord" },
  });
  if (!account) return;

  await publishDiscordEvent("discord:user-role-changed", {
    userId,
    tenantId,
    discordUserId: account.providerAccountId,
    newRole,
  });
}

export async function emitUserDeactivated(
  userId: string,
  tenantId: string
): Promise<void> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "discord" },
  });
  if (!account) return;

  await publishDiscordEvent("discord:user-deactivated", {
    userId,
    tenantId,
    discordUserId: account.providerAccountId,
  });
}
