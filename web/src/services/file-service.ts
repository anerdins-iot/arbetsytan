import { tenantDb, userDb } from "@/lib/db";
import type { ServiceContext, PaginationOptions } from "./types";

export type FileListItem = {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: Date;
  ocrText: string | null;
  userDescription: string | null;
  aiAnalysis: string | null;
  label: string | null;
  bucket: string;
  objectKey: string; // key - for presigned URLs i Actions
  versionNumber: number;
  analyses: Array<{
    prompt: string | null;
    content: string;
    createdAt: Date;
  }>;
};

export type GetFilesOptions = {
  includeAnalyses?: boolean; // AI-verktyg behover detta
  analysesLimit?: number;    // Default 5
};

/**
 * Karnlogik for projektfiler.
 */
export async function getProjectFilesCore(
  ctx: ServiceContext,
  projectId: string,
  options?: GetFilesOptions & PaginationOptions
): Promise<FileListItem[]> {
  const db = tenantDb(ctx.tenantId);

  const files = await db.file.findMany({
    where: {
      projectId,
      childVersions: { none: {} }, // only latest version per version chain
    },
    orderBy: { createdAt: "desc" },
    take: options?.limit,
    skip: options?.offset,
    include: options?.includeAnalyses
      ? {
          analyses: {
            select: { prompt: true, content: true, createdAt: true },
            orderBy: { createdAt: "desc" as const },
            take: options?.analysesLimit ?? 5,
          },
        }
      : undefined,
  });

  return files.map((f: any) => ({
    id: f.id,
    name: f.name,
    type: f.type,
    size: f.size,
    createdAt: f.createdAt,
    ocrText: f.ocrText,
    userDescription: f.userDescription,
    aiAnalysis: f.aiAnalysis,
    label: f.label,
    bucket: f.bucket,
    objectKey: f.key,
    versionNumber: f.versionNumber ?? 1,
    analyses: f.analyses?.map((a: any) => ({
      prompt: a.prompt,
      content: a.content,
      createdAt: a.createdAt,
    })) ?? [],
  }));
}

/**
 * Karnlogik for personliga filer.
 * OBS: Anvander userDb(userId) istallet for tenantDb.
 */
export async function getPersonalFilesCore(
  ctx: ServiceContext,
  options?: GetFilesOptions & PaginationOptions
): Promise<FileListItem[]> {
  const udb = userDb(ctx.userId);

  const files = await udb.file.findMany({
    where: {
      childVersions: { none: {} }, // only latest version per version chain
    },
    orderBy: { createdAt: "desc" },
    take: options?.limit,
    skip: options?.offset,
    include: options?.includeAnalyses
      ? {
          analyses: {
            select: { prompt: true, content: true, createdAt: true },
            orderBy: { createdAt: "desc" as const },
            take: options?.analysesLimit ?? 5,
          },
        }
      : undefined,
  });

  return files.map((f: any) => ({
    id: f.id,
    name: f.name,
    type: f.type,
    size: f.size,
    createdAt: f.createdAt,
    ocrText: f.ocrText,
    userDescription: f.userDescription,
    aiAnalysis: f.aiAnalysis,
    label: f.label,
    bucket: f.bucket,
    objectKey: f.key,
    versionNumber: f.versionNumber ?? 1,
    analyses: f.analyses?.map((a: any) => ({
      prompt: a.prompt,
      content: a.content,
      createdAt: a.createdAt,
    })) ?? [],
  }));
}
