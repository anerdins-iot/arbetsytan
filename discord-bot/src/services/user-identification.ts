import { prisma } from "../lib/prisma.js";

export interface IdentifiedUser {
  userId: string;
  tenantId: string;
  userName: string;
  userRole: string;
  discordUserId: string;
}

/**
 * Identify a user from their Discord ID.
 * Returns null if user hasn't linked their Discord account.
 * If tenantId is provided (e.g. from guild), returns that tenant's membership; otherwise the first membership.
 */
export async function identifyUser(
  discordUserId: string,
  tenantId?: string
): Promise<IdentifiedUser | null> {
  const account = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: "discord",
        providerAccountId: discordUserId,
      },
    },
    include: {
      user: {
        include: {
          memberships: { include: { tenant: true } },
        },
      },
    },
  });

  if (!account?.user) return null;

  const user = account.user;
  const memberships = user.memberships;

  if (memberships.length === 0) return null;

  const membership = tenantId
    ? memberships.find((m) => m.tenantId === tenantId)
    : memberships[0];

  if (!membership) return null;

  return {
    userId: user.id,
    tenantId: membership.tenantId,
    userName: user.name ?? "Unknown",
    userRole: membership.role,
    discordUserId,
  };
}

/**
 * Get tenant from Discord guild ID.
 */
export async function getTenantFromGuild(
  guildId: string
): Promise<{ id: string; discordGuildId: string | null } | null> {
  return prisma.tenant.findUnique({
    where: { discordGuildId: guildId },
    select: { id: true, discordGuildId: true },
  });
}

/**
 * Validate that user has access to a project channel.
 */
export async function validateProjectAccess(
  userId: string,
  discordChannelId: string
): Promise<{ projectId: string; projectName: string } | null> {
  const project = await prisma.project.findUnique({
    where: { discordChannelId },
    select: { id: true, name: true },
  });
  if (!project) return null;

  const member = await prisma.projectMember.findFirst({
    where: {
      projectId: project.id,
      membership: { userId },
    },
    select: { projectId: true },
  });
  if (!member) return null;

  return { projectId: project.id, projectName: project.name };
}
