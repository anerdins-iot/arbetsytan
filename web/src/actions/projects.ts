"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { hasPermission, requireAuth, requirePermission, requireProject } from "@/lib/auth";
import { tenantDb, prisma } from "@/lib/db";
import { getProjectsCore, getProjectDetailCore } from "@/services/project-service";
import { logActivity } from "@/lib/activity-log";
import { notifyProjectStatusChanged } from "@/lib/notification-delivery";
import { publishDiscordEvent } from "@/lib/redis-pubsub";
import type { Project, ProjectStatus } from "../../generated/prisma/client";

const addProjectMemberSchema = z.object({
  projectId: z.string().min(1),
  membershipId: z.string().min(1),
});

const removeProjectMemberSchema = z.object({
  projectId: z.string().min(1),
  membershipId: z.string().min(1),
});

const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  address: z.string().max(500).optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  address: z.string().max(500).optional(),
  status: z.enum(["ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"]),
});

export type ProjectActionResult = {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  project?: Project;
};

export type ProjectWithCounts = {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  address: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    tasks: number;
  };
};

export type GetProjectsResult = {
  projects: ProjectWithCounts[];
};

/**
 * Get all projects for the current tenant that the user has access to.
 * Admins see all projects; others see only projects where they are members.
 */
export async function getProjects(options?: {
  search?: string;
  status?: ProjectStatus;
}): Promise<GetProjectsResult> {
  const { tenantId, userId } = await requireAuth();

  const projects = await getProjectsCore(
    { tenantId, userId },
    { search: options?.search, status: options?.status, includeTaskCount: true }
  );

  return {
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      status: p.status as ProjectStatus,
      address: p.address,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      _count: { tasks: p.taskCount },
    })),
  };
}

/**
 * Create a new project for the current tenant.
 */
export async function createProject(
  formData: FormData
): Promise<ProjectActionResult> {
  const { tenantId, userId } = await requirePermission("canCreateProject");

  const raw = {
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    address: formData.get("address") || undefined,
  };

  const result = createProjectSchema.safeParse(raw);
  if (!result.success) {
    return {
      success: false,
      fieldErrors: result.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const { name, description, address } = result.data;
  const db = tenantDb(tenantId, { actorUserId: userId });

  const project = await db.project.create({
    data: {
      name,
      description: description ?? null,
      address: address ?? null,
      tenantId,
    },
  });

  await logActivity(tenantId, project.id, userId, "created", "project", project.id, {
    name: project.name,
    status: project.status,
  });

  await publishDiscordEvent("discord:project-created", {
    projectId: project.id,
    tenantId,
    name: project.name,
  });

  revalidatePath("/[locale]/projects", "page");

  return { success: true, project };
}

// ─────────────────────────────────────────
// Project detail types
// ─────────────────────────────────────────

export type TaskStatusCounts = {
  TODO: number;
  IN_PROGRESS: number;
  DONE: number;
};

export type ProjectMember = {
  id: string;
  role: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
};

export type ProjectDetail = {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  address: string | null;
  createdAt: Date;
  updatedAt: Date;
  taskStatusCounts: TaskStatusCounts;
  members: ProjectMember[];
  availableMembers: ProjectMember[];
  canManageTeam: boolean;
};

export type GetProjectResult =
  | { success: true; project: ProjectDetail }
  | { success: false; error: string };

/**
 * Get a single project with task counts by status and team members.
 * Requires auth + project access check.
 */
export async function getProject(
  projectId: string
): Promise<GetProjectResult> {
  const { tenantId, userId } = await requireAuth();
  await requireProject(tenantId, projectId, userId);

  const detail = await getProjectDetailCore({ tenantId, userId }, projectId);
  if (!detail) return { success: false, error: "PROJECT_NOT_FOUND" };

  const canManageTeam = await hasPermission(userId, tenantId, "canManageTeam");

  return {
    success: true,
    project: {
      id: detail.id,
      name: detail.name,
      description: detail.description,
      status: detail.status as ProjectStatus,
      address: detail.address,
      createdAt: detail.createdAt,
      updatedAt: detail.updatedAt,
      taskStatusCounts: detail.taskStatusCounts,
      members: detail.members.map((m) => ({
        id: m.membershipId,
        role: m.role,
        user: m.user,
      })),
      availableMembers: detail.availableMembers.map((m) => ({
        id: m.membershipId,
        role: m.role,
        user: m.user,
      })),
      canManageTeam,
    },
  };
}

/**
 * Update project info (name, description, address, status).
 * Requires auth + project access check.
 */
export async function updateProject(
  projectId: string,
  formData: FormData
): Promise<ProjectActionResult> {
  const { tenantId, userId } = await requirePermission("canUpdateProject");
  const currentProject = await requireProject(tenantId, projectId, userId);

  const raw = {
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    address: formData.get("address") || undefined,
    status: formData.get("status"),
  };

  const result = updateProjectSchema.safeParse(raw);
  if (!result.success) {
    return {
      success: false,
      fieldErrors: result.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const { name, description, address, status } = result.data;
  const db = tenantDb(tenantId, { actorUserId: userId, projectId });

  const project = await db.project.update({
    where: { id: projectId },
    data: {
      name,
      description: description ?? null,
      address: address ?? null,
      status: status as ProjectStatus,
    },
  });

  const action: "updated" | "statusChanged" =
    currentProject.status !== status ? "statusChanged" : "updated";

  await logActivity(tenantId, projectId, userId, action, "project", projectId, {
    name,
    previousStatus: currentProject.status,
    newStatus: status,
  });

  if (action === "statusChanged") {
    const members = await db.projectMember.findMany({
      where: { projectId },
      include: {
        membership: {
          select: {
            userId: true,
          },
        },
      },
    });

    const recipientUserIds = members
      .map((member) => member.membership.userId)
      .filter((memberUserId) => memberUserId !== userId);
    await Promise.all(
      recipientUserIds.map((recipientUserId) =>
        notifyProjectStatusChanged({
          tenantId,
          projectId,
          recipientUserId,
          projectName: name,
          previousStatus: currentProject.status,
          newStatus: status,
        })
      )
    );
  }

  revalidatePath("/[locale]/projects/[projectId]", "page");
  revalidatePath("/[locale]/projects", "page");

  return { success: true, project };
}

/**
 * Archive a project by setting its status to ARCHIVED.
 * Requires auth + canUpdateProject permission.
 */
export async function archiveProject(
  projectId: string
): Promise<ProjectActionResult> {
  const { tenantId, userId } = await requirePermission("canUpdateProject");
  const currentProject = await requireProject(tenantId, projectId, userId);

  if (currentProject.status === "ARCHIVED") {
    return { success: false, error: "ALREADY_ARCHIVED" };
  }

  const db = tenantDb(tenantId, { actorUserId: userId, projectId });
  const project = await db.project.update({
    where: { id: projectId },
    data: { status: "ARCHIVED" },
  });

  await publishDiscordEvent("discord:project-archived", {
    projectId,
    tenantId,
    channelId: project.discordChannelId ?? null,
  });

  await logActivity(tenantId, projectId, userId, "statusChanged", "project", projectId, {
    name: project.name,
    previousStatus: currentProject.status,
    newStatus: "ARCHIVED",
  });

  const members = await db.projectMember.findMany({
    where: { projectId },
    include: {
      membership: {
        select: {
          userId: true,
        },
      },
    },
  });

  const recipientUserIds = members
    .map((member) => member.membership.userId)
    .filter((memberUserId) => memberUserId !== userId);

  await Promise.all(
    recipientUserIds.map((recipientUserId) =>
      notifyProjectStatusChanged({
        tenantId,
        projectId,
        recipientUserId,
        projectName: project.name,
        previousStatus: currentProject.status,
        newStatus: "ARCHIVED",
      })
    )
  );

  revalidatePath("/[locale]/projects/[projectId]", "page");
  revalidatePath("/[locale]/projects", "page");

  return { success: true, project };
}

/**
 * Add a tenant member to the project. Only Admin or Project Manager.
 */
export async function addProjectMember(
  projectId: string,
  membershipId: string
): Promise<ProjectActionResult> {
  const { tenantId, userId } = await requirePermission("canManageTeam");
  await requireProject(tenantId, projectId, userId);
  const parsed = addProjectMemberSchema.safeParse({ projectId, membershipId });
  if (!parsed.success) {
    return { success: false, error: "VALIDATION_ERROR" };
  }
  const db = tenantDb(tenantId);
  const membership = await db.membership.findFirst({
    where: { id: membershipId },
  });
  if (!membership) {
    return { success: false, error: "MEMBER_NOT_FOUND" };
  }
  const existing = await db.projectMember.findFirst({
    where: { projectId, membershipId },
  });
  if (existing) {
    return { success: false, error: "ALREADY_MEMBER" };
  }
  const projectDb = tenantDb(tenantId, { actorUserId: userId, projectId });
  await projectDb.projectMember.create({
    data: { projectId, membershipId },
  });
  await logActivity(tenantId, projectId, userId, "added", "member", membershipId, {
    membershipId,
    memberUserId: membership.userId,
  });
  const discordAccount = await prisma.account.findFirst({
    where: { userId: membership.userId, provider: "discord" },
    select: { providerAccountId: true },
  });
  if (discordAccount) {
    await publishDiscordEvent("discord:project-member-added", {
      projectId,
      userId: membership.userId,
      discordUserId: discordAccount.providerAccountId,
      tenantId,
    });
  }
  revalidatePath("/[locale]/projects/[projectId]", "page");
  return { success: true };
}

/**
 * Remove a member from the project. Only Admin or Project Manager.
 */
export async function removeProjectMember(
  projectId: string,
  membershipId: string
): Promise<ProjectActionResult> {
  const { tenantId, userId } = await requirePermission("canManageTeam");
  await requireProject(tenantId, projectId, userId);
  const parsed = removeProjectMemberSchema.safeParse({ projectId, membershipId });
  if (!parsed.success) {
    return { success: false, error: "VALIDATION_ERROR" };
  }
  const projectDb = tenantDb(tenantId, { actorUserId: userId, projectId });
  const membership = await projectDb.membership.findFirst({
    where: { id: membershipId },
  });

  let discordUserId: string | null = null;
  if (membership?.userId) {
    const discordAccount = await prisma.account.findFirst({
      where: { userId: membership.userId, provider: "discord" },
      select: { providerAccountId: true },
    });
    discordUserId = discordAccount?.providerAccountId ?? null;
  }

  await projectDb.projectMember.delete({
    where: { projectId_membershipId: { projectId, membershipId } },
  });
  await logActivity(tenantId, projectId, userId, "removed", "member", membershipId, {
    membershipId,
    memberUserId: membership?.userId ?? null,
  });
  if (discordUserId) {
    await publishDiscordEvent("discord:project-member-removed", {
      projectId,
      userId: membership!.userId,
      discordUserId,
      tenantId,
    });
  }
  revalidatePath("/[locale]/projects/[projectId]", "page");
  return { success: true };
}
