"use server";

import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { tenantDb } from "@/lib/db";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import type { DiscordCategoryType } from "../../generated/prisma/client";

// --- Types ---

export type DiscordActionResult = {
  success: boolean;
  error?: string;
};

export type DiscordSettingsData = {
  discordGuildId: string | null;
  discordBotEnabled: boolean;
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

  return tenant;
}

export async function connectDiscordServer(
  guildId: string
): Promise<DiscordActionResult> {
  const { tenantId } = await requireRole(["ADMIN"]);
  const db = tenantDb(tenantId);

  if (!guildId || guildId.trim().length === 0) {
    return { success: false, error: "INVALID_INPUT" };
  }

  await db.tenant.update({
    where: { id: tenantId },
    data: {
      discordGuildId: guildId.trim(),
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

  await db.discordCategory.create({
    data: {
      tenantId,
      name: parsed.data.name,
      type: parsed.data.type,
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
    },
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
