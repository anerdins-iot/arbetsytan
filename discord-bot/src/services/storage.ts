/**
 * Storage adapter — uploads files to S3/MinIO.
 * Uses the same S3-compatible storage as the web app.
 */
import {
  PutObjectCommand,
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";

// Lazy S3 client
let _s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!_s3Client) {
    const endpoint = process.env.S3_ENDPOINT;
    const accessKey = process.env.S3_ACCESS_KEY;
    const secretKey = process.env.S3_SECRET_KEY;
    const region = process.env.S3_REGION || "us-east-1";

    if (!endpoint || !accessKey || !secretKey) {
      throw new Error(
        "S3 not configured. Set S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY."
      );
    }

    _s3Client = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
      forcePathStyle: true,
    });
  }
  return _s3Client;
}

function getBucket(): string {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    throw new Error("S3_BUCKET not configured.");
  }
  return bucket;
}

/**
 * Normalize a filename for safe S3 storage.
 */
function normalizeFileName(fileName: string): string {
  return fileName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "file";
}

/**
 * Generate a simple unique ID for object keys.
 */
function generateObjectId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Build the S3 object key for a project file.
 * Matches the web app pattern: {bucket}/projects/{projectId}/{objectId}-{name}
 */
export function projectObjectKey(
  projectId: string,
  fileName: string
): { key: string; objectId: string } {
  const objectId = generateObjectId();
  const normalized = normalizeFileName(fileName);
  const bucket = getBucket();
  const key = `${bucket}/projects/${projectId}/${objectId}-${normalized}`;
  return { key, objectId };
}

/**
 * Upload a file buffer to S3/MinIO storage.
 * Returns the bucket and key for database storage.
 */
export async function uploadToStorage(params: {
  buffer: Buffer;
  filename: string;
  contentType: string;
  projectId?: string;
}): Promise<{ bucket: string; key: string }> {
  const client = getS3Client();
  const bucket = getBucket();

  let key: string;
  if (params.projectId) {
    const result = projectObjectKey(params.projectId, params.filename);
    key = result.key;
  } else {
    // Personal/non-project files
    const objectId = generateObjectId();
    const normalized = normalizeFileName(params.filename);
    key = `${bucket}/discord/${objectId}-${normalized}`;
  }

  // Ensure bucket exists
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    try {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch (err) {
      const error = err as { name?: string };
      if (error.name !== "BucketAlreadyOwnedByYou") {
        throw err;
      }
    }
  }

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: params.buffer,
      ContentType: params.contentType,
    })
  );

  return { bucket, key };
}

/**
 * Check if S3 storage is configured.
 */
export function isStorageConfigured(): boolean {
  return !!(
    process.env.S3_ENDPOINT &&
    process.env.S3_ACCESS_KEY &&
    process.env.S3_SECRET_KEY &&
    process.env.S3_BUCKET
  );
}
