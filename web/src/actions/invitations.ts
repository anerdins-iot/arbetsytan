"use server";

import crypto from "node:crypto";
import { z } from "zod";
import bcrypt from "bcrypt";
import { requirePermission, requireAuth, getSession } from "@/lib/auth";
import { tenantDb, prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { getAppBaseUrl, renderEmailTemplate } from "@/lib/email-templates";
import { signIn } from "@/lib/auth";
import { updateSubscriptionQuantity } from "@/actions/subscription";
import { computeEmailSlugForUser } from "@/lib/email-tracking";
import { getSocketServer } from "@/lib/socket";
import { SOCKET_EVENTS, tenantRoom } from "@/lib/socket-events";
import type { Role, InvitationStatus } from "../../generated/prisma/client";

// ─── Schemas ───────────────────────────────────────────

const inviteSchema = z.object({
  email: z.string().email().max(255),
  role: z.enum(["ADMIN", "PROJECT_MANAGER", "WORKER"]),
});

const cancelInvitationSchema = z.object({
  invitationId: z.string().min(1),
});

const acceptInvitationSchema = z.object({
  token: z.string().min(1),
});

const acceptWithRegistrationSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(2).max(100),
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
});

// ─── Types ─────────────────────────────────────────────

export type InvitationActionResult = {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export type InvitationItem = {
  id: string;
  email: string;
  role: Role;
  status: InvitationStatus;
  expiresAt: Date;
  createdAt: Date;
};

export type InvitationInfo = {
  email: string;
  tenantName: string;
  inviterName: string | null;
  role: Role;
  expired: boolean;
  alreadyAccepted: boolean;
  existingUser: boolean;
  currentUserMatch: boolean;
};

// ─── Invite User (ADMIN only) ─────────────────────────

/** Invitation expiry: 7 days */
const INVITATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export async function inviteUser(
  formData: FormData
): Promise<InvitationActionResult> {
  let userId: string;
  let tenantId: string;
  try {
    const auth = await requirePermission("canInviteUsers");
    userId = auth.userId;
    tenantId = auth.tenantId;
  } catch (err) {
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return { success: false, error: "FORBIDDEN" };
    }
    throw err;
  }

  const raw = {
    email: formData.get("email"),
    role: formData.get("role"),
  };

  const result = inviteSchema.safeParse(raw);
  if (!result.success) {
    return {
      success: false,
      fieldErrors: result.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const { email, role } = result.data;
  const normalizedEmail = email.trim().toLowerCase();

  const db = tenantDb(tenantId, { actorUserId: userId, tenantId });

  // Check if user is already a member of this tenant
  const existingMembership = await db.membership.findFirst({
    where: {
      user: { email: normalizedEmail },
    },
  });

  if (existingMembership) {
    return {
      success: false,
      error: "ALREADY_MEMBER",
    };
  }

  // Check if there's already a pending invitation for this email+tenant
  const existingInvitation = await db.invitation.findFirst({
    where: {
      email: normalizedEmail,
      status: "PENDING",
    },
  });

  if (existingInvitation) {
    return {
      success: false,
      error: "ALREADY_INVITED",
    };
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_MS);

  try {
    await db.invitation.create({
      data: {
        email: normalizedEmail,
        role: role as Role,
        token,
        expiresAt,
        invitedById: userId,
        tenantId,
      },
    });
  } catch (err) {
    console.error("[invitations] inviteUser create failed:", err);
    return {
      success: false,
      error: "INVITATION_CREATE_FAILED",
    };
  }

  // Send invitation email
  try {
    const baseUrl = getAppBaseUrl();
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    const inviter = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });

    const inviteUrl = `${baseUrl}/sv/invite/${token}`;
    const renderedTemplate = await renderEmailTemplate({
      tenantId,
      name: "invitation",
      locale: "sv",
      variables: {
        tenantName: tenant?.name ?? "",
        inviteUrl,
        inviterName: inviter?.name ?? inviter?.email ?? "En kollega",
        appName: "ArbetsYtan",
      },
    });

    const sendResult = await sendEmail({
      to: normalizedEmail,
      subject: renderedTemplate.subject,
      html: renderedTemplate.html,
    });

    if (!sendResult.success) {
      return {
        success: false,
        error: "EMAIL_SEND_FAILED",
      };
    }
  } catch (err) {
    console.error("[invitations] inviteUser email send failed:", err);
    return {
      success: false,
      error: "EMAIL_SEND_FAILED",
    };
  }

  return { success: true };
}

// ─── Get Invitations (ADMIN) ──────────────────────────

export async function getInvitations(): Promise<InvitationItem[]> {
  const { tenantId } = await requirePermission("canInviteUsers");
  const db = tenantDb(tenantId);

  const invitations = await db.invitation.findMany({
    orderBy: { createdAt: "desc" },
  });

  return invitations.map((inv) => ({
    id: inv.id,
    email: inv.email,
    role: inv.role,
    status: inv.status,
    expiresAt: inv.expiresAt,
    createdAt: inv.createdAt,
  }));
}

// ─── Cancel Invitation (ADMIN) ────────────────────────

export async function cancelInvitation(
  formData: FormData
): Promise<InvitationActionResult> {
  const { tenantId, userId } = await requirePermission("canInviteUsers");

  const raw = { invitationId: formData.get("invitationId") };
  const result = cancelInvitationSchema.safeParse(raw);
  if (!result.success) {
    return { success: false, error: "INVALID_INPUT" };
  }

  const db = tenantDb(tenantId, { actorUserId: userId, tenantId });

  const invitation = await db.invitation.findUnique({
    where: { id: result.data.invitationId },
  });

  if (!invitation) {
    return { success: false, error: "NOT_FOUND" };
  }

  if (invitation.status !== "PENDING") {
    return { success: false, error: "NOT_PENDING" };
  }

  await db.invitation.delete({
    where: { id: result.data.invitationId },
  });

  return { success: true };
}

// ─── Get Invitation Info (public, by token) ───────────

export async function getInvitationInfo(
  token: string
): Promise<InvitationInfo | null> {
  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: {
      tenant: { select: { name: true } },
    },
  });

  if (!invitation) return null;

  const inviter = await prisma.user.findUnique({
    where: { id: invitation.invitedById },
    select: { name: true },
  });

  const existingUser = await prisma.user.findUnique({
    where: { email: invitation.email },
  });

  // Check if current user matches invitation
  const session = await getSession();
  const currentUserMatch =
    !!session && !!existingUser && session.user.id === existingUser.id;

  return {
    email: invitation.email,
    tenantName: invitation.tenant.name,
    inviterName: inviter?.name ?? null,
    role: invitation.role,
    expired: invitation.expiresAt < new Date(),
    alreadyAccepted: invitation.status === "ACCEPTED",
    existingUser: !!existingUser,
    currentUserMatch,
  };
}

// ─── Accept Invitation (logged-in user) ───────────────

export async function acceptInvitation(
  formData: FormData
): Promise<InvitationActionResult> {
  const { userId } = await requireAuth();

  const raw = { token: formData.get("token") };
  const result = acceptInvitationSchema.safeParse(raw);
  if (!result.success) {
    return { success: false, error: "INVALID_INPUT" };
  }

  const invitation = await prisma.invitation.findUnique({
    where: { token: result.data.token },
  });

  if (!invitation) {
    return { success: false, error: "INVALID_TOKEN" };
  }

  if (invitation.status !== "PENDING") {
    return { success: false, error: "ALREADY_ACCEPTED" };
  }

  if (invitation.expiresAt < new Date()) {
    return { success: false, error: "EXPIRED" };
  }

  // Verify the logged-in user's email matches the invitation
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });

  if (!user || user.email !== invitation.email) {
    return { success: false, error: "EMAIL_MISMATCH" };
  }

  // Check if already a member
  const existingMembership = await prisma.membership.findFirst({
    where: { userId, tenantId: invitation.tenantId },
  });

  if (existingMembership) {
    // Already a member, just mark invitation as accepted
    const db = tenantDb(invitation.tenantId, { actorUserId: userId });
    await db.invitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED" },
    });
    return { success: true };
  }

  const existingSlugs = await prisma.membership.findMany({
    where: { tenantId: invitation.tenantId },
    select: { emailSlug: true },
  });
  const emailSlug = computeEmailSlugForUser(
    user?.name ?? "user",
    existingSlugs.map((m) => m.emailSlug).filter(Boolean) as string[]
  );

  const db = tenantDb(invitation.tenantId, { actorUserId: userId });
  await db.$transaction([
    db.membership.create({
      data: {
        userId,
        tenantId: invitation.tenantId,
        role: invitation.role,
        emailSlug,
      },
    }),
    db.invitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED" },
    }),
  ]);

  try {
    const count = await db.membership.count({
      where: { tenantId: invitation.tenantId },
    });
    await updateSubscriptionQuantity(count);
  } catch {
    // Non-fatal: Stripe quantity may be out of sync until next update
  }

  return { success: true };
}

// ─── Accept Invitation with Registration (new user) ───

export async function acceptInvitationWithRegistration(
  formData: FormData
): Promise<InvitationActionResult> {
  const raw = {
    token: formData.get("token"),
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  };

  const result = acceptWithRegistrationSchema.safeParse(raw);
  if (!result.success) {
    return {
      success: false,
      fieldErrors: result.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const { token, name, email, password } = result.data;
  const normalizedEmail = email.trim().toLowerCase();

  const invitation = await prisma.invitation.findUnique({
    where: { token },
  });

  if (!invitation) {
    return { success: false, error: "INVALID_TOKEN" };
  }

  if (invitation.status !== "PENDING") {
    return { success: false, error: "ALREADY_ACCEPTED" };
  }

  if (invitation.expiresAt < new Date()) {
    return { success: false, error: "EXPIRED" };
  }

  // Verify email matches invitation
  if (normalizedEmail !== invitation.email) {
    return { success: false, error: "EMAIL_MISMATCH" };
  }

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingUser) {
    return { success: false, error: "EMAIL_EXISTS" };
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const { membership: resultMembership, invitation: resultInvitation } =
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email: normalizedEmail,
          password: hashedPassword,
        },
      });

      const existingSlugs = await tx.membership.findMany({
        where: { tenantId: invitation.tenantId },
        select: { emailSlug: true },
      });
      const emailSlug = computeEmailSlugForUser(
        name,
        existingSlugs.map((m) => m.emailSlug).filter(Boolean) as string[]
      );

      const membership = await tx.membership.create({
        data: {
          userId: user.id,
          tenantId: invitation.tenantId,
          role: invitation.role,
          emailSlug,
        },
      });

      const updatedInvitation = await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: "ACCEPTED" },
      });

      return { membership, invitation: updatedInvitation };
    });

  // Emit events
  try {
    const io = getSocketServer();
    const room = tenantRoom(invitation.tenantId);

    // Membership created
    io.to(room).emit(SOCKET_EVENTS.membershipCreated, {
      tenantId: invitation.tenantId,
      membershipId: resultMembership.id,
      userId: resultMembership.userId,
      role: resultMembership.role,
      actorUserId: resultMembership.userId,
    });

    // Invitation updated
    io.to(room).emit(SOCKET_EVENTS.invitationUpdated, {
      tenantId: invitation.tenantId,
      invitationId: resultInvitation.id,
      email: resultInvitation.email,
      role: resultInvitation.role,
      status: resultInvitation.status,
      actorUserId: resultMembership.userId,
    });
  } catch (err) {
    console.warn(
      "[invitations] Failed to emit events after acceptInvitationWithRegistration:",
      err
    );
  }

  try {
    const count = await prisma.membership.count({
      where: { tenantId: invitation.tenantId },
    });
    await updateSubscriptionQuantity(count);
  } catch {
    // Non-fatal: Stripe quantity may be out of sync until next update
  }

  // Auto sign in
  try {
    await signIn("credentials", {
      email: normalizedEmail,
      password,
      redirect: false,
    });
  } catch {
    // Sign-in after registration failed — user can log in manually
  }

  return { success: true };
}
