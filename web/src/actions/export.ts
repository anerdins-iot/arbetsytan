"use server";

import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { z } from "zod";
import { requireAuth, requireProject } from "@/lib/auth";
import { tenantDb } from "@/lib/db";
import {
  createPresignedDownloadUrl,
  ensureTenantBucket,
  exportObjectKey,
  putObjectToMinio,
} from "@/lib/minio";
import { buildProjectSummaryPdf } from "@/lib/reports/project-summary-pdf";

const idSchema = z
  .string()
  .trim()
  .min(1)
  .max(191)
  .regex(/^[A-Za-z0-9_-]+$/);
const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeReportOptionsSchema = z
  .object({
    fromDate: dateStringSchema.optional(),
    toDate: dateStringSchema.optional(),
    userId: idSchema.optional(),
  })
  .optional();

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

function toSafeFileNameSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function taskStatusLabel(status: string): string {
  switch (status) {
    case "TODO":
      return "Att gora";
    case "IN_PROGRESS":
      return "Pagaende";
    case "DONE":
      return "Klar";
    default:
      return status;
  }
}

function projectStatusLabel(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "Aktiv";
    case "PAUSED":
      return "Pausad";
    case "COMPLETED":
      return "Klar";
    case "ARCHIVED":
      return "Arkiverad";
    default:
      return status;
  }
}

function priorityLabel(priority: string): string {
  switch (priority) {
    case "LOW":
      return "Lag";
    case "MEDIUM":
      return "Medium";
    case "HIGH":
      return "Hog";
    case "URGENT":
      return "Bradskande";
    default:
      return priority;
  }
}

async function uploadExportAndGetUrl(params: {
  tenantId: string;
  projectId: string;
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
}): Promise<string> {
  const bucket = await ensureTenantBucket(params.tenantId);
  const key = exportObjectKey(params.projectId, params.fileName, randomUUID());
  await putObjectToMinio({
    bucket,
    key,
    body: params.bytes,
    contentType: params.contentType,
  });
  return createPresignedDownloadUrl({ bucket, key, expiresInSeconds: 60 * 30 });
}

export async function exportProjectSummaryPdf(
  projectId: string
): Promise<{ success: true; downloadUrl: string } | { success: false; error: string }> {
  const { tenantId, userId } = await requireAuth();
  const parsedProjectId = idSchema.safeParse(projectId);
  if (!parsedProjectId.success) {
    return { success: false, error: "VALIDATION_ERROR" };
  }

  try {
    const project = await requireProject(tenantId, parsedProjectId.data, userId);
    const db = tenantDb(tenantId);

    const [tasks, members, entries] = await Promise.all([
      db.task.findMany({
        where: { projectId: project.id },
        include: {
          assignments: {
            include: {
              membership: {
                include: {
                  user: {
                    select: { name: true, email: true },
                  },
                },
              },
            },
          },
        },
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      }),
      db.projectMember.findMany({
        where: { projectId: project.id },
        include: {
          membership: {
            include: {
              user: {
                select: { name: true, email: true },
              },
            },
          },
        },
      }),
      db.timeEntry.findMany({
        where: { projectId: project.id },
        orderBy: { date: "desc" },
      }),
    ]);

    const totalMinutes = entries.reduce((sum, entry) => sum + entry.minutes, 0);
    const minutesByUser = new Map<string, number>();
    for (const entry of entries) {
      minutesByUser.set(entry.userId, (minutesByUser.get(entry.userId) ?? 0) + entry.minutes);
    }

    const userIds = Array.from(minutesByUser.keys());
    const memberships = userIds.length
      ? await db.membership.findMany({
          where: { userId: { in: userIds } },
          include: {
            user: {
              select: { name: true, email: true },
            },
          },
        })
      : [];
    const userNameById = new Map<string, string>();
    for (const membership of memberships) {
      userNameById.set(membership.userId, membership.user.name ?? membership.user.email);
    }

    const taskRows = tasks.map((task) => {
      const assignedTo =
        task.assignments
          .map((assignment) => assignment.membership.user.name ?? assignment.membership.user.email)
          .join(", ") || "-";
      return {
        title: task.title,
        status: taskStatusLabel(task.status),
        assignedTo,
        deadline: task.deadline ? formatDate(task.deadline) : null,
      };
    });

    const memberRows = members.map(
      (member) => member.membership.user.name ?? member.membership.user.email
    );

    const personTotals = Array.from(minutesByUser.entries())
      .map(([entryUserId, minutes]) => ({
        name: userNameById.get(entryUserId) ?? entryUserId,
        minutes,
      }))
      .sort((a, b) => b.minutes - a.minutes);

    const pdfBytes = await buildProjectSummaryPdf({
      projectName: project.name,
      projectStatus: projectStatusLabel(project.status),
      description: project.description,
      tasks: taskRows,
      members: memberRows,
      totalMinutes,
      byPerson: personTotals,
    });

    const fileBase = toSafeFileNameSegment(project.name) || "project";
    const fileName = `project-summary-${fileBase}-${Date.now()}.pdf`;
    const downloadUrl = await uploadExportAndGetUrl({
      tenantId,
      projectId: project.id,
      fileName,
      contentType: "application/pdf",
      bytes: pdfBytes,
    });

    return { success: true, downloadUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : "EXPORT_PDF_FAILED";
    return { success: false, error: message };
  }
}

export async function exportTimeReportExcel(
  projectId: string,
  options?: { fromDate?: string; toDate?: string; userId?: string }
): Promise<{ success: true; downloadUrl: string } | { success: false; error: string }> {
  const { tenantId, userId } = await requireAuth();
  const parsedProjectId = idSchema.safeParse(projectId);
  const parsedOptions = timeReportOptionsSchema.safeParse(options);
  if (!parsedProjectId.success || !parsedOptions.success) {
    return { success: false, error: "VALIDATION_ERROR" };
  }

  try {
    const project = await requireProject(tenantId, parsedProjectId.data, userId);
    const db = tenantDb(tenantId);

    const where: {
      projectId: string;
      userId?: string;
      date?: { gte?: Date; lte?: Date };
    } = {
      projectId: project.id,
    };

    if (parsedOptions.data?.userId) {
      where.userId = parsedOptions.data.userId;
    }
    if (parsedOptions.data?.fromDate || parsedOptions.data?.toDate) {
      where.date = {};
      if (parsedOptions.data.fromDate) {
        where.date.gte = new Date(`${parsedOptions.data.fromDate}T00:00:00.000Z`);
      }
      if (parsedOptions.data.toDate) {
        where.date.lte = new Date(`${parsedOptions.data.toDate}T23:59:59.999Z`);
      }
    }

    const entries = await db.timeEntry.findMany({
      where,
      include: {
        task: { select: { title: true } },
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });

    const users = entries.length
      ? await db.membership.findMany({
          where: { userId: { in: Array.from(new Set(entries.map((entry) => entry.userId))) } },
          include: {
            user: {
              select: { name: true, email: true },
            },
          },
        })
      : [];
    const userNameById = new Map<string, string>();
    for (const membership of users) {
      userNameById.set(membership.userId, membership.user.name ?? membership.user.email);
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "ArbetsYtan";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("Tidrapport");

    sheet.columns = [
      { header: "Datum", key: "date", width: 14 },
      { header: "Uppgift", key: "task", width: 36 },
      { header: "Person", key: "person", width: 28 },
      { header: "Minuter", key: "minutes", width: 12 },
      { header: "Beskrivning", key: "description", width: 50 },
    ];

    for (const entry of entries) {
      sheet.addRow({
        date: formatDate(entry.date),
        task: entry.task?.title ?? "-",
        person: userNameById.get(entry.userId) ?? entry.userId,
        minutes: entry.minutes,
        description: entry.description ?? "",
      });
    }

    const totalMinutes = entries.reduce((sum, entry) => sum + entry.minutes, 0);
    sheet.addRow({});
    sheet.addRow({
      date: "",
      task: "",
      person: "Summa",
      minutes: totalMinutes,
      description: formatMinutes(totalMinutes),
    });

    const header = sheet.getRow(1);
    header.font = { bold: true };
    header.alignment = { vertical: "middle" };

    const fileBuffer = await workbook.xlsx.writeBuffer();
    const bytes = new Uint8Array(fileBuffer as ArrayBuffer);

    const fileBase = toSafeFileNameSegment(project.name) || "project";
    const fileName = `time-report-${fileBase}-${Date.now()}.xlsx`;
    const downloadUrl = await uploadExportAndGetUrl({
      tenantId,
      projectId: project.id,
      fileName,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes,
    });

    return { success: true, downloadUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : "EXPORT_TIME_REPORT_FAILED";
    return { success: false, error: message };
  }
}

export async function exportTaskListExcel(
  projectId: string
): Promise<{ success: true; downloadUrl: string } | { success: false; error: string }> {
  const { tenantId, userId } = await requireAuth();
  const parsedProjectId = idSchema.safeParse(projectId);
  if (!parsedProjectId.success) {
    return { success: false, error: "VALIDATION_ERROR" };
  }

  try {
    const project = await requireProject(tenantId, parsedProjectId.data, userId);
    const db = tenantDb(tenantId);
    const tasks = await db.task.findMany({
      where: { projectId: project.id },
      include: {
        assignments: {
          include: {
            membership: {
              include: {
                user: {
                  select: { name: true, email: true },
                },
              },
            },
          },
        },
        timeEntries: {
          select: { minutes: true },
        },
      },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "ArbetsYtan";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("Uppgifter");

    sheet.columns = [
      { header: "Titel", key: "title", width: 36 },
      { header: "Status", key: "status", width: 14 },
      { header: "Prioritet", key: "priority", width: 14 },
      { header: "Tilldelad", key: "assigned", width: 36 },
      { header: "Deadline", key: "deadline", width: 14 },
      { header: "Tid spenderad", key: "timeSpent", width: 18 },
    ];

    for (const task of tasks) {
      const assignees =
        task.assignments
          .map((assignment) => assignment.membership.user.name ?? assignment.membership.user.email)
          .join(", ") || "-";
      const spentMinutes = task.timeEntries.reduce((sum, entry) => sum + entry.minutes, 0);

      sheet.addRow({
        title: task.title,
        status: taskStatusLabel(task.status),
        priority: priorityLabel(task.priority),
        assigned: assignees,
        deadline: task.deadline ? formatDate(task.deadline) : "-",
        timeSpent: formatMinutes(spentMinutes),
      });
    }

    const header = sheet.getRow(1);
    header.font = { bold: true };
    header.alignment = { vertical: "middle" };

    const fileBuffer = await workbook.xlsx.writeBuffer();
    const bytes = new Uint8Array(fileBuffer as ArrayBuffer);

    const fileBase = toSafeFileNameSegment(project.name) || "project";
    const fileName = `task-list-${fileBase}-${Date.now()}.xlsx`;
    const downloadUrl = await uploadExportAndGetUrl({
      tenantId,
      projectId: project.id,
      fileName,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes,
    });

    return { success: true, downloadUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : "EXPORT_TASK_LIST_FAILED";
    return { success: false, error: message };
  }
}
