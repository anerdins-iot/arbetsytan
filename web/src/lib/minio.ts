import {
  CopyObjectCommand,
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
  S3_PUBLIC_ENDPOINT: z.string().optional(), // For presigned URLs accessible from browser (HTTPS)
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_REGION: z.string().min(1),
});

// Lazy initialization to avoid crashing at import time if S3 vars are missing
let _minioEnv: z.infer<typeof minioEnvSchema> | null = null;
let _minioClient: S3Client | null = null;
let _minioPublicClient: S3Client | null = null;

function getMinioEnv() {
  if (!_minioEnv) {
    _minioEnv = minioEnvSchema.parse(process.env);
  }
  return _minioEnv;
}

function getMinioClient(): S3Client {
  if (!_minioClient) {
    const env = getMinioEnv();
    _minioClient = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
      },
      forcePathStyle: true,
    });
  }
  return _minioClient;
}

/**
 * Get S3 client configured for public/browser access.
 * Uses S3_PUBLIC_ENDPOINT if set, otherwise falls back to S3_ENDPOINT.
 * This is needed when presigned URLs must be accessible from browsers over HTTPS.
 */
function getMinioPublicClient(): S3Client {
  if (!_minioPublicClient) {
    const env = getMinioEnv();
    const publicEndpoint = env.S3_PUBLIC_ENDPOINT || env.S3_ENDPOINT;
    _minioPublicClient = new S3Client({
      endpoint: publicEndpoint,
      region: env.S3_REGION,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
      },
      forcePathStyle: true,
    });
  }
  return _minioPublicClient;
}

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

/** @deprecated Use getMinioClient() instead for lazy initialization */
export const minioClient = new Proxy({} as S3Client, {
  get(_, prop) {
    return getMinioClient()[prop as keyof S3Client];
  },
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
  return `${getMinioEnv().S3_BUCKET}/projects/${projectId}/${objectId}-${normalized}`;
}

export function exportObjectKey(
  projectId: string,
  fileName: string,
  objectId: string
): string {
  const normalized = normalizeFileName(fileName) || "export";
  return `${getMinioEnv().S3_BUCKET}/exports/${projectId}/${objectId}-${normalized}`;
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

  // Use public client for presigned URLs (browser needs HTTPS access)
  return getSignedUrl(getMinioPublicClient(), command, {
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

  // Use public client for presigned URLs (browser needs HTTPS access)
  return getSignedUrl(getMinioPublicClient(), command, {
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

export async function copyObjectInMinio(params: {
  sourceBucket: string;
  sourceKey: string;
  destBucket: string;
  destKey: string;
}): Promise<void> {
  await minioClient.send(
    new CopyObjectCommand({
      Bucket: params.destBucket,
      Key: params.destKey,
      CopySource: `${params.sourceBucket}/${params.sourceKey}`,
    })
  );
}
