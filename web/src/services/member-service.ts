import { tenantDb } from "@/lib/db";
import type { ServiceContext } from "./types";

export type ProjectMemberItem = {
  membershipId: string;
  role: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
};

/**
 * Hamta alla medlemmar i ett projekt.
 */
export async function getProjectMembersCore(
  ctx: ServiceContext,
  projectId: string
): Promise<ProjectMemberItem[]> {
  const db = tenantDb(ctx.tenantId);

  const rows = await db.projectMember.findMany({
    where: { projectId },
    include: {
      membership: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
      },
    },
  });

  return rows.map((pm) => ({
    membershipId: pm.membership.id,
    role: pm.membership.role,
    user: pm.membership.user,
  }));
}

/**
 * Hamta tillgangliga medlemmar i företaget (tenant) som inte ar med i projektet.
 */
export async function getAvailableMembersCore(
  ctx: ServiceContext,
  projectId: string
): Promise<ProjectMemberItem[]> {
  const db = tenantDb(ctx.tenantId);

  // Hamta alla medlemmar i tenanten
  const allMemberships = await db.membership.findMany({
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  });

  // Hamta befintliga projektmedlemmar
  const existingMembers = await db.projectMember.findMany({
    where: { projectId },
    select: { membershipId: true },
  });
  const existingIds = new Set(existingMembers.map((m) => m.membershipId));

  // Filtrera ut de som redan ar med i projektet
  return allMemberships
    .filter((m) => !existingIds.has(m.id))
    .map((m) => ({
      membershipId: m.id,
      role: m.role,
      user: m.user,
    }));
}
