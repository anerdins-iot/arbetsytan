import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";

const minioEnvSchema = z.object({
  S3_ENDPOINT: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_REGION: z.string().min(1),
});

const minioEnv = minioEnvSchema.parse(process.env);

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
export const MAX_TENANT_STORAGE_BYTES = 5 * 1024 * 1024 * 1024; // 5GB

export const ALLOWED_FILE_TYPES = new Set<string>([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const PROJECT_PREFIX_ROOT = minioEnv.S3_BUCKET;

export const minioClient = new S3Client({
  endpoint: minioEnv.S3_ENDPOINT,
  region: minioEnv.S3_REGION,
  credentials: {
    accessKeyId: minioEnv.S3_ACCESS_KEY,
    secretAccessKey: minioEnv.S3_SECRET_KEY,
  },
  forcePathStyle: true,
});

export function tenantBucketName(tenantId: string): string {
  return `tenant-${tenantId}`;
}

function normalizeFileName(fileName: string): string {
  return fileName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function projectObjectKey(
  projectId: string,
  fileName: string,
  objectId: string
): string {
  const normalized = normalizeFileName(fileName) || "file";
  return `${PROJECT_PREFIX_ROOT}/projects/${projectId}/${objectId}-${normalized}`;
}

export async function ensureTenantBucket(tenantId: string): Promise<string> {
  const bucket = tenantBucketName(tenantId);

  try {
    await minioClient.send(new HeadBucketCommand({ Bucket: bucket }));
    return bucket;
  } catch {
    try {
      await minioClient.send(new CreateBucketCommand({ Bucket: bucket }));
      return bucket;
    } catch (error) {
      const err = error as { name?: string };
      if (err.name === "BucketAlreadyOwnedByYou") {
        return bucket;
      }
      throw error;
    }
  }
}

export async function putObjectToMinio(params: {
  bucket: string;
  key: string;
  body: Uint8Array;
  contentType: string;
}): Promise<void> {
  await minioClient.send(
    new PutObjectCommand({
      Bucket: params.bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    })
  );
}

export async function assertObjectExists(params: {
  bucket: string;
  key: string;
}): Promise<void> {
  await minioClient.send(
    new HeadObjectCommand({
      Bucket: params.bucket,
      Key: params.key,
    })
  );
}

export async function createPresignedUploadUrl(params: {
  bucket: string;
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: params.bucket,
    Key: params.key,
    ContentType: params.contentType,
  });

  return getSignedUrl(minioClient, command, {
    expiresIn: params.expiresInSeconds ?? 60 * 10,
  });
}

export async function createPresignedDownloadUrl(params: {
  bucket: string;
  key: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: params.bucket,
    Key: params.key,
  });

  return getSignedUrl(minioClient, command, {
    expiresIn: params.expiresInSeconds ?? 60 * 15,
  });
}

export async function deleteObject(params: {
  bucket: string;
  key: string;
}): Promise<void> {
  await minioClient.send(
    new DeleteObjectCommand({
      Bucket: params.bucket,
      Key: params.key,
    })
  );
}
