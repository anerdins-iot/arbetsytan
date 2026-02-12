"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAuth, requireProject } from "@/lib/auth";
import { tenantDb } from "@/lib/db";
import type { AutomationStatus } from "../../generated/prisma/client";

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

export type AutomationLogItem = {
  id: string;
  status: string;
  result: unknown;
  errorMessage: string | null;
  executedAt: string;
  durationMs: number | null;
};

export type AutomationItem = {
  id: string;
  name: string;
  description: string | null;
  triggerAt: string;
  recurrence: string | null;
  timezone: string;
  actionTool: string;
  actionParams: unknown;
  status: string;
  projectId: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
  logs?: AutomationLogItem[];
};

// ─────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────

const createAutomationSchema = z.object({
  name: z.string().min(1, "Namn krävs").max(200),
  description: z.string().max(1000).optional(),
  triggerAt: z.coerce.date(),
  recurrence: z.string().max(100).optional(),
  timezone: z.string().max(50).optional().default("Europe/Stockholm"),
  actionTool: z.string().min(1, "Verktyg krävs").max(100),
  actionParams: z.record(z.string(), z.unknown()),
  projectId: z.string().min(1).optional(),
});

const updateAutomationSchema = z.object({
  automationId: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  triggerAt: z.coerce.date().optional(),
  recurrence: z.string().max(100).optional().nullable(),
  timezone: z.string().max(50).optional(),
  actionTool: z.string().min(1).max(100).optional(),
  actionParams: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(["PENDING", "ACTIVE", "PAUSED", "COMPLETED", "FAILED", "CANCELLED"]).optional(),
});

const listAutomationsSchema = z.object({
  projectId: z.string().min(1).optional(),
});

const getAutomationSchema = z.object({
  automationId: z.string().min(1),
});

const deleteAutomationSchema = z.object({
  automationId: z.string().min(1),
});

const pauseAutomationSchema = z.object({
  automationId: z.string().min(1),
});

const resumeAutomationSchema = z.object({
  automationId: z.string().min(1),
});

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

const LOGS_INCLUDE = {
  logs: {
    orderBy: { executedAt: "desc" as const },
    take: 5,
  },
} as const;

const LOGS_FULL_INCLUDE = {
  logs: {
    orderBy: { executedAt: "desc" as const },
  },
} as const;

function formatLog(log: {
  id: string;
  status: string;
  result: unknown;
  errorMessage: string | null;
  executedAt: Date;
  durationMs: number | null;
}): AutomationLogItem {
  return {
    id: log.id,
    status: log.status,
    result: log.result,
    errorMessage: log.errorMessage,
    executedAt: log.executedAt.toISOString(),
    durationMs: log.durationMs,
  };
}

function formatAutomation(
  a: {
    id: string;
    name: string;
    description: string | null;
    triggerAt: Date;
    recurrence: string | null;
    timezone: string;
    actionTool: string;
    actionParams: unknown;
    status: string;
    projectId: string | null;
    lastRunAt: Date | null;
    nextRunAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    logs?: Array<{
      id: string;
      status: string;
      result: unknown;
      errorMessage: string | null;
      executedAt: Date;
      durationMs: number | null;
    }>;
  }
): AutomationItem {
  return {
    id: a.id,
    name: a.name,
    description: a.description,
    triggerAt: a.triggerAt.toISOString(),
    recurrence: a.recurrence,
    timezone: a.timezone,
    actionTool: a.actionTool,
    actionParams: a.actionParams,
    status: a.status,
    projectId: a.projectId,
    lastRunAt: a.lastRunAt?.toISOString() ?? null,
    nextRunAt: a.nextRunAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    ...(a.logs && { logs: a.logs.map(formatLog) }),
  };
}

// ─────────────────────────────────────────
// Actions
// ─────────────────────────────────────────

export async function createAutomation(data: {
  name: string;
  description?: string;
  triggerAt: Date | string;
  recurrence?: string;
  timezone?: string;
  actionTool: string;
  actionParams: Record<string, unknown>;
  projectId?: string;
}): Promise<{ success: true; automation: AutomationItem } | { success: false; error: string }> {
  try {
    const { userId, tenantId } = await requireAuth();
    const parsed = createAutomationSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: "Ogiltiga data." };
    }

    if (parsed.data.projectId) {
      await requireProject(tenantId, parsed.data.projectId, userId);
    }

    const db = tenantDb(tenantId);
    const triggerAt = parsed.data.triggerAt instanceof Date ? parsed.data.triggerAt : new Date(parsed.data.triggerAt);

    const automation = await db.automation.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        triggerAt,
        recurrence: parsed.data.recurrence ?? null,
        timezone: parsed.data.timezone ?? "Europe/Stockholm",
        actionTool: parsed.data.actionTool,
        actionParams: parsed.data.actionParams as object,
        projectId: parsed.data.projectId ?? null,
        userId,
        tenantId,
        nextRunAt: triggerAt,
      },
      include: LOGS_INCLUDE,
    });

    revalidatePath("/[locale]/dashboard", "page");
    if (parsed.data.projectId) {
      revalidatePath(`/[locale]/projects/${parsed.data.projectId}`, "page");
    }
    return { success: true, automation: formatAutomation(automation) };
  } catch {
    return { success: false, error: "Kunde inte skapa automation." };
  }
}

export async function listAutomations(options?: {
  projectId?: string;
}): Promise<{ success: true; automations: AutomationItem[] } | { success: false; error: string }> {
  try {
    const { userId, tenantId } = await requireAuth();
    const parsed = listAutomationsSchema.safeParse(options ?? {});
    if (!parsed.success) {
      return { success: false, error: "Ogiltiga filter." };
    }

    if (parsed.data.projectId) {
      await requireProject(tenantId, parsed.data.projectId, userId);
    }

    const db = tenantDb(tenantId);
    const where: { userId: string; projectId?: string } = { userId };
    if (parsed.data.projectId) {
      where.projectId = parsed.data.projectId;
    }

    const automations = await db.automation.findMany({
      where,
      include: LOGS_INCLUDE,
      orderBy: [{ triggerAt: "asc" }],
    });

    return { success: true, automations: automations.map(formatAutomation) };
  } catch {
    return { success: false, error: "Kunde inte hämta automationer." };
  }
}

export async function getAutomation(
  automationId: string
): Promise<{ success: true; automation: AutomationItem } | { success: false; error: string }> {
  try {
    const { userId, tenantId } = await requireAuth();
    const parsed = getAutomationSchema.safeParse({ automationId });
    if (!parsed.success) {
      return { success: false, error: "Ogiltigt id." };
    }

    const db = tenantDb(tenantId);
    const automation = await db.automation.findFirst({
      where: { id: parsed.data.automationId, userId },
      include: LOGS_FULL_INCLUDE,
    });

    if (!automation) {
      return { success: false, error: "Automationen hittades inte." };
    }

    return { success: true, automation: formatAutomation(automation) };
  } catch {
    return { success: false, error: "Kunde inte hämta automation." };
  }
}

export async function updateAutomation(
  automationId: string,
  data: {
    name?: string;
    description?: string | null;
    triggerAt?: Date | string;
    recurrence?: string | null;
    timezone?: string;
    actionTool?: string;
    actionParams?: Record<string, unknown>;
    status?: AutomationStatus;
  }
): Promise<{ success: true; automation: AutomationItem } | { success: false; error: string }> {
  try {
    const { userId, tenantId } = await requireAuth();
    const parsed = updateAutomationSchema.safeParse({ automationId, ...data });
    if (!parsed.success) {
      return { success: false, error: "Ogiltiga data." };
    }

    const db = tenantDb(tenantId);
    const existing = await db.automation.findFirst({
      where: { id: parsed.data.automationId, userId },
    });
    if (!existing) {
      return { success: false, error: "Automationen hittades inte." };
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
    if (parsed.data.triggerAt !== undefined) {
      updateData.triggerAt = parsed.data.triggerAt instanceof Date ? parsed.data.triggerAt : new Date(parsed.data.triggerAt);
    }
    if (parsed.data.recurrence !== undefined) updateData.recurrence = parsed.data.recurrence;
    if (parsed.data.timezone !== undefined) updateData.timezone = parsed.data.timezone;
    if (parsed.data.actionTool !== undefined) updateData.actionTool = parsed.data.actionTool;
    if (parsed.data.actionParams !== undefined) updateData.actionParams = parsed.data.actionParams;
    if (parsed.data.status !== undefined) updateData.status = parsed.data.status;

    const automation = await db.automation.update({
      where: { id: parsed.data.automationId },
      data: updateData,
      include: LOGS_INCLUDE,
    });

    revalidatePath("/[locale]/dashboard", "page");
    if (existing.projectId) {
      revalidatePath(`/[locale]/projects/${existing.projectId}`, "page");
    }
    return { success: true, automation: formatAutomation(automation) };
  } catch {
    return { success: false, error: "Kunde inte uppdatera automation." };
  }
}

export async function deleteAutomation(
  automationId: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { userId, tenantId } = await requireAuth();
    const parsed = deleteAutomationSchema.safeParse({ automationId });
    if (!parsed.success) {
      return { success: false, error: "Ogiltigt id." };
    }

    const db = tenantDb(tenantId);
    const existing = await db.automation.findFirst({
      where: { id: parsed.data.automationId, userId },
    });
    if (!existing) {
      return { success: false, error: "Automationen hittades inte." };
    }

    await db.automation.delete({ where: { id: parsed.data.automationId } });

    revalidatePath("/[locale]/dashboard", "page");
    if (existing.projectId) {
      revalidatePath(`/[locale]/projects/${existing.projectId}`, "page");
    }
    return { success: true };
  } catch {
    return { success: false, error: "Kunde inte ta bort automation." };
  }
}

export async function pauseAutomation(
  automationId: string
): Promise<{ success: true; automation: AutomationItem } | { success: false; error: string }> {
  try {
    const { userId, tenantId } = await requireAuth();
    const parsed = pauseAutomationSchema.safeParse({ automationId });
    if (!parsed.success) {
      return { success: false, error: "Ogiltigt id." };
    }

    const db = tenantDb(tenantId);
    const existing = await db.automation.findFirst({
      where: { id: parsed.data.automationId, userId },
    });
    if (!existing) {
      return { success: false, error: "Automationen hittades inte." };
    }

    const automation = await db.automation.update({
      where: { id: parsed.data.automationId },
      data: { status: "PAUSED" as const },
      include: LOGS_INCLUDE,
    });

    revalidatePath("/[locale]/dashboard", "page");
    if (existing.projectId) {
      revalidatePath(`/[locale]/projects/${existing.projectId}`, "page");
    }
    return { success: true, automation: formatAutomation(automation) };
  } catch {
    return { success: false, error: "Kunde inte pausa automation." };
  }
}

export async function resumeAutomation(
  automationId: string
): Promise<{ success: true; automation: AutomationItem } | { success: false; error: string }> {
  try {
    const { userId, tenantId } = await requireAuth();
    const parsed = resumeAutomationSchema.safeParse({ automationId });
    if (!parsed.success) {
      return { success: false, error: "Ogiltigt id." };
    }

    const db = tenantDb(tenantId);
    const existing = await db.automation.findFirst({
      where: { id: parsed.data.automationId, userId },
    });
    if (!existing) {
      return { success: false, error: "Automationen hittades inte." };
    }

    const newStatus: AutomationStatus = existing.recurrence ? "ACTIVE" : "PENDING";

    const automation = await db.automation.update({
      where: { id: parsed.data.automationId },
      data: { status: newStatus },
      include: LOGS_INCLUDE,
    });

    revalidatePath("/[locale]/dashboard", "page");
    if (existing.projectId) {
      revalidatePath(`/[locale]/projects/${existing.projectId}`, "page");
    }
    return { success: true, automation: formatAutomation(automation) };
  } catch {
    return { success: false, error: "Kunde inte återuppta automation." };
  }
}
