"use server";

import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

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

// Use global prisma for upsert with composite unique key.
// tenantDb extension adds duplicate tenantId which conflicts with compound unique constraint.
// Security: tenantId is explicitly passed and verified via requireAuth() in calling functions.
async function getOrCreatePreferences(tenantId: string, userId: string) {
  return prisma.notificationPreference.upsert({
    where: { userId_tenantId: { userId, tenantId } },
    update: {},
    create: {
      userId,
      tenantId,
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

  // Use global prisma for upsert with composite unique key (see getOrCreatePreferences comment)
  await prisma.notificationPreference.upsert({
    where: { userId_tenantId: { userId, tenantId } },
    update: parsed.data,
    create: {
      ...parsed.data,
      userId,
      tenantId,
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

  // Use global prisma for upsert with composite unique key (see getOrCreatePreferences comment)
  await prisma.pushSubscription.upsert({
    where: { tenantId_endpoint: { tenantId, endpoint: parsed.data.endpoint } },
    update: {
      p256dhKey: parsed.data.keys.p256dh,
      authKey: parsed.data.keys.auth,
      userAgent: parsed.data.userAgent ?? null,
      userId,
    },
    create: {
      endpoint: parsed.data.endpoint,
      p256dhKey: parsed.data.keys.p256dh,
      authKey: parsed.data.keys.auth,
      userAgent: parsed.data.userAgent ?? null,
      userId,
      tenantId,
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

  // Use global prisma - tenantId and userId are explicitly filtered
  await prisma.pushSubscription.deleteMany({
    where: {
      endpoint: parsed.data.endpoint,
      userId,
      tenantId,
    },
  });

  return { success: true };
}
