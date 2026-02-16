/**
 * Full Auth.js config: PrismaAdapter, Credentials, JWT/session callbacks.
 * Session: JWT in cookie for web. Mobile: access 15 min, refresh 30 days (same secret).
 */
import { redirect } from "next/navigation";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcrypt";
import { authConfig } from "./auth.config";
import { prisma, tenantDb } from "./db";
import type { Role } from "../../generated/prisma/client";
import {
  type Permission,
  type PermissionMap,
  parsePermissionOverrides,
  resolvePermissions,
} from "./permissions";
import { logger } from "./logger";

export type SessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
};

export type GetSessionResult = {
  user: SessionUser;
  tenantId: string;
  role: string;
} | null;

/** Returns current session with user, tenantId and role, or null if not authenticated. */
export async function getSession(): Promise<GetSessionResult> {
  const session = await auth();
  if (!session?.user?.id || !session.tenantId || !session.role) return null;
  return {
    user: {
      id: session.user.id,
      email: session.user.email ?? null,
      name: session.user.name ?? null,
      image: session.user.image ?? null,
    },
    tenantId: session.tenantId,
    role: session.role,
  };
}

export type RequireAuthResult = {
  userId: string;
  tenantId: string;
  role: string;
  user: SessionUser;
};

/**
 * Use in Server Actions. Ensures session exists and returns verified userId and tenantId.
 * Redirects to login if not authenticated.
 */
export async function requireAuth(): Promise<RequireAuthResult> {
  const session = await getSession();
  if (!session) redirect("/sv/login");
  return {
    userId: session.user.id,
    tenantId: session.tenantId,
    role: session.role,
    user: session.user,
  };
}

/**
 * Use in Server Actions when a specific role is required.
 * Redirects to login if not authenticated, or throws if role is insufficient.
 */
export async function requireRole(
  allowedRoles: Role | Role[]
): Promise<RequireAuthResult> {
  const authResult = await requireAuth();
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  if (!roles.includes(authResult.role as Role)) {
    throw new Error("FORBIDDEN");
  }
  return authResult;
}

export async function hasPermission(
  userId: string,
  tenantId: string,
  permission: Permission
): Promise<boolean> {
  const resolved = await getPermissions(userId, tenantId);
  return resolved ? resolved[permission] : false;
}

/**
 * Returns the full permission map for a user in a tenant, or null if no membership.
 * Use for server components / actions that need to pass permissions to UI.
 */
export async function getPermissions(
  userId: string,
  tenantId: string
): Promise<PermissionMap | null> {
  const db = tenantDb(tenantId);
  const membership = await db.membership.findFirst({
    where: { userId },
    select: {
      role: true,
      permissions: true,
    },
  });

  if (!membership) {
    return null;
  }

  return resolvePermissions(
    membership.role as import("../../generated/prisma/client").Role,
    parsePermissionOverrides(membership.permissions)
  );
}

/**
 * Returns the current session user's permission map. Redirects to login if not authenticated.
 * Use in server components (e.g. project page) to pass permissions to client components.
 */
export async function getMyPermissions(): Promise<PermissionMap> {
  const authResult = await requireAuth();
  const map = await getPermissions(authResult.userId, authResult.tenantId);
  if (!map) {
    throw new Error("FORBIDDEN");
  }
  return map;
}

export async function requirePermission(
  permissions: Permission | Permission[]
): Promise<RequireAuthResult> {
  const authResult = await requireAuth();
  const required = Array.isArray(permissions) ? permissions : [permissions];

  for (const permission of required) {
    const allowed = await hasPermission(
      authResult.userId,
      authResult.tenantId,
      permission
    );
    if (!allowed) {
      throw new Error("FORBIDDEN");
    }
  }

  return authResult;
}

export type ProjectWithTenant = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  address: string | null;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Verifies that the project belongs to the tenant and that the user has access.
 * Access requires either:
 * 1. Being an explicit ProjectMember of the project, OR
 * 2. Having Admin role in the tenant
 * Returns the project or throws.
 */
export async function requireProject(
  tenantId: string,
  projectId: string,
  userId: string
): Promise<ProjectWithTenant> {
  const db = tenantDb(tenantId);
  const project = await db.project.findUnique({
    where: { id: projectId },
  });
  if (!project) {
    throw new Error("PROJECT_NOT_FOUND");
  }

  // Get user's tenant membership to check role
  const membership = await db.membership.findFirst({
    where: { userId },
    select: { id: true, role: true },
  });
  if (!membership) {
    throw new Error("FORBIDDEN");
  }

  // Admins can access all projects in tenant
  if (membership.role === "ADMIN") {
    return {
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.status,
      address: project.address,
      tenantId: project.tenantId,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }

  // Non-admins must be explicit ProjectMember
  const projectMember = await db.projectMember.findFirst({
    where: {
      projectId,
      membershipId: membership.id,
    },
  });
  if (!projectMember) {
    throw new Error("FORBIDDEN");
  }

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status,
    address: project.address,
    tenantId: project.tenantId,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

/** Mobile JWT: access 15 min, refresh 30 days. Signed with AUTH_SECRET. */
export const MOBILE_ACCESS_TOKEN_MAX_AGE = 15 * 60; // 15 min
export const MOBILE_REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = String(credentials.email).trim().toLowerCase();
        const password = String(credentials.password);

        const user = await prisma.user.findUnique({
          where: { email },
          include: {
            memberships: { take: 1, orderBy: { createdAt: "asc" } },
          },
        });
        if (!user?.password) return null;

        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return null;

        const membership = user.memberships[0];
        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
          image: user.image ?? undefined,
          tenantId: membership?.tenantId ?? undefined,
          role: membership?.role ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.tenantId = (user as { tenantId?: string }).tenantId;
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
  },
  events: {
    signIn: async ({ user }) => {
      logger.info("User signed in", { userId: user.id, email: user.email });
    },
    signOut: async () => {
      logger.info("User signed out");
    },
    createUser: async ({ user }) => {
      logger.info("User created", { userId: user.id, email: user.email });
    },
  },
});
