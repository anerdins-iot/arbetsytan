"use server";

import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  assertObjectExists,
  createPresignedDownloadUrl,
  createPresignedUploadUrl,
  deleteObject,
  ensureTenantBucket,
} from "@/lib/minio";

const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5MB
const PROFILE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(50).optional().or(z.literal("")),
  bio: z.string().trim().max(500).optional().or(z.literal("")),
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "PASSWORD_MISMATCH",
    path: ["confirmPassword"],
  });

const updateLocaleSchema = z.object({
  locale: z.enum(["sv", "en"]),
});

const prepareProfileUploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileType: z.string().min(1).max(255),
  fileSize: z.number().int().positive(),
});

const completeProfileUploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileType: z.string().min(1).max(255),
  fileSize: z.number().int().positive(),
  bucket: z.string().min(1),
  key: z.string().min(1),
});

type ActionResult = {
  success: boolean;
  error?: string;
};

export type ProfileData = {
  name: string;
  email: string;
  imageUrl: string | null;
  locale: "sv" | "en";
  phone: string | null;
  bio: string | null;
};

function normalizeFileName(fileName: string): string {
  return fileName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function profileObjectKey(userId: string, fileName: string): string {
  const normalized = normalizeFileName(fileName) || "avatar";
  return `profiles/${userId}/${randomUUID()}-${normalized}`;
}

function buildStoredImageValue(bucket: string, key: string): string {
  return `minio://${bucket}/${key}`;
}

function parseStoredImage(value: string | null): { bucket: string; key: string } | null {
  if (!value || !value.startsWith("minio://")) {
    return null;
  }
  const rest = value.slice("minio://".length);
  const slashIndex = rest.indexOf("/");
  if (slashIndex <= 0) {
    return null;
  }
  const bucket = rest.slice(0, slashIndex);
  const key = rest.slice(slashIndex + 1);
  if (!bucket || !key) {
    return null;
  }
  return { bucket, key };
}

async function resolveImageUrl(storedImage: string | null): Promise<string | null> {
  if (!storedImage) {
    return null;
  }
  if (storedImage.startsWith("http://") || storedImage.startsWith("https://")) {
    return storedImage;
  }
  const parsed = parseStoredImage(storedImage);
  if (!parsed) {
    return null;
  }
  try {
    return await createPresignedDownloadUrl({
      bucket: parsed.bucket,
      key: parsed.key,
    });
  } catch {
    return null;
  }
}

export async function getCurrentUserProfile(): Promise<ProfileData> {
  const { userId } = await requireAuth();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      image: true,
      locale: true,
      phone: true,
      bio: true,
    },
  });

  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  return {
    name: user.name ?? "",
    email: user.email,
    imageUrl: await resolveImageUrl(user.image),
    locale: user.locale === "en" ? "en" : "sv",
    phone: user.phone ?? null,
    bio: user.bio ?? null,
  };
}

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const { userId } = await requireAuth();
  const parsed = updateProfileSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    bio: formData.get("bio"),
  });

  if (!parsed.success) {
    return { success: false, error: "INVALID_INPUT" };
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing && existing.id !== userId) {
    return { success: false, error: "EMAIL_IN_USE" };
  }

  const phone = parsed.data.phone?.trim() || null;
  const bio = parsed.data.bio?.trim() || null;

  await prisma.user.update({
    where: { id: userId },
    data: {
      name: parsed.data.name,
      email,
      phone,
      bio,
    },
  });

  revalidatePath("/[locale]/settings/profile", "page");
  return { success: true };
}

export async function changePassword(formData: FormData): Promise<ActionResult> {
  const { userId } = await requireAuth();
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    const hasMismatch = parsed.error.issues.some((issue) => issue.message === "PASSWORD_MISMATCH");
    return { success: false, error: hasMismatch ? "PASSWORD_MISMATCH" : "INVALID_INPUT" };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { password: true },
  });

  if (!user?.password) {
    return { success: false, error: "PASSWORD_NOT_SET" };
  }

  const isCurrentPasswordValid = await bcrypt.compare(parsed.data.currentPassword, user.password);
  if (!isCurrentPasswordValid) {
    return { success: false, error: "CURRENT_PASSWORD_INVALID" };
  }

  const nextHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({
    where: { id: userId },
    data: { password: nextHash },
  });

  return { success: true };
}

export async function updateUserLocale(input: { locale: "sv" | "en" }): Promise<ActionResult> {
  const { userId } = await requireAuth();
  const parsed = updateLocaleSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "INVALID_INPUT" };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { locale: parsed.data.locale },
  });

  revalidatePath("/[locale]", "layout");
  return { success: true };
}

export async function prepareProfileImageUpload(input: {
  fileName: string;
  fileType: string;
  fileSize: number;
}): Promise<
  | { success: true; uploadUrl: string; bucket: string; key: string; maxFileSize: number }
  | { success: false; error: string }
> {
  const { tenantId, userId } = await requireAuth();
  const parsed = prepareProfileUploadSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "INVALID_INPUT" };
  }

  if (!PROFILE_IMAGE_TYPES.has(parsed.data.fileType)) {
    return { success: false, error: "FILE_TYPE_NOT_ALLOWED" };
  }
  if (parsed.data.fileSize > PROFILE_IMAGE_MAX_BYTES) {
    return { success: false, error: "FILE_TOO_LARGE" };
  }

  const bucket = await ensureTenantBucket(tenantId);
  const key = profileObjectKey(userId, parsed.data.fileName);
  const uploadUrl = await createPresignedUploadUrl({
    bucket,
    key,
    contentType: parsed.data.fileType,
  });

  return {
    success: true,
    uploadUrl,
    bucket,
    key,
    maxFileSize: PROFILE_IMAGE_MAX_BYTES,
  };
}

export async function completeProfileImageUpload(input: {
  fileName: string;
  fileType: string;
  fileSize: number;
  bucket: string;
  key: string;
}): Promise<{ success: true; imageUrl: string } | { success: false; error: string }> {
  const { userId } = await requireAuth();
  const parsed = completeProfileUploadSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "INVALID_INPUT" };
  }

  if (!PROFILE_IMAGE_TYPES.has(parsed.data.fileType)) {
    return { success: false, error: "FILE_TYPE_NOT_ALLOWED" };
  }
  if (parsed.data.fileSize > PROFILE_IMAGE_MAX_BYTES) {
    return { success: false, error: "FILE_TOO_LARGE" };
  }

  await assertObjectExists({
    bucket: parsed.data.bucket,
    key: parsed.data.key,
  });

  const previous = await prisma.user.findUnique({
    where: { id: userId },
    select: { image: true },
  });
  const previousParsed = parseStoredImage(previous?.image ?? null);
  if (previousParsed) {
    try {
      await deleteObject({
        bucket: previousParsed.bucket,
        key: previousParsed.key,
      });
    } catch {
      // Keep new upload flow resilient if old object is already gone.
    }
  }

  const storedValue = buildStoredImageValue(parsed.data.bucket, parsed.data.key);
  await prisma.user.update({
    where: { id: userId },
    data: { image: storedValue },
  });

  revalidatePath("/[locale]/settings/profile", "page");
  const imageUrl = await createPresignedDownloadUrl({
    bucket: parsed.data.bucket,
    key: parsed.data.key,
  });
  return { success: true, imageUrl };
}
