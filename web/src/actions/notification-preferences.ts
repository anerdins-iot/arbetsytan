"use server";

import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/db";

const preferenceSchema = z.object({
  pushEnabled: z.boolean(),
  emailTaskAssigned: z.boolean(),
  emailDeadlineTomorrow: z.boolean(),
  emailProjectStatusChanged: z.boolean(),
});

const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().max(500).optional(),
});

const endpointSchema = z.object({
  endpoint: z.string().url(),
});

export type NotificationPreferences = z.infer<typeof preferenceSchema>;

async function getOrCreatePreferences(tenantId: string, userId: string) {
  const db = tenantDb(tenantId);
  return db.notificationPreference.upsert({
    where: { userId_tenantId: { userId, tenantId } },
    update: {},
    create: {
      user: { connect: { id: userId } },
      tenant: { connect: { id: tenantId } },
    },
  });
}

export async function getNotificationPreferences(): Promise<{
  success: boolean;
  preferences?: NotificationPreferences;
}> {
  const { tenantId, userId } = await requireAuth();
  const preferences = await getOrCreatePreferences(tenantId, userId);

  return {
    success: true,
    preferences: {
      pushEnabled: preferences.pushEnabled,
      emailTaskAssigned: preferences.emailTaskAssigned,
      emailDeadlineTomorrow: preferences.emailDeadlineTomorrow,
      emailProjectStatusChanged: preferences.emailProjectStatusChanged,
    },
  };
}

export async function updateNotificationPreferences(input: NotificationPreferences): Promise<{
  success: boolean;
  error?: string;
}> {
  const { tenantId, userId } = await requireAuth();
  const parsed = preferenceSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "INVALID_INPUT" };

  const db = tenantDb(tenantId);
  await db.notificationPreference.upsert({
    where: { userId_tenantId: { userId, tenantId } },
    update: parsed.data,
    create: {
      ...parsed.data,
      user: { connect: { id: userId } },
      tenant: { connect: { id: tenantId } },
    },
  });

  return { success: true };
}

export async function upsertPushSubscription(input: z.infer<typeof pushSubscriptionSchema>): Promise<{
  success: boolean;
  error?: string;
}> {
  const { tenantId, userId } = await requireAuth();
  const parsed = pushSubscriptionSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "INVALID_INPUT" };

  const db = tenantDb(tenantId);
  await db.pushSubscription.upsert({
    where: { tenantId_endpoint: { tenantId, endpoint: parsed.data.endpoint } },
    update: {
      p256dhKey: parsed.data.keys.p256dh,
      authKey: parsed.data.keys.auth,
      userAgent: parsed.data.userAgent ?? null,
      user: { connect: { id: userId } },
    },
    create: {
      endpoint: parsed.data.endpoint,
      p256dhKey: parsed.data.keys.p256dh,
      authKey: parsed.data.keys.auth,
      userAgent: parsed.data.userAgent ?? null,
      user: { connect: { id: userId } },
      tenant: { connect: { id: tenantId } },
    },
  });

  return { success: true };
}

export async function removePushSubscription(input: z.infer<typeof endpointSchema>): Promise<{
  success: boolean;
  error?: string;
}> {
  const { tenantId, userId } = await requireAuth();
  const parsed = endpointSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "INVALID_INPUT" };

  const db = tenantDb(tenantId);
  await db.pushSubscription.deleteMany({
    where: {
      endpoint: parsed.data.endpoint,
      userId,
    },
  });

  return { success: true };
}
