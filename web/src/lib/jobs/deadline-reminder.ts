import { prisma, tenantDb } from "@/lib/db";
import { notifyDeadlineSoon } from "@/lib/notification-delivery";

type DeadlineReminderRunResult = {
  scannedTenants: number;
  scannedAssignments: number;
  remindersTriggered: number;
};

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export async function runDeadlineReminderJob(): Promise<DeadlineReminderRunResult> {
  const inactivityHours = readPositiveIntEnv("DEADLINE_REMINDER_INACTIVITY_HOURS", 48);
  const reminderWindowHours = readPositiveIntEnv("DEADLINE_REMINDER_WINDOW_HOURS", 48);
  const pushThresholdHours = readPositiveIntEnv("DEADLINE_REMINDER_PUSH_HOURS", 24);
  const emailThresholdHours = readPositiveIntEnv("DEADLINE_REMINDER_EMAIL_HOURS", 12);

  const now = new Date();
  const inactivityCutoff = new Date(now.getTime() - inactivityHours * 60 * 60 * 1000);
  const reminderWindowEnd = new Date(now.getTime() + reminderWindowHours * 60 * 60 * 1000);

  const tenants = await prisma.tenant.findMany({
    select: { id: true },
  });

  let scannedAssignments = 0;
  let remindersTriggered = 0;

  for (const tenant of tenants) {
    const db = tenantDb(tenant.id);
    const assignments = await db.taskAssignment.findMany({
      where: {
        task: {
          status: { not: "DONE" },
          deadline: {
            gt: now,
            lte: reminderWindowEnd,
          },
          updatedAt: { lte: inactivityCutoff },
        },
      },
      select: {
        membership: {
          select: { userId: true },
        },
        task: {
          select: {
            id: true,
            title: true,
            deadline: true,
            updatedAt: true,
            project: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    scannedAssignments += assignments.length;

    for (const assignment of assignments) {
      const deadline = assignment.task.deadline;
      if (!deadline) continue;

      const millisToDeadline = deadline.getTime() - now.getTime();
      if (millisToDeadline <= 0) continue;

      const hoursToDeadline = millisToDeadline / (60 * 60 * 1000);
      const push = hoursToDeadline < pushThresholdHours;
      const email = hoursToDeadline < emailThresholdHours;

      const sent = await notifyDeadlineSoon({
        tenantId: tenant.id,
        projectId: assignment.task.project.id,
        taskId: assignment.task.id,
        taskTitle: assignment.task.title,
        userId: assignment.membership.userId,
        projectName: assignment.task.project.name,
        deadline,
        channels: {
          inApp: true,
          push,
          email,
        },
        dedupeSince: assignment.task.updatedAt,
      });
      if (sent) {
        remindersTriggered += 1;
      }
    }
  }

  return {
    scannedTenants: tenants.length,
    scannedAssignments,
    remindersTriggered,
  };
}
