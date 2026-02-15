import type { Role } from "../../generated/prisma/client";

export const PERMISSIONS = [
  "canManageTenantSettings",
  "canManageTeam",
  "canChangeUserRoles",
  "canRemoveUsers",
  "canManageRolePermissions",
  "canInviteUsers",
  "canSendEmails",
  "canCreateProject",
  "canUpdateProject",
  "canDeleteProject",
  "canUploadFiles",
  "canDeleteFiles",
  "canCreateTasks",
  "canUpdateTasks",
  "canDeleteTasks",
  "canAssignTasks",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type PermissionMap = Record<Permission, boolean>;

type PermissionOverrides = Partial<PermissionMap>;

const ALL_TRUE_PERMISSIONS: PermissionMap = PERMISSIONS.reduce(
  (acc, permission) => {
    acc[permission] = true;
    return acc;
  },
  {} as PermissionMap
);

export const DEFAULT_ROLE_PERMISSIONS: Record<Role, PermissionMap> = {
  ADMIN: { ...ALL_TRUE_PERMISSIONS },
  PROJECT_MANAGER: {
    canManageTenantSettings: false,
    canManageTeam: true,
    canChangeUserRoles: false,
    canRemoveUsers: false,
    canManageRolePermissions: false,
    canInviteUsers: true,
    canSendEmails: true,
    canCreateProject: true,
    canUpdateProject: true,
    canDeleteProject: false,
    canUploadFiles: true,
    canDeleteFiles: true,
    canCreateTasks: true,
    canUpdateTasks: true,
    canDeleteTasks: true,
    canAssignTasks: true,
  },
  WORKER: {
    canManageTenantSettings: false,
    canManageTeam: false,
    canChangeUserRoles: false,
    canRemoveUsers: false,
    canManageRolePermissions: false,
    canInviteUsers: false,
    canSendEmails: true,
    canCreateProject: false,
    canUpdateProject: false,
    canDeleteProject: false,
    canUploadFiles: true,
    canDeleteFiles: false,
    canCreateTasks: true,
    canUpdateTasks: true,
    canDeleteTasks: false,
    canAssignTasks: false,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parsePermissionOverrides(value: unknown): PermissionOverrides {
  if (!isRecord(value)) {
    return {};
  }

  const parsed: PermissionOverrides = {};
  for (const permission of PERMISSIONS) {
    const candidate = value[permission];
    if (typeof candidate === "boolean") {
      parsed[permission] = candidate;
    }
  }

  return parsed;
}

export function resolvePermissions(
  role: Role,
  overrides?: PermissionOverrides
): PermissionMap {
  const base = DEFAULT_ROLE_PERMISSIONS[role];
  if (role === "ADMIN") {
    return { ...ALL_TRUE_PERMISSIONS };
  }
  return {
    ...base,
    ...(overrides ?? {}),
  };
}
