"use server";

import { z } from "zod";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/db";
import { signIn } from "@/lib/auth";

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

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name,
        email: normalizedEmail,
        password: hashedPassword,
      },
    });

    const tenant = await tx.tenant.create({
      data: {
        name: companyName,
      },
    });

    await tx.membership.create({
      data: {
        userId: user.id,
        tenantId: tenant.id,
        role: "ADMIN",
      },
    });
  });

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
