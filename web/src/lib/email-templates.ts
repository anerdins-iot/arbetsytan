/**
 * Email template system for ArbetsYtan.
 * Provides beautiful, responsive HTML email templates.
 */

import { prisma, tenantDb } from "@/lib/db";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TemplateName =
  | "password-reset"
  | "invitation"
  | "task-assigned"
  | "deadline-reminder"
  | "project-status-changed";

export type TemplateVariables = Record<string, string>;

// ─── Constants for AI tools ──────────────────────────────────────────────────

export const EMAIL_TEMPLATE_NAMES = [
  "password-reset",
  "invitation",
  "task-assigned",
  "deadline-reminder",
  "project-status-changed",
] as const;

export const EMAIL_TEMPLATE_LOCALES = ["sv", "en"] as const;

export const EMAIL_TEMPLATE_VARIABLES: Record<TemplateName, string[]> = {
  "password-reset": ["resetUrl"],
  "invitation": ["inviterName", "tenantName", "inviteUrl"],
  "task-assigned": ["taskTitle", "projectName", "assignedBy", "projectUrl"],
  "deadline-reminder": ["taskTitle", "projectName", "deadline", "projectUrl"],
  "project-status-changed": ["projectName", "previousStatus", "newStatus", "projectUrl"],
};

export type RenderOptions = {
  tenantId?: string | null;
  name: TemplateName;
  locale: "sv" | "en";
  variables: TemplateVariables;
  fallbackSubject?: string;
  fallbackHtml?: string;
};

export type RenderedTemplate = {
  subject: string;
  html: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getAppBaseUrl(): string {
  return (
    process.env.APP_URL?.replace(/\/$/, "") ??
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "http://localhost:3000"
  );
}

function replaceVariables(template: string, variables: TemplateVariables): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, "g"), value);
  }
  return result;
}

// ─── Base Template ────────────────────────────────────────────────────────────

// ─── Brand Colors (from UI.md / globals.css) ─────────────────────────────────
// Primary: Dark blue (oklch(0.28 0.12 260)) → ~#1e3a8a
// Accent: Warm orange (oklch(0.72 0.18 45)) → ~#ea580c
// Background: Light gray → #f4f4f5
const BRAND = {
  primary: "#1e3a8a",        // Mörkblå - trygghet och professionalism
  primaryLight: "#2563eb",   // Ljusare blå för gradienter
  accent: "#ea580c",         // Varm orange - varselkläder/byggbranschen
  accentLight: "#f97316",    // Ljusare orange för gradienter
  background: "#f4f4f5",     // Ljusgrå bakgrund
  card: "#ffffff",           // Vitt för kort
  text: "#111827",           // Mörk text
  textMuted: "#6b7280",      // Dämpad text
  border: "#e5e7eb",         // Kantlinje
};

const BASE_TEMPLATE = `
<!DOCTYPE html>
<html lang="{{locale}}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{subject}}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: ${BRAND.background}; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: ${BRAND.background};">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; width: 100%;">

          <!-- Header with dark blue gradient -->
          <tr>
            <td style="background: linear-gradient(135deg, ${BRAND.primary} 0%, ${BRAND.primaryLight} 100%); border-radius: 16px 16px 0 0; padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
                ArbetsYtan
              </h1>
              <p style="margin: 8px 0 0; color: rgba(255,255,255,0.85); font-size: 14px;">
                Projekthantering för hantverkare
              </p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="background-color: ${BRAND.card}; padding: 40px;">
              {{content}}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; border-radius: 0 0 16px 16px; padding: 24px 40px; text-align: center; border-top: 1px solid ${BRAND.border};">
              <p style="margin: 0 0 8px; color: ${BRAND.textMuted}; font-size: 13px;">
                {{footerText}}
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                © {{year}} ArbetsYtan. Alla rättigheter förbehållna.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

// ─── Template Contents ────────────────────────────────────────────────────────

const TEMPLATES: Record<TemplateName, Record<"sv" | "en", { subject: string; content: string; footerText: string }>> = {
  "password-reset": {
    sv: {
      subject: "Återställ ditt lösenord",
      content: `
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="display: inline-block; background: linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%); border-radius: 50%; padding: 16px; margin-bottom: 16px;">
            <span style="font-size: 32px;">🔐</span>
          </div>
          <h2 style="margin: 0; color: #111827; font-size: 24px; font-weight: 600;">
            Återställ ditt lösenord
          </h2>
        </div>

        <p style="margin: 0 0 24px; color: #4b5563; font-size: 16px; line-height: 1.6;">
          Vi har tagit emot en begäran om att återställa lösenordet för ditt konto.
          Klicka på knappen nedan för att välja ett nytt lösenord.
        </p>

        <div style="text-align: center; margin: 32px 0;">
          <a href="{{resetUrl}}" style="display: inline-block; background: linear-gradient(135deg, ${BRAND.primary} 0%, ${BRAND.primaryLight} 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(30, 58, 138, 0.4);">
            Återställ lösenord
          </a>
        </div>

        <div style="background-color: #fef3c7; border-radius: 8px; padding: 16px; margin-top: 24px;">
          <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;">
            <strong>⏰ Observera:</strong> Denna länk är giltig i 1 timme. Om du inte begärde denna återställning kan du ignorera detta meddelande.
          </p>
        </div>
      `,
      footerText: "Detta mail skickades från ArbetsYtan. Svara inte på detta mail.",
    },
    en: {
      subject: "Reset your password",
      content: `
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="display: inline-block; background: linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%); border-radius: 50%; padding: 16px; margin-bottom: 16px;">
            <span style="font-size: 32px;">🔐</span>
          </div>
          <h2 style="margin: 0; color: #111827; font-size: 24px; font-weight: 600;">
            Reset your password
          </h2>
        </div>

        <p style="margin: 0 0 24px; color: #4b5563; font-size: 16px; line-height: 1.6;">
          We received a request to reset the password for your account.
          Click the button below to choose a new password.
        </p>

        <div style="text-align: center; margin: 32px 0;">
          <a href="{{resetUrl}}" style="display: inline-block; background: linear-gradient(135deg, ${BRAND.primary} 0%, ${BRAND.primaryLight} 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(30, 58, 138, 0.4);">
            Reset password
          </a>
        </div>

        <div style="background-color: #fef3c7; border-radius: 8px; padding: 16px; margin-top: 24px;">
          <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;">
            <strong>⏰ Note:</strong> This link is valid for 1 hour. If you didn't request this reset, you can ignore this message.
          </p>
        </div>
      `,
      footerText: "This email was sent from ArbetsYtan. Please do not reply to this email.",
    },
  },

  invitation: {
    sv: {
      subject: "Du är inbjuden till {{tenantName}}",
      content: `
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="display: inline-block; background: linear-gradient(135deg, #dbeafe 0%, #93c5fd 100%); border-radius: 50%; padding: 16px; margin-bottom: 16px;">
            <span style="font-size: 32px;">🎉</span>
          </div>
          <h2 style="margin: 0; color: #111827; font-size: 24px; font-weight: 600;">
            Du är inbjuden!
          </h2>
        </div>

        <p style="margin: 0 0 16px; color: #4b5563; font-size: 16px; line-height: 1.6;">
          <strong>{{inviterName}}</strong> har bjudit in dig att gå med i företaget
          <strong>{{tenantName}}</strong> på ArbetsYtan.
        </p>

        <p style="margin: 0 0 24px; color: #4b5563; font-size: 16px; line-height: 1.6;">
          ArbetsYtan är en plattform för projekthantering som hjälper hantverkare att organisera sitt arbete,
          dela filer och samarbeta effektivt.
        </p>

        <div style="text-align: center; margin: 32px 0;">
          <a href="{{inviteUrl}}" style="display: inline-block; background: linear-gradient(135deg, ${BRAND.primary} 0%, ${BRAND.primaryLight} 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(30, 58, 138, 0.4);">
            Acceptera inbjudan
          </a>
        </div>

        <div style="background-color: #f3f4f6; border-radius: 8px; padding: 16px; margin-top: 24px;">
          <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
            Denna inbjudan är giltig i 7 dagar. Om länken inte fungerar, kontakta personen som bjöd in dig.
          </p>
        </div>
      `,
      footerText: "Detta mail skickades från ArbetsYtan. Svara inte på detta mail.",
    },
    en: {
      subject: "You're invited to {{tenantName}}",
      content: `
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="display: inline-block; background: linear-gradient(135deg, #dbeafe 0%, #93c5fd 100%); border-radius: 50%; padding: 16px; margin-bottom: 16px;">
            <span style="font-size: 32px;">🎉</span>
          </div>
          <h2 style="margin: 0; color: #111827; font-size: 24px; font-weight: 600;">
            You're invited!
          </h2>
        </div>

        <p style="margin: 0 0 16px; color: #4b5563; font-size: 16px; line-height: 1.6;">
          <strong>{{inviterName}}</strong> has invited you to join
          <strong>{{tenantName}}</strong> on ArbetsYtan.
        </p>

        <p style="margin: 0 0 24px; color: #4b5563; font-size: 16px; line-height: 1.6;">
          ArbetsYtan is a project management platform that helps craftsmen organize their work,
          share files and collaborate effectively.
        </p>

        <div style="text-align: center; margin: 32px 0;">
          <a href="{{inviteUrl}}" style="display: inline-block; background: linear-gradient(135deg, ${BRAND.primary} 0%, ${BRAND.primaryLight} 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(30, 58, 138, 0.4);">
            Accept invitation
          </a>
        </div>

        <div style="background-color: #f3f4f6; border-radius: 8px; padding: 16px; margin-top: 24px;">
          <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
            This invitation is valid for 7 days. If the link doesn't work, contact the person who invited you.
          </p>
        </div>
      `,
      footerText: "This email was sent from ArbetsYtan. Please do not reply to this email.",
    },
  },

  "task-assigned": {
    sv: {
      subject: "Ny uppgift: {{taskTitle}}",
      content: `
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="display: inline-block; background: linear-gradient(135deg, #fff7ed 0%, #fdba74 100%); border-radius: 50%; padding: 16px; margin-bottom: 16px;">
            <span style="font-size: 32px;">✅</span>
          </div>
          <h2 style="margin: 0; color: #111827; font-size: 24px; font-weight: 600;">
            Du har fått en ny uppgift
          </h2>
        </div>

        <div style="background-color: #f9fafb; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
          <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
            Uppgift
          </p>
          <p style="margin: 0 0 16px; color: #111827; font-size: 18px; font-weight: 600;">
            {{taskTitle}}
          </p>

          <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
            Projekt
          </p>
          <p style="margin: 0 0 16px; color: #111827; font-size: 16px;">
            {{projectName}}
          </p>

          <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
            Tilldelad av
          </p>
          <p style="margin: 0; color: #111827; font-size: 16px;">
            {{assignedBy}}
          </p>
        </div>

        <div style="text-align: center; margin: 32px 0;">
          <a href="{{projectUrl}}" style="display: inline-block; background: linear-gradient(135deg, ${BRAND.primary} 0%, ${BRAND.primaryLight} 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(30, 58, 138, 0.4);">
            Visa uppgift
          </a>
        </div>
      `,
      footerText: "Du får detta mail eftersom du har notifikationer aktiverade.",
    },
    en: {
      subject: "New task: {{taskTitle}}",
      content: `
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="display: inline-block; background: linear-gradient(135deg, #fff7ed 0%, #fdba74 100%); border-radius: 50%; padding: 16px; margin-bottom: 16px;">
            <span style="font-size: 32px;">✅</span>
          </div>
          <h2 style="margin: 0; color: #111827; font-size: 24px; font-weight: 600;">
            You have a new task
          </h2>
        </div>

        <div style="background-color: #f9fafb; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
          <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
            Task
          </p>
          <p style="margin: 0 0 16px; color: #111827; font-size: 18px; font-weight: 600;">
            {{taskTitle}}
          </p>

          <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
            Project
          </p>
          <p style="margin: 0 0 16px; color: #111827; font-size: 16px;">
            {{projectName}}
          </p>

          <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
            Assigned by
          </p>
          <p style="margin: 0; color: #111827; font-size: 16px;">
            {{assignedBy}}
          </p>
        </div>

        <div style="text-align: center; margin: 32px 0;">
          <a href="{{projectUrl}}" style="display: inline-block; background: linear-gradient(135deg, ${BRAND.primary} 0%, ${BRAND.primaryLight} 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(30, 58, 138, 0.4);">
            View task
          </a>
        </div>
      `,
      footerText: "You receive this email because you have notifications enabled.",
    },
  },

  "deadline-reminder": {
    sv: {
      subject: "⏰ Deadline närmar sig: {{taskTitle}}",
      content: `
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="display: inline-block; background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); border-radius: 50%; padding: 16px; margin-bottom: 16px;">
            <span style="font-size: 32px;">⏰</span>
          </div>
          <h2 style="margin: 0; color: #111827; font-size: 24px; font-weight: 600;">
            Deadline närmar sig!
          </h2>
        </div>

        <div style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border-radius: 12px; padding: 24px; margin-bottom: 24px; border-left: 4px solid #ef4444;">
          <p style="margin: 0 0 8px; color: #991b1b; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">
            Deadline
          </p>
          <p style="margin: 0; color: #dc2626; font-size: 20px; font-weight: 700;">
            {{deadline}}
          </p>
        </div>

        <div style="background-color: #f9fafb; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
          <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
            Uppgift
          </p>
          <p style="margin: 0 0 16px; color: #111827; font-size: 18px; font-weight: 600;">
            {{taskTitle}}
          </p>

          <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
            Projekt
          </p>
          <p style="margin: 0; color: #111827; font-size: 16px;">
            {{projectName}}
          </p>
        </div>

        <div style="text-align: center; margin: 32px 0;">
          <a href="{{projectUrl}}" style="display: inline-block; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(239, 68, 68, 0.4);">
            Öppna uppgift
          </a>
        </div>
      `,
      footerText: "Du får detta mail eftersom du har deadline-påminnelser aktiverade.",
    },
    en: {
      subject: "⏰ Deadline approaching: {{taskTitle}}",
      content: `
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="display: inline-block; background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); border-radius: 50%; padding: 16px; margin-bottom: 16px;">
            <span style="font-size: 32px;">⏰</span>
          </div>
          <h2 style="margin: 0; color: #111827; font-size: 24px; font-weight: 600;">
            Deadline approaching!
          </h2>
        </div>

        <div style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border-radius: 12px; padding: 24px; margin-bottom: 24px; border-left: 4px solid #ef4444;">
          <p style="margin: 0 0 8px; color: #991b1b; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">
            Deadline
          </p>
          <p style="margin: 0; color: #dc2626; font-size: 20px; font-weight: 700;">
            {{deadline}}
          </p>
        </div>

        <div style="background-color: #f9fafb; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
          <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
            Task
          </p>
          <p style="margin: 0 0 16px; color: #111827; font-size: 18px; font-weight: 600;">
            {{taskTitle}}
          </p>

          <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
            Project
          </p>
          <p style="margin: 0; color: #111827; font-size: 16px;">
            {{projectName}}
          </p>
        </div>

        <div style="text-align: center; margin: 32px 0;">
          <a href="{{projectUrl}}" style="display: inline-block; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(239, 68, 68, 0.4);">
            Open task
          </a>
        </div>
      `,
      footerText: "You receive this email because you have deadline reminders enabled.",
    },
  },

  "project-status-changed": {
    sv: {
      subject: "Projektstatus ändrad: {{projectName}}",
      content: `
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="display: inline-block; background: linear-gradient(135deg, #dbeafe 0%, #93c5fd 100%); border-radius: 50%; padding: 16px; margin-bottom: 16px;">
            <span style="font-size: 32px;">📊</span>
          </div>
          <h2 style="margin: 0; color: #111827; font-size: 24px; font-weight: 600;">
            Projektstatus har ändrats
          </h2>
        </div>

        <div style="background-color: #f9fafb; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
          <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
            Projekt
          </p>
          <p style="margin: 0 0 24px; color: #111827; font-size: 18px; font-weight: 600;">
            {{projectName}}
          </p>

          <div style="display: flex; align-items: center; justify-content: center; gap: 16px;">
            <div style="text-align: center;">
              <p style="margin: 0 0 4px; color: #6b7280; font-size: 12px;">Tidigare</p>
              <span style="display: inline-block; background-color: #e5e7eb; color: #374151; padding: 6px 12px; border-radius: 6px; font-size: 14px; font-weight: 500;">
                {{previousStatus}}
              </span>
            </div>
            <span style="color: #9ca3af; font-size: 20px;">→</span>
            <div style="text-align: center;">
              <p style="margin: 0 0 4px; color: #6b7280; font-size: 12px;">Nu</p>
              <span style="display: inline-block; background: linear-gradient(135deg, ${BRAND.primary} 0%, ${BRAND.primaryLight} 100%); color: #ffffff; padding: 6px 12px; border-radius: 6px; font-size: 14px; font-weight: 500;">
                {{newStatus}}
              </span>
            </div>
          </div>
        </div>

        <div style="text-align: center; margin: 32px 0;">
          <a href="{{projectUrl}}" style="display: inline-block; background: linear-gradient(135deg, ${BRAND.primary} 0%, ${BRAND.primaryLight} 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(30, 58, 138, 0.4);">
            Öppna projekt
          </a>
        </div>
      `,
      footerText: "Du får detta mail eftersom du har notifikationer aktiverade.",
    },
    en: {
      subject: "Project status changed: {{projectName}}",
      content: `
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="display: inline-block; background: linear-gradient(135deg, #dbeafe 0%, #93c5fd 100%); border-radius: 50%; padding: 16px; margin-bottom: 16px;">
            <span style="font-size: 32px;">📊</span>
          </div>
          <h2 style="margin: 0; color: #111827; font-size: 24px; font-weight: 600;">
            Project status has changed
          </h2>
        </div>

        <div style="background-color: #f9fafb; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
          <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
            Project
          </p>
          <p style="margin: 0 0 24px; color: #111827; font-size: 18px; font-weight: 600;">
            {{projectName}}
          </p>

          <div style="display: flex; align-items: center; justify-content: center; gap: 16px;">
            <div style="text-align: center;">
              <p style="margin: 0 0 4px; color: #6b7280; font-size: 12px;">Previous</p>
              <span style="display: inline-block; background-color: #e5e7eb; color: #374151; padding: 6px 12px; border-radius: 6px; font-size: 14px; font-weight: 500;">
                {{previousStatus}}
              </span>
            </div>
            <span style="color: #9ca3af; font-size: 20px;">→</span>
            <div style="text-align: center;">
              <p style="margin: 0 0 4px; color: #6b7280; font-size: 12px;">Now</p>
              <span style="display: inline-block; background: linear-gradient(135deg, ${BRAND.primary} 0%, ${BRAND.primaryLight} 100%); color: #ffffff; padding: 6px 12px; border-radius: 6px; font-size: 14px; font-weight: 500;">
                {{newStatus}}
              </span>
            </div>
          </div>
        </div>

        <div style="text-align: center; margin: 32px 0;">
          <a href="{{projectUrl}}" style="display: inline-block; background: linear-gradient(135deg, ${BRAND.primary} 0%, ${BRAND.primaryLight} 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(30, 58, 138, 0.4);">
            Open project
          </a>
        </div>
      `,
      footerText: "You receive this email because you have notifications enabled.",
    },
  },
};

// ─── Render Function ──────────────────────────────────────────────────────────

export async function renderEmailTemplate(options: RenderOptions): Promise<RenderedTemplate> {
  const { name, locale, variables, fallbackSubject, fallbackHtml } = options;

  // Try to get custom template from database if tenantId provided
  if (options.tenantId) {
    try {
      const db = tenantDb(options.tenantId);
      const customTemplate = await db.emailTemplate.findFirst({
        where: { name, locale },
      });

      if (customTemplate) {
        return {
          subject: replaceVariables(customTemplate.subject, variables),
          html: replaceVariables(customTemplate.htmlTemplate, variables),
        };
      }
    } catch {
      // Fall through to default templates
    }
  }

  // Use default templates
  const template = TEMPLATES[name]?.[locale];

  if (!template) {
    // Fallback to provided fallback or simple text
    return {
      subject: fallbackSubject ?? `Notification from ArbetsYtan`,
      html: fallbackHtml ?? `<p>You have a new notification.</p>`,
    };
  }

  const allVariables: TemplateVariables = {
    ...variables,
    locale,
    year: new Date().getFullYear().toString(),
    appName: variables.appName ?? "ArbetsYtan",
  };

  const content = replaceVariables(template.content, allVariables);
  const subject = replaceVariables(template.subject, allVariables);
  const footerText = replaceVariables(template.footerText, allVariables);

  const html = replaceVariables(BASE_TEMPLATE, {
    ...allVariables,
    subject,
    content,
    footerText,
  });

  return { subject, html };
}

// ─── Helper Functions for AI Tools ───────────────────────────────────────────

/**
 * Get the default template for a given name and locale.
 * Used by AI tools to show what the default template looks like.
 */
export function getDefaultEmailTemplate(
  name: TemplateName,
  locale: "sv" | "en"
): { subject: string; htmlTemplate: string; content: string; footerText: string } | null {
  const template = TEMPLATES[name]?.[locale];
  if (!template) return null;

  // Build the full HTML template for use in database storage
  const allVariables: TemplateVariables = {
    locale,
    year: new Date().getFullYear().toString(),
    appName: "ArbetsYtan",
  };

  const content = template.content;
  const footerText = template.footerText;

  const htmlTemplate = replaceVariables(BASE_TEMPLATE, {
    ...allVariables,
    subject: template.subject,
    content,
    footerText,
  });

  return {
    subject: template.subject,
    htmlTemplate,
    content: template.content,
    footerText: template.footerText,
  };
}

/**
 * Apply variables to a template string.
 * Exported for AI tools to preview templates with sample data.
 */
export function applyTemplateVariables(
  template: string,
  variables: TemplateVariables
): string {
  return replaceVariables(template, variables);
}
