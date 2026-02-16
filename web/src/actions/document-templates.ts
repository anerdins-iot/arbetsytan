"use server";

import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/db";

export type DocumentTemplateResult = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  fileId: string;
  fileName: string;
  expectedVariables: string[] | null;
  createdAt: Date;
};

export type CreateTemplateResult =
  | { success: true; template: DocumentTemplateResult }
  | { success: false; error: string };

export type ListTemplatesResult =
  | { success: true; templates: DocumentTemplateResult[] }
  | { success: false; error: string };

/**
 * List document templates for the current tenant.
 * Optionally filter by category.
 */
export async function listDocumentTemplates(
  category?: string
): Promise<ListTemplatesResult> {
  const { tenantId } = await requireAuth();
  const db = tenantDb(tenantId);

  const templates = await db.documentTemplate.findMany({
    where: category ? { category } : undefined,
    include: {
      file: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });

  return {
    success: true,
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      fileId: t.fileId,
      fileName: t.file.name,
      expectedVariables: t.expectedVariables as string[] | null,
      createdAt: t.createdAt,
    })),
  };
}

/**
 * Get a single document template by ID.
 */
export async function getDocumentTemplate(
  templateId: string
): Promise<{ success: true; template: DocumentTemplateResult } | { success: false; error: string }> {
  const { tenantId } = await requireAuth();
  const db = tenantDb(tenantId);

  const template = await db.documentTemplate.findFirst({
    where: { id: templateId },
    include: {
      file: { select: { name: true } },
    },
  });

  if (!template) {
    return { success: false, error: "Mall hittades inte" };
  }

  return {
    success: true,
    template: {
      id: template.id,
      name: template.name,
      description: template.description,
      category: template.category,
      fileId: template.fileId,
      fileName: template.file.name,
      expectedVariables: template.expectedVariables as string[] | null,
      createdAt: template.createdAt,
    },
  };
}

/**
 * Create a document template from an existing file.
 * The file must be a .docx, .dotx, or .pptx file.
 */
export async function createDocumentTemplate(
  fileId: string,
  name: string,
  category: string,
  description?: string
): Promise<CreateTemplateResult> {
  const { tenantId } = await requireAuth();
  const db = tenantDb(tenantId);

  // Verify file exists and is correct type
  const file = await db.file.findFirst({
    where: { id: fileId },
    select: { id: true, name: true, type: true },
  });

  if (!file) {
    return { success: false, error: "Filen hittades inte" };
  }

  const validTypes = [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ];

  if (!validTypes.includes(file.type)) {
    return {
      success: false,
      error: "Filen måste vara en Word-mall (.docx/.dotx) eller PowerPoint-fil (.pptx)",
    };
  }

  // Check if template already exists for this file
  const existing = await db.documentTemplate.findFirst({
    where: { fileId },
  });

  if (existing) {
    return { success: false, error: "En mall finns redan för denna fil" };
  }

  // Create the template
  const template = await db.documentTemplate.create({
    data: {
      name,
      description: description || null,
      category: category.toUpperCase(),
      fileId,
      tenantId,
    },
    include: {
      file: { select: { name: true } },
    },
  });

  return {
    success: true,
    template: {
      id: template.id,
      name: template.name,
      description: template.description,
      category: template.category,
      fileId: template.fileId,
      fileName: template.file.name,
      expectedVariables: null,
      createdAt: template.createdAt,
    },
  };
}

/**
 * Update a document template.
 */
export async function updateDocumentTemplate(
  templateId: string,
  data: { name?: string; description?: string; category?: string; expectedVariables?: string[] }
): Promise<CreateTemplateResult> {
  const { tenantId } = await requireAuth();
  const db = tenantDb(tenantId);

  const template = await db.documentTemplate.findFirst({
    where: { id: templateId },
  });

  if (!template) {
    return { success: false, error: "Mall hittades inte" };
  }

  const updated = await db.documentTemplate.update({
    where: { id: templateId },
    data: {
      name: data.name,
      description: data.description,
      category: data.category?.toUpperCase(),
      expectedVariables: data.expectedVariables,
    },
    include: {
      file: { select: { name: true } },
    },
  });

  return {
    success: true,
    template: {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      category: updated.category,
      fileId: updated.fileId,
      fileName: updated.file.name,
      expectedVariables: updated.expectedVariables as string[] | null,
      createdAt: updated.createdAt,
    },
  };
}

/**
 * Delete a document template (not the underlying file).
 */
export async function deleteDocumentTemplate(
  templateId: string
): Promise<{ success: boolean; error?: string }> {
  const { tenantId } = await requireAuth();
  const db = tenantDb(tenantId);

  const template = await db.documentTemplate.findFirst({
    where: { id: templateId },
  });

  if (!template) {
    return { success: false, error: "Mall hittades inte" };
  }

  await db.documentTemplate.delete({
    where: { id: templateId },
  });

  return { success: true };
}
