"use server";

import { z } from "zod";
import type { Role } from "../../generated/prisma/client";
import { requireAuth, requireRole } from "@/lib/auth";
import { tenantDb } from "@/lib/db";

const updateTenantSchema = z.object({
  name: z.string().trim().min(2).max(120),
  orgNumber: z.string().trim().max(50).optional(),
  address: z.string().trim().max(500).optional(),
});

const updateMembershipRoleSchema = z.object({
  membershipId: z.string().min(1),
  role: z.enum(["ADMIN", "PROJECT_MANAGER", "WORKER"]),
});

const removeMembershipSchema = z.object({
  membershipId: z.string().min(1),
});

export type SettingsActionResult = {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export type TenantSettings = {
  id: string;
  name: string;
  orgNumber: string | null;
  address: string | null;
};

export type TenantMember = {
  membershipId: string;
  userId: string;
  role: Role;
  name: string | null;
  email: string;
};

export async function getTenantSettings(): Promise<TenantSettings> {
  const { tenantId } = await requireRole(["ADMIN"]);
  const db = tenantDb(tenantId);

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      orgNumber: true,
      address: true,
    },
  });

  if (!tenant) {
    throw new Error("TENANT_NOT_FOUND");
  }

  return tenant;
}

export async function updateTenant(
  formData: FormData
): Promise<SettingsActionResult> {
  const { tenantId } = await requireRole(["ADMIN"]);
  const db = tenantDb(tenantId);

  const result = updateTenantSchema.safeParse({
    name: formData.get("name"),
    orgNumber: formData.get("orgNumber") ?? undefined,
    address: formData.get("address") ?? undefined,
  });

  if (!result.success) {
    return {
      success: false,
      error: "INVALID_INPUT",
      fieldErrors: result.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const orgNumber = result.data.orgNumber?.trim() || null;
  const address = result.data.address?.trim() || null;

  await db.tenant.update({
    where: { id: tenantId },
    data: {
      name: result.data.name,
      orgNumber,
      address,
    },
  });

  return { success: true };
}

export async function getTenantMembers(): Promise<TenantMember[]> {
  const { tenantId } = await requireRole(["ADMIN"]);
  const db = tenantDb(tenantId);

  const memberships = await db.membership.findMany({
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  return memberships.map((membership) => ({
    membershipId: membership.id,
    userId: membership.userId,
    role: membership.role,
    name: membership.user.name,
    email: membership.user.email,
  }));
}

export async function updateMembershipRole(
  formData: FormData
): Promise<SettingsActionResult> {
  const { tenantId } = await requireRole(["ADMIN"]);
  const db = tenantDb(tenantId);

  const result = updateMembershipRoleSchema.safeParse({
    membershipId: formData.get("membershipId"),
    role: formData.get("role"),
  });

  if (!result.success) {
    return { success: false, error: "INVALID_INPUT" };
  }

  const membership = await db.membership.findUnique({
    where: { id: result.data.membershipId },
    select: {
      id: true,
      role: true,
    },
  });

  if (!membership) {
    return { success: false, error: "NOT_FOUND" };
  }

  if (membership.role === "ADMIN" && result.data.role !== "ADMIN") {
    const adminCount = await db.membership.count({
      where: { role: "ADMIN" },
    });

    if (adminCount <= 1) {
      return { success: false, error: "LAST_ADMIN" };
    }
  }

  await db.membership.update({
    where: { id: membership.id },
    data: { role: result.data.role },
  });

  return { success: true };
}

export async function removeMembership(
  formData: FormData
): Promise<SettingsActionResult> {
  const { tenantId, userId } = await requireRole(["ADMIN"]);
  const db = tenantDb(tenantId);

  const result = removeMembershipSchema.safeParse({
    membershipId: formData.get("membershipId"),
  });

  if (!result.success) {
    return { success: false, error: "INVALID_INPUT" };
  }

  const membership = await db.membership.findUnique({
    where: { id: result.data.membershipId },
    select: {
      id: true,
      userId: true,
      role: true,
    },
  });

  if (!membership) {
    return { success: false, error: "NOT_FOUND" };
  }

  if (membership.userId === userId) {
    return { success: false, error: "CANNOT_REMOVE_SELF" };
  }

  if (membership.role === "ADMIN") {
    const adminCount = await db.membership.count({
      where: { role: "ADMIN" },
    });

    if (adminCount <= 1) {
      return { success: false, error: "LAST_ADMIN" };
    }
  }

  await db.membership.delete({
    where: { id: membership.id },
  });

  return { success: true };
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  const { role } = await requireAuth();
  return role === "ADMIN";
}
