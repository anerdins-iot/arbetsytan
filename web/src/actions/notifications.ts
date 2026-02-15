"use server";

import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { requireAuth } from "@/lib/auth";
import { prisma, tenantDb, userDb } from "@/lib/db";
import {
  getNotificationPreferences as getStoredNotificationPreferences,
  updateNotificationPreferences as updateStoredNotificationPreferences,
} from "@/actions/notification-preferences";
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

const channelPreferenceSchema = z.object({
  inApp: z.boolean(),
  push: z.boolean(),
  email: z.boolean(),
});

const userNotificationPreferencesSchema = z.object({
  taskAssigned: channelPreferenceSchema,
  deadlineSoon: channelPreferenceSchema,
  projectStatusChanged: channelPreferenceSchema,
});

export type NotificationItem = RealtimeNotification;
export type UserNotificationPreferences = z.infer<typeof userNotificationPreferencesSchema>;

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
  const tenantClient = tenantDb(data.tenantId);

  if (data.projectId) {
    const project = await tenantClient.project.findUnique({ where: { id: data.projectId } });
    if (!project) {
      return { success: false, error: "PROJECT_NOT_FOUND" };
    }
  }

  const translated = await resolveLocalizedText(data);
  const db = userDb(data.userId, {});

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

  return { success: true, notification: payload };
}

export async function markNotificationRead(input: {
  notificationId: string;
}): Promise<{ success: boolean; error?: string }> {
  const { userId } = await requireAuth();
  const parsed = markReadSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "INVALID_INPUT" };
  }

  const db = userDb(userId, {});
  await db.notification.updateMany({
    where: {
      id: parsed.data.notificationId,
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
  const { userId } = await requireAuth();
  const db = userDb(userId, {});

  await db.notification.updateMany({
    where: {
      channel: "IN_APP",
      read: false,
    },
    data: { read: true },
  });

  return { success: true };
}

export async function getUserNotificationPreferences(): Promise<{
  success: boolean;
  preferences?: UserNotificationPreferences;
  error?: string;
}> {
  const result = await getStoredNotificationPreferences();
  if (!result.success || !result.preferences) {
    return { success: false, error: "FAILED_TO_LOAD" };
  }

  return {
    success: true,
    preferences: {
      taskAssigned: {
        inApp: true,
        push: result.preferences.pushEnabled,
        email: result.preferences.emailTaskAssigned,
      },
      deadlineSoon: {
        inApp: true,
        push: result.preferences.pushEnabled,
        email: result.preferences.emailDeadlineTomorrow,
      },
      projectStatusChanged: {
        inApp: true,
        push: result.preferences.pushEnabled,
        email: result.preferences.emailProjectStatusChanged,
      },
    },
  };
}

export async function updateNotificationPreferences(input: UserNotificationPreferences): Promise<{
  success: boolean;
  error?: string;
}> {
  await requireAuth();
  const parsed = userNotificationPreferencesSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "INVALID_INPUT" };
  }

  const pushValues = [
    parsed.data.taskAssigned.push,
    parsed.data.deadlineSoon.push,
    parsed.data.projectStatusChanged.push,
  ];

  // Existing schema stores push as one global flag for all event types.
  if (new Set(pushValues).size > 1) {
    return { success: false, error: "PUSH_MUST_BE_GLOBAL" };
  }

  return updateStoredNotificationPreferences({
    pushEnabled: parsed.data.taskAssigned.push,
    emailTaskAssigned: parsed.data.taskAssigned.email,
    emailDeadlineTomorrow: parsed.data.deadlineSoon.email,
    emailProjectStatusChanged: parsed.data.projectStatusChanged.email,
  });
}
