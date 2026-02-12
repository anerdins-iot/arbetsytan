import { getTranslations } from "next-intl/server";
import { prisma, tenantDb } from "@/lib/db";
import { emitNotificationToUser } from "@/lib/socket";
import { sendEmail } from "@/lib/email";
import { sendPushToSubscriptions } from "@/lib/push";
import { sendExpoPush } from "@/lib/expo-push";

type EventType = "TASK_ASSIGNED" | "DEADLINE_SOON" | "PROJECT_STATUS_CHANGED";

type Recipient = {
  id: string;
  email: string;
  locale: string;
};

type NotificationContent = {
  title: string;
  body: string;
  emailSubject: string;
  emailHtml: string;
};

type DeliveryChannels = {
  inApp?: boolean;
  push?: boolean;
  email?: boolean;
};

type DeliverNotificationArgs = {
  tenantId: string;
  userId: string;
  projectId: string;
  taskId?: string;
  eventType: EventType;
  title: string;
  body: string;
  channels: Required<DeliveryChannels>;
  pushEnabled: boolean;
  emailEnabled: boolean;
  emailTo: string;
  emailSubject: string;
  emailHtml: string;
};

async function getRecipient(userId: string): Promise<Recipient | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, locale: true },
  });

  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    locale: user.locale === "en" ? "en" : "sv",
  };
}

async function getOrCreatePreferences(tenantId: string, userId: string) {
  // Use global prisma for upsert to avoid tenantDb extension conflict
  return prisma.notificationPreference.upsert({
    where: { userId_tenantId: { userId, tenantId } },
    update: {},
    create: {
      userId,
      tenantId,
    },
  });
}

async function createInAppNotification(args: {
  tenantId: string;
  userId: string;
  projectId: string;
  taskId?: string;
  eventType: EventType;
  title: string;
  body: string;
}) {
  const db = tenantDb(args.tenantId);
  const created = await db.notification.create({
    data: {
      user: { connect: { id: args.userId } },
      project: { connect: { id: args.projectId } },
      ...(args.taskId ? { task: { connect: { id: args.taskId } } } : {}),
      title: args.title,
      body: args.body,
      channel: "IN_APP",
      eventType: args.eventType,
      read: false,
      sent: true,
    },
  });

  emitNotificationToUser(args.userId, {
    id: created.id,
    title: created.title,
    body: created.body,
    read: created.read,
    createdAt: created.createdAt.toISOString(),
    projectId: created.projectId,
  });
}

export async function deliverNotification(args: DeliverNotificationArgs) {
  if (args.channels.inApp) {
    await createInAppNotification({
      tenantId: args.tenantId,
      userId: args.userId,
      projectId: args.projectId,
      taskId: args.taskId,
      eventType: args.eventType,
      title: args.title,
      body: args.body,
    });
  }

  await Promise.all([
    sendPushIfEnabled({
      tenantId: args.tenantId,
      userId: args.userId,
      projectId: args.projectId,
      taskId: args.taskId,
      eventType: args.eventType,
      title: args.title,
      body: args.body,
      enabled: args.channels.push && args.pushEnabled,
    }),
    sendEmailIfEnabled({
      tenantId: args.tenantId,
      userId: args.userId,
      projectId: args.projectId,
      taskId: args.taskId,
      eventType: args.eventType,
      enabled: args.channels.email && args.emailEnabled,
      to: args.emailTo,
      subject: args.emailSubject,
      html: args.emailHtml,
      title: args.title,
      body: args.body,
    }),
  ]);
}

async function sendPushIfEnabled(args: {
  tenantId: string;
  userId: string;
  projectId: string;
  taskId?: string;
  eventType: EventType;
  title: string;
  body: string;
  enabled: boolean;
}) {
  const db = tenantDb(args.tenantId);
  if (!args.enabled) return;

  // Web push (browser subscriptions)
  const subscriptions = await db.pushSubscription.findMany({
    where: { userId: args.userId },
    select: { endpoint: true, p256dhKey: true, authKey: true },
  });

  const pushResult = await sendPushToSubscriptions(subscriptions, {
    title: args.title,
    body: args.body,
    url: `/projects/${args.projectId}`,
  });

  if (pushResult.invalidEndpoints.length > 0) {
    await db.pushSubscription.deleteMany({
      where: { endpoint: { in: pushResult.invalidEndpoints } },
    });
  }

  // Expo push (mobile app)
  let expoPushSent = false;
  const user = await prisma.user.findUnique({
    where: { id: args.userId },
    select: { pushToken: true },
  });

  if (user?.pushToken) {
    expoPushSent = await sendExpoPush(user.pushToken, {
      title: args.title,
      body: args.body,
      data: {
        projectId: args.projectId,
        ...(args.taskId ? { taskId: args.taskId } : {}),
      },
    });
  }

  await db.notification.create({
    data: {
      user: { connect: { id: args.userId } },
      project: { connect: { id: args.projectId } },
      ...(args.taskId ? { task: { connect: { id: args.taskId } } } : {}),
      title: args.title,
      body: args.body,
      channel: "PUSH",
      eventType: args.eventType,
      sent: pushResult.sentCount > 0 || expoPushSent,
    },
  });
}

async function sendEmailIfEnabled(args: {
  tenantId: string;
  userId: string;
  projectId: string;
  taskId?: string;
  eventType: EventType;
  enabled: boolean;
  to: string;
  subject: string;
  html: string;
  title: string;
  body: string;
}) {
  if (!args.enabled) return;
  const db = tenantDb(args.tenantId);
  const result = await sendEmail({
    to: args.to,
    subject: args.subject,
    html: args.html,
  });

  if (!result.success) {
    console.log("[email] Email not sent", result.error);
  }

  await db.notification.create({
    data: {
      user: { connect: { id: args.userId } },
      project: { connect: { id: args.projectId } },
      ...(args.taskId ? { task: { connect: { id: args.taskId } } } : {}),
      title: args.title,
      body: args.body,
      channel: "EMAIL",
      eventType: args.eventType,
      sent: result.success,
    },
  });
}

async function localizeTaskAssigned(locale: string, params: Record<string, string>) {
  const t = await getTranslations({ locale });
  return {
    title: t("notifications.taskAssigned.title"),
    body: t("notifications.taskAssigned.body", params),
    emailSubject: t("notificationEmails.taskAssigned.subject", params),
    emailHtml: t("notificationEmails.taskAssigned.body", params),
  } satisfies NotificationContent;
}

async function localizeDeadlineSoon(
  locale: string,
  params: Record<string, string>
): Promise<NotificationContent> {
  const t = await getTranslations({ locale });
  return {
    title: t("notifications.deadlineTomorrow.title"),
    body: t("notifications.deadlineTomorrow.body", params),
    emailSubject: t("notificationEmails.deadlineTomorrow.subject", params),
    emailHtml: t("notificationEmails.deadlineTomorrow.body", params),
  };
}

async function localizeProjectStatusChanged(
  locale: string,
  params: Record<string, string>
): Promise<NotificationContent> {
  const t = await getTranslations({ locale });
  return {
    title: t("notifications.projectStatusChanged.title"),
    body: t("notifications.projectStatusChanged.body", params),
    emailSubject: t("notificationEmails.projectStatusChanged.subject", params),
    emailHtml: t("notificationEmails.projectStatusChanged.body", params),
  };
}

export async function notifyTaskAssigned(args: {
  tenantId: string;
  projectId: string;
  taskId: string;
  taskTitle: string;
  assignedToUserId: string;
  assignedByName: string;
  projectName: string;
}) {
  const recipient = await getRecipient(args.assignedToUserId);
  if (!recipient) return;

  const preferences = await getOrCreatePreferences(args.tenantId, recipient.id);
  const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const projectUrl = `${appUrl}/${recipient.locale}/projects/${args.projectId}`;
  const params = {
    taskTitle: args.taskTitle,
    assignedBy: args.assignedByName,
    projectName: args.projectName,
    projectUrl,
  };

  const content = await localizeTaskAssigned(recipient.locale, params);
  await createInAppNotification({
    tenantId: args.tenantId,
    userId: recipient.id,
    projectId: args.projectId,
    taskId: args.taskId,
    eventType: "TASK_ASSIGNED",
    title: content.title,
    body: content.body,
  });

  await Promise.all([
    sendPushIfEnabled({
      tenantId: args.tenantId,
      userId: recipient.id,
      projectId: args.projectId,
      taskId: args.taskId,
      eventType: "TASK_ASSIGNED",
      title: content.title,
      body: content.body,
      enabled: preferences.pushEnabled,
    }),
    sendEmailIfEnabled({
      tenantId: args.tenantId,
      userId: recipient.id,
      projectId: args.projectId,
      taskId: args.taskId,
      eventType: "TASK_ASSIGNED",
      enabled: preferences.emailTaskAssigned,
      to: recipient.email,
      subject: content.emailSubject,
      html: content.emailHtml,
      title: content.title,
      body: content.body,
    }),
  ]);
}

export async function notifyProjectStatusChanged(args: {
  tenantId: string;
  projectId: string;
  recipientUserId: string;
  projectName: string;
  previousStatus: string;
  newStatus: string;
}) {
  const recipient = await getRecipient(args.recipientUserId);
  if (!recipient) return;

  const preferences = await getOrCreatePreferences(args.tenantId, recipient.id);
  const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const projectUrl = `${appUrl}/${recipient.locale}/projects/${args.projectId}`;
  const params = {
    projectName: args.projectName,
    previousStatus: args.previousStatus,
    newStatus: args.newStatus,
    projectUrl,
  };

  const content = await localizeProjectStatusChanged(recipient.locale, params);
  await createInAppNotification({
    tenantId: args.tenantId,
    userId: recipient.id,
    projectId: args.projectId,
    eventType: "PROJECT_STATUS_CHANGED",
    title: content.title,
    body: content.body,
  });

  await Promise.all([
    sendPushIfEnabled({
      tenantId: args.tenantId,
      userId: recipient.id,
      projectId: args.projectId,
      eventType: "PROJECT_STATUS_CHANGED",
      title: content.title,
      body: content.body,
      enabled: preferences.pushEnabled,
    }),
    sendEmailIfEnabled({
      tenantId: args.tenantId,
      userId: recipient.id,
      projectId: args.projectId,
      eventType: "PROJECT_STATUS_CHANGED",
      enabled: preferences.emailProjectStatusChanged,
      to: recipient.email,
      subject: content.emailSubject,
      html: content.emailHtml,
      title: content.title,
      body: content.body,
    }),
  ]);
}

export async function notifyDeadlineSoon(args: {
  tenantId: string;
  projectId: string;
  taskId: string;
  taskTitle: string;
  userId: string;
  projectName: string;
  deadline: Date;
  channels?: DeliveryChannels;
  dedupeSince?: Date;
}): Promise<boolean> {
  const db = tenantDb(args.tenantId);
  const channels: Required<DeliveryChannels> = {
    inApp: args.channels?.inApp ?? true,
    push: args.channels?.push ?? true,
    email: args.channels?.email ?? true,
  };

  const selectedChannels = [
    channels.inApp ? "IN_APP" : null,
    channels.push ? "PUSH" : null,
    channels.email ? "EMAIL" : null,
  ].filter((value): value is "IN_APP" | "PUSH" | "EMAIL" => value !== null);

  if (selectedChannels.length === 0) {
    return false;
  }

  const dedupeFrom = args.dedupeSince ?? new Date(Date.now() - 12 * 60 * 60 * 1000);
  const recent = await db.notification.findMany({
    where: {
      userId: args.userId,
      taskId: args.taskId,
      eventType: "DEADLINE_SOON",
      channel: { in: selectedChannels },
      createdAt: { gte: dedupeFrom },
    },
    select: { channel: true },
  });
  const sentChannels = new Set(recent.map((item) => item.channel));
  const shouldSendInApp = channels.inApp && !sentChannels.has("IN_APP");
  const shouldSendPush = channels.push && !sentChannels.has("PUSH");
  const shouldSendEmail = channels.email && !sentChannels.has("EMAIL");
  if (!shouldSendInApp && !shouldSendPush && !shouldSendEmail) return false;

  const recipient = await getRecipient(args.userId);
  if (!recipient) return false;

  const preferences = await getOrCreatePreferences(args.tenantId, recipient.id);
  const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const projectUrl = `${appUrl}/${recipient.locale}/projects/${args.projectId}`;
  const params = {
    taskTitle: args.taskTitle,
    projectName: args.projectName,
    deadline: new Intl.DateTimeFormat(recipient.locale, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(args.deadline),
    projectUrl,
  };

  const content = await localizeDeadlineSoon(recipient.locale, params);
  await deliverNotification({
    tenantId: args.tenantId,
    userId: recipient.id,
    projectId: args.projectId,
    taskId: args.taskId,
    eventType: "DEADLINE_SOON",
    title: content.title,
    body: content.body,
    channels: {
      inApp: shouldSendInApp,
      push: shouldSendPush,
      email: shouldSendEmail,
    },
    pushEnabled: preferences.pushEnabled,
    emailEnabled: preferences.emailDeadlineTomorrow,
    emailTo: recipient.email,
    emailSubject: content.emailSubject,
    emailHtml: content.emailHtml,
  });
  return true;
}
