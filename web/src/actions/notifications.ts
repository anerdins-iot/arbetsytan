"use server";

import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { requireAuth } from "@/lib/auth";
import { prisma, tenantDb } from "@/lib/db";
import { emitNotificationToUser } from "@/lib/socket";
import type { RealtimeNotification } from "@/lib/socket-events";

const notificationParamsSchema = z.record(z.string(), z.union([z.string(), z.number()]));

const createNotificationSchema = z
  .object({
    userId: z.string().min(1),
    tenantId: z.string().min(1),
    projectId: z.string().min(1).optional(),
    title: z.string().min(1).max(200).optional(),
    body: z.string().min(1).max(2000).optional(),
    titleKey: z.string().min(1).optional(),
    bodyKey: z.string().min(1).optional(),
    params: notificationParamsSchema.optional(),
  })
  .refine(
    (data) => {
      const hasRaw = Boolean(data.title && data.body);
      const hasI18nKeys = Boolean(data.titleKey && data.bodyKey);
      return hasRaw || hasI18nKeys;
    },
    {
      message: "INVALID_NOTIFICATION_CONTENT",
      path: ["title"],
    }
  );

const markReadSchema = z.object({
  notificationId: z.string().min(1),
});

const listSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
});

export type NotificationItem = RealtimeNotification;

async function resolveLocalizedText(input: z.infer<typeof createNotificationSchema>) {
  if (input.title && input.body) {
    return { title: input.title, body: input.body };
  }

  const recipient = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { locale: true },
  });
  const locale = recipient?.locale === "en" ? "en" : "sv";
  const t = await getTranslations({ locale });

  const values = input.params ?? {};
  return {
    title: t(input.titleKey!, values),
    body: t(input.bodyKey!, values),
  };
}

export async function getNotifications(input?: { limit?: number }): Promise<{
  notifications: NotificationItem[];
  unreadCount: number;
}> {
  const { userId, tenantId } = await requireAuth();
  const db = tenantDb(tenantId);

  const parsed = listSchema.safeParse({ limit: input?.limit });
  const limit = parsed.success ? parsed.data.limit : 20;

  const [notifications, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: { userId, channel: "IN_APP" },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    db.notification.count({
      where: { userId, channel: "IN_APP", read: false },
    }),
  ]);

  return {
    notifications: notifications.map((notification) => ({
      id: notification.id,
      title: notification.title,
      body: notification.body,
      read: notification.read,
      createdAt: notification.createdAt.toISOString(),
      projectId: notification.projectId,
    })),
    unreadCount,
  };
}

export async function createNotification(
  input: z.infer<typeof createNotificationSchema>
): Promise<{ success: boolean; notification?: NotificationItem; error?: string }> {
  const parsed = createNotificationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "INVALID_INPUT" };
  }

  const data = parsed.data;
  const db = tenantDb(data.tenantId);

  if (data.projectId) {
    const project = await db.project.findUnique({ where: { id: data.projectId } });
    if (!project) {
      return { success: false, error: "PROJECT_NOT_FOUND" };
    }
  }

  const translated = await resolveLocalizedText(data);
  const created = await db.notification.create({
    data: {
      title: translated.title,
      body: translated.body,
      channel: "IN_APP",
      read: false,
      sent: true,
      user: { connect: { id: data.userId } },
      ...(data.projectId ? { project: { connect: { id: data.projectId } } } : {}),
    },
  });

  const payload: NotificationItem = {
    id: created.id,
    title: created.title,
    body: created.body,
    read: created.read,
    createdAt: created.createdAt.toISOString(),
    projectId: created.projectId,
  };

  emitNotificationToUser(data.userId, payload);

  return { success: true, notification: payload };
}

export async function markNotificationRead(input: {
  notificationId: string;
}): Promise<{ success: boolean; error?: string }> {
  const { userId, tenantId } = await requireAuth();
  const parsed = markReadSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "INVALID_INPUT" };
  }

  const db = tenantDb(tenantId);
  await db.notification.updateMany({
    where: {
      id: parsed.data.notificationId,
      userId,
      channel: "IN_APP",
    },
    data: { read: true },
  });
  return { success: true };
}

export async function markAllNotificationsRead(): Promise<{
  success: boolean;
  error?: string;
}> {
  const { userId, tenantId } = await requireAuth();
  const db = tenantDb(tenantId);

  await db.notification.updateMany({
    where: {
      userId,
      channel: "IN_APP",
      read: false,
    },
    data: { read: true },
  });

  return { success: true };
}
