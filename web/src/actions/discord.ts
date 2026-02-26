"use server";

import { z } from "zod";
import { requireAuth, requireRole } from "@/lib/auth";
import { tenantDb } from "@/lib/db";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { publishDiscordEvent, verifyDiscordGuildWithBot } from "@/lib/redis-pubsub";
import type { DiscordCategoryType } from "../../generated/prisma/client";

// --- Constants ---

/**
 * Discord bot permissions integer.
 * Calculated from: ManageChannels, AddReactions, ViewChannel, SendMessages,
 * ManageMessages, EmbedLinks, AttachFiles, ReadMessageHistory,
 * UseExternalEmojis, ManageRoles, SendMessagesInThreads.
 */
const BOT_PERMISSIONS = "275146730576";

// --- Types ---

export type DiscordActionResult = {
  success: boolean;
  error?: string;
};

export type DiscordSettingsData = {
  discordGuildId: string | null;
  discordBotEnabled: boolean;
  botInviteUrl: string | null;
};

export type LinkedUser = {
  discordUserId: string;
  discordUsername: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  role: string;
  linkedAt: string;
};

export type DiscordCategoryData = {
  id: string;
  name: string;
  type: DiscordCategoryType;
  discordCategoryId: string | null;
  sortOrder: number;
  createdAt: string;
};

export type DiscordRoleMappingData = {
  id: string;
  systemRole: string;
  discordRoleId: string;
  discordRoleName: string;
  color: string;
  createdAt: string;
};

// --- Validation Schemas ---

const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(["PROJECTS", "SUPPORT", "GENERAL", "WELCOME", "CUSTOM"]),
});

const updateCategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  sortOrder: z.number().int().min(0).optional(),
});

const updateRoleMappingSchema = z.object({
  systemRole: z.string().min(1),
  discordRoleName: z.string().trim().min(1).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});

// --- Server Actions ---

export async function getDiscordSettings(): Promise<DiscordSettingsData> {
  const { tenantId } = await requireRole(["ADMIN"]);
  const db = tenantDb(tenantId);

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: {
      discordGuildId: true,
      discordBotEnabled: true,
    },
  });

  if (!tenant) {
    throw new Error("TENANT_NOT_FOUND");
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  let botInviteUrl: string | null = null;
  if (clientId) {
    const params = new URLSearchParams({
      client_id: clientId,
      permissions: BOT_PERMISSIONS,
      scope: "bot applications.commands",
    });
    botInviteUrl = `https://discord.com/oauth2/authorize?${params.toString()}`;
  }

  return {
    ...tenant,
    botInviteUrl,
  };
}

export async function connectDiscordServer(
  guildId: string
): Promise<DiscordActionResult> {
  const { tenantId } = await requireRole(["ADMIN"]);
  const db = tenantDb(tenantId);

  if (!guildId || guildId.trim().length === 0) {
    return { success: false, error: "INVALID_INPUT" };
  }

  const trimmedGuildId = guildId.trim();
  const verification = await verifyDiscordGuildWithBot(trimmedGuildId, 5000);

  if (verification === "timeout") {
    return { success: false, error: "BOT_NOT_AVAILABLE" };
  }
  if (verification === "guild-not-found") {
    return { success: false, error: "BOT_NOT_IN_SERVER" };
  }

  await db.tenant.update({
    where: { id: tenantId },
    data: {
      discordGuildId: trimmedGuildId,
      discordBotEnabled: true,
    },
  });

  revalidatePath("/[locale]/settings/discord", "page");
  return { success: true };
}

export async function disconnectDiscordServer(): Promise<DiscordActionResult> {
  const { tenantId } = await requireRole(["ADMIN"]);
  const db = tenantDb(tenantId);

  await db.tenant.update({
    where: { id: tenantId },
    data: {
      discordGuildId: null,
      discordBotEnabled: false,
    },
  });

  revalidatePath("/[locale]/settings/discord", "page");
  return { success: true };
}

export async function toggleDiscordBot(
  enabled: boolean
): Promise<DiscordActionResult> {
  const { tenantId } = await requireRole(["ADMIN"]);
  const db = tenantDb(tenantId);

  await db.tenant.update({
    where: { id: tenantId },
    data: { discordBotEnabled: enabled },
  });

  revalidatePath("/[locale]/settings/discord", "page");
  return { success: true };
}

export async function getLinkedUsers(): Promise<LinkedUser[]> {
  const { tenantId } = await requireRole(["ADMIN"]);

  // Query through global prisma since Account doesn't have tenantId directly
  // We need to find accounts linked via users that belong to this tenant
  const memberships = await prisma.membership.findMany({
    where: { tenantId },
    include: {
      user: {
        include: {
          Account: {
            where: { provider: "discord" },
          },
        },
      },
    },
  });

  return memberships
    .filter((m) => m.user.Account.length > 0)
    .map((m) => {
      const discordAccount = m.user.Account[0];
      return {
        discordUserId: discordAccount.providerAccountId,
        discordUsername: discordAccount.providerAccountId,
        userId: m.user.id,
        userName: m.user.name,
        userEmail: m.user.email,
        role: m.role,
        linkedAt: discordAccount.id,
      };
    });
}

export async function getDiscordCategories(): Promise<DiscordCategoryData[]> {
  const { tenantId } = await requireRole(["ADMIN"]);
  const db = tenantDb(tenantId);

  const categories = await db.discordCategory.findMany({
    orderBy: { sortOrder: "asc" },
  });

  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    discordCategoryId: c.discordCategoryId,
    sortOrder: c.sortOrder,
    createdAt: c.createdAt.toISOString(),
  }));
}

export async function createDiscordCategory(data: {
  name: string;
  type: string;
}): Promise<DiscordActionResult> {
  const { tenantId } = await requireRole(["ADMIN"]);
  const db = tenantDb(tenantId);

  const parsed = createCategorySchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: "INVALID_INPUT" };
  }

  // Check if type already exists for this tenant (unique constraint)
  if (parsed.data.type !== "CUSTOM") {
    const existing = await db.discordCategory.findFirst({
      where: { type: parsed.data.type },
    });
    if (existing) {
      return { success: false, error: "DUPLICATE_TYPE" };
    }
  }

  // Get max sortOrder
  const maxOrder = await db.discordCategory.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const category = await db.discordCategory.create({
    data: {
      tenantId,
      name: parsed.data.name,
      type: parsed.data.type,
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
    },
  });

  await publishDiscordEvent("discord:category-created", {
    tenantId,
    categoryId: category.id,
    name: category.name,
    type: category.type,
  });

  revalidatePath("/[locale]/settings/discord/categories", "page");
  return { success: true };
}

export async function updateDiscordCategory(data: {
  id: string;
  name: string;
  sortOrder?: number;
}): Promise<DiscordActionResult> {
  const { tenantId } = await requireRole(["ADMIN"]);
  const db = tenantDb(tenantId);

  const parsed = updateCategorySchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: "INVALID_INPUT" };
  }

  const category = await db.discordCategory.findUnique({
    where: { id: parsed.data.id },
  });

  if (!category) {
    return { success: false, error: "NOT_FOUND" };
  }

  await db.discordCategory.update({
    where: { id: parsed.data.id },
    data: {
      name: parsed.data.name,
      ...(parsed.data.sortOrder !== undefined && {
        sortOrder: parsed.data.sortOrder,
      }),
    },
  });

  revalidatePath("/[locale]/settings/discord/categories", "page");
  return { success: true };
}

export async function deleteDiscordCategory(
  id: string
): Promise<DiscordActionResult> {
  const { tenantId } = await requireRole(["ADMIN"]);
  const db = tenantDb(tenantId);

  if (!id) {
    return { success: false, error: "INVALID_INPUT" };
  }

  const category = await db.discordCategory.findUnique({
    where: { id },
  });

  if (!category) {
    return { success: false, error: "NOT_FOUND" };
  }

  await publishDiscordEvent("discord:category-deleted", {
    tenantId,
    categoryId: id,
    discordCategoryId: category.discordCategoryId ?? null,
  });

  await db.discordCategory.delete({
    where: { id },
  });

  revalidatePath("/[locale]/settings/discord/categories", "page");
  return { success: true };
}

export async function getDiscordRoleMappings(): Promise<
  DiscordRoleMappingData[]
> {
  const { tenantId } = await requireRole(["ADMIN"]);
  const db = tenantDb(tenantId);

  const mappings = await db.discordRoleMapping.findMany({
    orderBy: { createdAt: "asc" },
  });

  return mappings.map((m) => ({
    id: m.id,
    systemRole: m.systemRole,
    discordRoleId: m.discordRoleId,
    discordRoleName: m.discordRoleName,
    color: m.color,
    createdAt: m.createdAt.toISOString(),
  }));
}

export async function updateRoleMapping(data: {
  systemRole: string;
  discordRoleName: string;
  color: string;
}): Promise<DiscordActionResult> {
  const { tenantId } = await requireRole(["ADMIN"]);
  const db = tenantDb(tenantId);

  const parsed = updateRoleMappingSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: "INVALID_INPUT" };
  }

  // Upsert the role mapping
  await db.discordRoleMapping.upsert({
    where: {
      tenantId_systemRole: {
        tenantId,
        systemRole: parsed.data.systemRole,
      },
    },
    update: {
      discordRoleName: parsed.data.discordRoleName,
      color: parsed.data.color,
    },
    create: {
      tenantId,
      systemRole: parsed.data.systemRole,
      discordRoleId: "",
      discordRoleName: parsed.data.discordRoleName,
      color: parsed.data.color,
    },
  });

  revalidatePath("/[locale]/settings/discord/roles", "page");
  return { success: true };
}

// --- User Discord Account Actions (all roles) ---

export type DiscordAccountStatus = {
  connected: boolean;
  discordUserId?: string;
  discordUsername?: string;
  discordAvatar?: string | null;
};

export async function getDiscordAccountStatus(): Promise<DiscordAccountStatus> {
  const { userId } = await requireAuth();

  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: "discord",
    },
    select: {
      providerAccountId: true,
      access_token: true,
    },
  });

  if (!account) {
    return { connected: false };
  }

  // Try to fetch fresh Discord user info if we have a token
  let username: string | undefined;
  let avatar: string | null | undefined;

  if (account.access_token) {
    try {
      const res = await fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${account.access_token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as {
          username: string;
          avatar: string | null;
        };
        username = data.username;
        avatar = data.avatar;
      }
    } catch {
      // Token may be expired — just return what we have
    }
  }

  return {
    connected: true,
    discordUserId: account.providerAccountId,
    discordUsername: username,
    discordAvatar: avatar,
  };
}

export async function disconnectDiscordAccount(): Promise<DiscordActionResult> {
  const { userId } = await requireAuth();

  try {
    await prisma.account.deleteMany({
      where: {
        userId,
        provider: "discord",
      },
    });

    revalidatePath("/[locale]/settings/profile", "page");
    return { success: true };
  } catch {
    return { success: false, error: "DISCONNECT_FAILED" };
  }
}

export async function syncRoles(): Promise<DiscordActionResult> {
  const { tenantId } = await requireRole(["ADMIN"]);
  const db = tenantDb(tenantId);

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { discordGuildId: true, discordBotEnabled: true },
  });

  if (!tenant?.discordGuildId || !tenant.discordBotEnabled) {
    return { success: false, error: "DISCORD_NOT_CONNECTED" };
  }

  // The actual role sync happens in the Discord bot via Redis pub/sub.
  // Here we just trigger a sync event.
  try {
    const { publishDiscordEvent } = await import("@/lib/redis-pubsub");
    await publishDiscordEvent("discord:sync-roles", {
      tenantId,
      guildId: tenant.discordGuildId,
    });
  } catch {
    return { success: false, error: "SYNC_FAILED" };
  }

  return { success: true };
}
