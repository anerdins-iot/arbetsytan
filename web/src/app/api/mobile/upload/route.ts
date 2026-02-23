/**
 * POST /api/mobile/upload — Upload an image from the mobile app.
 * Stores the file in MinIO and creates a File record in the database.
 * Verifies JWT and uses tenantDb(tenantId) for tenant isolation.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyBearerToken } from "@/lib/auth-mobile";
import { tenantDb } from "@/lib/db";
import { requireProject } from "@/lib/auth";
import {
  ensureTenantBucket,
  putObjectToMinio,
  projectObjectKey,
  createPresignedDownloadUrl,
  MAX_FILE_SIZE_BYTES,
} from "@/lib/minio";

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export async function POST(req: NextRequest) {
  const payload = verifyBearerToken(req.headers.get("authorization"));
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { tenantId, userId } = payload;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const projectId = formData.get("projectId") as string | null;

  if (!file || !projectId) {
    return NextResponse.json(
      { error: "Missing file or projectId" },
      { status: 400 }
    );
  }

  // Validate project access
  await requireProject(tenantId, projectId, userId);

  // Validate file type
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Only JPEG, PNG and WebP images are allowed" },
      { status: 400 }
    );
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: "File too large (max 50MB)" },
      { status: 400 }
    );
  }

  // Prepare bucket and key
  const bucketName = await ensureTenantBucket(tenantId);
  const db = tenantDb(tenantId);

  // Create a temporary ID for the object key
  const tempId = crypto.randomUUID();
  const objectKey = projectObjectKey(projectId, file.name, tempId);

  // Upload to MinIO first
  const arrayBuffer = await file.arrayBuffer();
  const body = new Uint8Array(arrayBuffer);

  await putObjectToMinio({
    bucket: bucketName,
    key: objectKey,
    body,
    contentType: file.type,
  });

  // Create file record with correct bucket and key fields
  const fileRecord = await db.file.create({
    data: {
      name: file.name,
      type: file.type,
      size: file.size,
      bucket: bucketName,
      key: objectKey,
      projectId,
      uploadedById: userId,
    },
  });

  // Generate a presigned download URL
  const url = await createPresignedDownloadUrl({
    bucket: bucketName,
    key: objectKey,
  });

  return NextResponse.json({
    id: fileRecord.id,
    name: file.name,
    type: file.type,
    size: file.size,
    url,
  });
}
