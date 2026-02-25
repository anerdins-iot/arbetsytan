"use server";

import { z } from "zod";
import bcrypt from "bcrypt";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { signIn } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { getAppBaseUrl, renderEmailTemplate } from "@/lib/email-templates";
import {
  computeEmailSlugForUser,
  slugifyForReplyTo,
} from "@/lib/email-tracking";
import { stripe } from "@/lib/stripe";

// Auth actions run without session (registration/login). Global prisma is correct
// for User, Tenant, Membership creation and User lookup. Tenant data actions must
// use requireAuth() and tenantDb(tenantId) instead.

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  companyName: z.string().min(2).max(100),
});

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
});

const forgotPasswordSchema = z.object({
  email: z.string().email().max(255),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
});

export type AuthActionResult = {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function registerUser(
  formData: FormData
): Promise<AuthActionResult> {
  const raw = {
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    companyName: formData.get("companyName"),
  };

  const result = registerSchema.safeParse(raw);
  if (!result.success) {
    return {
      success: false,
      fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { name, email, password, companyName } = result.data;
  const normalizedEmail = email.trim().toLowerCase();

  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingUser) {
    return {
      success: false,
      error: "EMAIL_EXISTS",
    };
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const stripeCustomer = await stripe.customers.create({
    email: normalizedEmail,
    name: companyName,
    metadata: {
      contactName: name,
    },
  });

  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email: normalizedEmail,
          password: hashedPassword,
        },
      });

      const baseSlug = slugifyForReplyTo(companyName);
      const tenant = await tx.tenant.create({
        data: {
          name: companyName,
          stripeCustomerId: stripeCustomer.id,
          slug: `${baseSlug}-${crypto.randomBytes(2).toString("hex")}`,
        },
      });

      const emailSlug = computeEmailSlugForUser(name, []);
      await tx.membership.create({
        data: {
          userId: user.id,
          tenantId: tenant.id,
          role: "ADMIN",
          emailSlug,
        },
      });

      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          status: "TRIALING",
          trialEndsAt,
        },
      });
    });
  } catch (error) {
    await stripe.customers.del(stripeCustomer.id);
    throw error;
  }

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

export async function loginUser(
  formData: FormData
): Promise<AuthActionResult> {
  const raw = {
    email: formData.get("email"),
    password: formData.get("password"),
  };

  const result = loginSchema.safeParse(raw);
  if (!result.success) {
    return {
      success: false,
      fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { email, password } = result.data;
  const normalizedEmail = email.trim().toLowerCase();

  // Check if account is locked before attempting sign-in
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) {
    return {
      success: false,
      error: "INVALID_CREDENTIALS",
    };
  }

  if (!user.password) {
    return {
      success: false,
      error: "INVALID_CREDENTIALS",
    };
  }

  if (user.lockedAt) {
    return {
      success: false,
      error: "ACCOUNT_LOCKED",
    };
  }

  try {
    await signIn("credentials", {
      email: normalizedEmail,
      password,
      redirect: false,
    });
  } catch {
    const nextAttempts = (user.failedLoginAttempts ?? 0) + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: nextAttempts,
        ...(nextAttempts >= 5 ? { lockedAt: new Date() } : {}),
      },
    });
    return {
      success: false,
      error: nextAttempts >= 5 ? "ACCOUNT_LOCKED" : "INVALID_CREDENTIALS",
    };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0 },
  });

  return { success: true };
}

/** Token validity for password reset (1 hour). */
const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000;

/**
 * Request password reset: validate email, create VerificationToken, send email.
 * Uses global prisma (auth flow, no tenant).
 */
export async function requestPasswordReset(
  formData: FormData
): Promise<AuthActionResult> {
  const raw = { email: formData.get("email") };
  const result = forgotPasswordSchema.safeParse(raw);
  if (!result.success) {
    return {
      success: false,
      fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const email = result.data.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user || !user.password) {
    return {
      success: false,
      error: "EMAIL_NOT_FOUND",
    };
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS);

  await prisma.verificationToken.deleteMany({
    where: { identifier: email },
  });
  await prisma.verificationToken.create({
    data: {
      identifier: email,
      token,
      expires,
    },
  });

  const baseUrl = getAppBaseUrl();
  const locale = user.locale === "en" ? "en" : "sv";
  const resetUrl = `${baseUrl}/${locale}/reset-password?token=${encodeURIComponent(token)}`;
  const membership = await prisma.membership.findFirst({
    where: { userId: user.id },
    select: { tenantId: true },
  });
  const renderedTemplate = await renderEmailTemplate({
    tenantId: membership?.tenantId,
    name: "password-reset",
    locale,
    variables: {
      resetUrl,
      appName: "ArbetsYtan",
      supportEmail: "support@arbetsytan.se",
    },
  });

  const sendResult = await sendEmail({
    to: email,
    subject: renderedTemplate.subject,
    html: renderedTemplate.html,
  });

  if (!sendResult.success) {
    return {
      success: false,
      error: "EMAIL_SEND_FAILED",
    };
  }

  return { success: true };
}

/**
 * Reset password: validate token, check expiry, update user password, delete token.
 * Uses global prisma (auth flow, no tenant).
 */
export async function resetPassword(
  formData: FormData
): Promise<AuthActionResult> {
  const raw = {
    token: formData.get("token"),
    password: formData.get("password"),
  };
  const result = resetPasswordSchema.safeParse(raw);
  if (!result.success) {
    return {
      success: false,
      fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { token, password } = result.data;

  const verification = await prisma.verificationToken.findUnique({
    where: { token },
  });

  if (!verification) {
    return {
      success: false,
      error: "INVALID_TOKEN",
    };
  }

  if (verification.expires < new Date()) {
    await prisma.verificationToken.delete({
      where: { token },
    });
    return {
      success: false,
      error: "EXPIRED_TOKEN",
    };
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { email: verification.identifier },
      data: { password: hashedPassword },
    }),
    prisma.verificationToken.delete({
      where: { token },
    }),
  ]);

  return { success: true };
}
