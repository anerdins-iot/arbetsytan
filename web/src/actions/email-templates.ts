"use server";

import { z } from "zod";
import { generateText } from "ai";
import { requirePermission } from "@/lib/auth";
import { tenantDb } from "@/lib/db";
import {
  EMAIL_TEMPLATE_NAMES,
  EMAIL_TEMPLATE_LOCALES,
  EMAIL_TEMPLATE_VARIABLES,
  getDefaultEmailTemplate,
  applyTemplateVariables,
  type TemplateName,
} from "@/lib/email-templates";
import { getModel } from "@/lib/ai/providers";
import { revalidatePath } from "next/cache";

// ─── Types ─────────────────────────────────────────────

export type EmailTemplateItem = {
  id: string | null;
  name: TemplateName;
  locale: "sv" | "en";
  subject: string;
  htmlTemplate: string;
  variables: string[];
  isCustom: boolean;
};

export type EmailTemplateActionResult = {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

// ─── Schemas ───────────────────────────────────────────

const updateTemplateSchema = z.object({
  name: z.enum(EMAIL_TEMPLATE_NAMES),
  locale: z.enum(EMAIL_TEMPLATE_LOCALES),
  subject: z.string().min(1, "Ämnesrad krävs").max(300),
  htmlTemplate: z.string().min(1, "Mall krävs").max(100000),
});

const resetTemplateSchema = z.object({
  name: z.enum(EMAIL_TEMPLATE_NAMES),
  locale: z.enum(EMAIL_TEMPLATE_LOCALES),
});

// ─── List Templates ────────────────────────────────────

export async function listEmailTemplates(): Promise<EmailTemplateItem[]> {
  const { tenantId } = await requirePermission("canManageTenantSettings");
  const db = tenantDb(tenantId);

  const customTemplates = await db.emailTemplate.findMany({
    select: {
      id: true,
      name: true,
      locale: true,
      subject: true,
      htmlTemplate: true,
    },
  });

  const customMap = new Map(
    customTemplates.map((t) => [`${t.name}:${t.locale}`, t])
  );

  const templates: EmailTemplateItem[] = [];

  for (const name of EMAIL_TEMPLATE_NAMES) {
    for (const locale of EMAIL_TEMPLATE_LOCALES) {
      const custom = customMap.get(`${name}:${locale}`);
      const fallback = getDefaultEmailTemplate(name, locale);

      if (!fallback) continue;

      templates.push({
        id: custom?.id ?? null,
        name: name as TemplateName,
        locale: locale as "sv" | "en",
        subject: custom?.subject ?? fallback.subject,
        htmlTemplate: custom?.htmlTemplate ?? fallback.htmlTemplate,
        variables: EMAIL_TEMPLATE_VARIABLES[name as TemplateName],
        isCustom: Boolean(custom),
      });
    }
  }

  return templates;
}

// ─── Get Single Template ───────────────────────────────

export async function getEmailTemplate(
  name: TemplateName,
  locale: "sv" | "en"
): Promise<EmailTemplateItem | null> {
  const { tenantId } = await requirePermission("canManageTenantSettings");
  const db = tenantDb(tenantId);

  const custom = await db.emailTemplate.findFirst({
    where: { name, locale },
    select: {
      id: true,
      name: true,
      locale: true,
      subject: true,
      htmlTemplate: true,
    },
  });

  const fallback = getDefaultEmailTemplate(name, locale);
  if (!fallback) return null;

  return {
    id: custom?.id ?? null,
    name,
    locale,
    subject: custom?.subject ?? fallback.subject,
    htmlTemplate: custom?.htmlTemplate ?? fallback.htmlTemplate,
    variables: EMAIL_TEMPLATE_VARIABLES[name],
    isCustom: Boolean(custom),
  };
}

// ─── Update Template ───────────────────────────────────

export async function updateEmailTemplate(
  formData: FormData
): Promise<EmailTemplateActionResult> {
  const { tenantId } = await requirePermission("canManageTenantSettings");

  const raw = {
    name: formData.get("name"),
    locale: formData.get("locale"),
    subject: formData.get("subject"),
    htmlTemplate: formData.get("htmlTemplate"),
  };

  const result = updateTemplateSchema.safeParse(raw);
  if (!result.success) {
    return {
      success: false,
      fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { name, locale, subject, htmlTemplate } = result.data;
  const db = tenantDb(tenantId);

  await db.emailTemplate.upsert({
    where: {
      tenantId_name_locale: {
        tenantId,
        name,
        locale,
      },
    },
    update: {
      subject,
      htmlTemplate,
      variables: EMAIL_TEMPLATE_VARIABLES[name as TemplateName],
    },
    create: {
      name,
      locale,
      subject,
      htmlTemplate,
      variables: EMAIL_TEMPLATE_VARIABLES[name as TemplateName],
      // tenantId injiceras av tenantDb-extensionen i db.ts – skicka inte tenant/tenantId här
    },
  });

  revalidatePath("/settings");
  return { success: true };
}

// ─── Reset Template to Default ─────────────────────────

export async function resetEmailTemplate(
  formData: FormData
): Promise<EmailTemplateActionResult> {
  const { tenantId } = await requirePermission("canManageTenantSettings");

  const raw = {
    name: formData.get("name"),
    locale: formData.get("locale"),
  };

  const result = resetTemplateSchema.safeParse(raw);
  if (!result.success) {
    return { success: false, error: "INVALID_INPUT" };
  }

  const { name, locale } = result.data;
  const db = tenantDb(tenantId);

  // Delete custom template if exists - will fall back to default
  await db.emailTemplate.deleteMany({
    where: { name, locale },
  });

  revalidatePath("/settings");
  return { success: true };
}

// ─── Preview Template ──────────────────────────────────

export async function previewEmailTemplate(
  name: TemplateName,
  locale: "sv" | "en",
  testData?: Record<string, string>
): Promise<{ subject: string; html: string } | null> {
  const { tenantId } = await requirePermission("canManageTenantSettings");
  const db = tenantDb(tenantId);

  const custom = await db.emailTemplate.findFirst({
    where: { name, locale },
    select: { subject: true, htmlTemplate: true },
  });

  const fallback = getDefaultEmailTemplate(name, locale);
  if (!fallback) return null;

  const template = {
    subject: custom?.subject ?? fallback.subject,
    htmlTemplate: custom?.htmlTemplate ?? fallback.htmlTemplate,
  };

  const defaultTestData: Record<string, string> = {
    appName: "ArbetsYtan",
    projectName: "Demo Projekt",
    projectUrl: "https://app.arbetsytan.se/sv/projects/demo",
    taskTitle: "Exempeluppgift",
    assignedBy: "Projektledare",
    deadline: "2026-02-20 10:00",
    previousStatus: "ACTIVE",
    newStatus: "PAUSED",
    inviteUrl: "https://app.arbetsytan.se/sv/invite/demo",
    tenantName: "Demo AB",
    inviterName: "Admin",
    resetUrl: "https://app.arbetsytan.se/sv/reset-password?token=demo",
    subject: "Exempelämne",
    content: "<p>Hej! Här är ett exempelmeddelande med <strong>formaterad text</strong>.</p>",
    senderName: "Erik Johansson",
    preview: "Tack för snabb återkoppling...",
    conversationUrl: "https://app.arbetsytan.se/sv/email/demo",
  };

  const variables = { ...defaultTestData, ...(testData ?? {}) };

  return {
    subject: applyTemplateVariables(template.subject, variables),
    html: applyTemplateVariables(template.htmlTemplate, variables),
  };
}

// ─── AI Edit Template ───────────────────────────────────

export type AiEditMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AiEditResult = {
  success: boolean;
  subject?: string;
  htmlTemplate?: string;
  comment?: string;
  error?: string;
};

const AI_EDIT_SYSTEM_PROMPT = `You are an expert email template editor. The user will give instructions to modify an HTML email template (and optionally its subject line).

Return ONLY valid JSON with this exact structure:
{
  "subject": "<the updated subject line>",
  "htmlTemplate": "<the updated HTML template>",
  "comment": "<a one-liner in Swedish describing what was changed, e.g. 'Ändrat till blå färg på rubrik'>"
}

Rules:
- Preserve template variables like {{content}}, {{tenantName}}, {{subject}}, {{year}}, {{locale}}, etc. Do NOT remove or rename them.
- Only change styling, layout, or text content as requested by the user.
- Output must be valid, safe HTML. Never include <script> tags or event handlers (onclick, onerror, etc.).
- If the user says something like "ta rött istället" (use red instead), look at the conversation history to understand the previous change and apply the correction.
- The "comment" field must always be a short one-liner in Swedish describing the change.
- Do NOT wrap the JSON in markdown code fences. Return raw JSON only.`;

export async function aiEditEmailTemplate(input: {
  currentSubject: string;
  currentHtmlTemplate: string;
  instruction: string;
  history?: AiEditMessage[];
}): Promise<AiEditResult> {
  await requirePermission("canManageTenantSettings");

  const { currentSubject, currentHtmlTemplate, instruction, history } = input;

  // Build the conversation messages for context
  const historyContext =
    history && history.length > 0
      ? "\n\nPrevious conversation:\n" +
        history
          .map((m) =>
            m.role === "user"
              ? `User: ${m.content}`
              : `AI: ${m.content}`
          )
          .join("\n")
      : "";

  const prompt = `Current subject: ${currentSubject}

Current HTML template:
${currentHtmlTemplate}
${historyContext}

User instruction: ${instruction}`;

  try {
    const result = await generateText({
      model: getModel("GEMINI_PRO"),
      system: AI_EDIT_SYSTEM_PROMPT,
      prompt,
      maxOutputTokens: 16384,
      temperature: 0.3,
    });

    const text = result.text.trim();

    // Try to extract JSON (handle potential markdown code fences)
    let jsonStr = text;
    const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);

    if (!parsed.subject || !parsed.htmlTemplate || !parsed.comment) {
      return { success: false, error: "AI returned incomplete response" };
    }

    return {
      success: true,
      subject: parsed.subject,
      htmlTemplate: parsed.htmlTemplate,
      comment: parsed.comment,
    };
  } catch (err) {
    console.error("AI edit template failed:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "AI editing failed",
    };
  }
}
