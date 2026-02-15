import type { TenantScopedClient } from "@/lib/db";

/**
 * Kontext som alla service-funktioner behover.
 * Skapas av Actions (fran requireAuth) eller AI-verktyg (fran PersonalToolsContext).
 */
export type ServiceContext = {
  tenantId: string;
  userId: string;
  projectId?: string;
};

/**
 * Sidnumrering for listor.
 */
export type PaginationOptions = {
  limit?: number;
  offset?: number;
};

/**
 * Validera att ett ID ser ut som ett giltigt databasid (cuid eller liknande)
 * och INTE som ett filnamn eller projektnamn.
 *
 * Flyttad fran personal-tools.ts — definieras ENBART har.
 */
export function validateDatabaseId(
  value: string,
  fieldName: string
): { valid: true } | { valid: false; error: string } {
  // Filnamn har filändelser
  if (/\.(jpe?g|png|gif|webp|pdf|docx?|xlsx?|txt|csv)$/i.test(value)) {
    return {
      valid: false,
      error: `${fieldName} "${value}" ser ut som ett filnamn. Använd ID:t (t.ex. från listProjects eller getPersonalFiles).`,
    };
  }
  // ID:n är vanligtvis korta alfanumeriska strängar
  if (value.length > 50) {
    return {
      valid: false,
      error: `${fieldName} "${value.slice(0, 30)}..." är för långt. Använd det korta ID:t.`,
    };
  }
  // Projektnamn har ofta mellanslag och svenska tecken
  if (/\s/.test(value) || /[åäöÅÄÖ]/.test(value)) {
    return {
      valid: false,
      error: `${fieldName} "${value}" ser ut som ett namn, inte ett ID. Använd ID:t från listProjects.`,
    };
  }
  return { valid: true };
}
