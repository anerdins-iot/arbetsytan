/**
 * File processors for extracting text from various file types.
 * Used for creating searchable DocumentChunks with embeddings.
 */
import { Readable } from "stream";
import ExcelJS from "exceljs";
import mammoth from "mammoth";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { logger } from "@/lib/logger";

// Excel (.xlsx, .xls) → text
export async function processExcel(buffer: Buffer): Promise<string> {
  const stream = Readable.from(buffer);
  const workbook = await new ExcelJS.Workbook().xlsx.read(stream);

  const lines: string[] = [];
  workbook.eachSheet((sheet) => {
    lines.push(`## ${sheet.name}`);
    sheet.eachRow((row) => {
      const values = row.values as (string | number | null)[];
      // Skip first element (Excel rows are 1-indexed, values[0] is empty)
      const rowText = values
        .slice(1)
        .map((v) => v ?? "")
        .join("\t");
      if (rowText.trim()) lines.push(rowText);
    });
    lines.push("");
  });

  return lines.join("\n");
}

// Word (.docx) → text
export async function processWord(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

// CSV → text
export async function processCSV(buffer: Buffer): Promise<string> {
  return buffer.toString("utf-8");
}

/**
 * Analyze an image using Claude Opus 4.6 vision.
 * Called on-demand by AI tools (not at upload time).
 * @param buffer - Image file buffer
 * @param mimeType - Image MIME type
 * @param ocrText - Optional OCR text extracted at upload time for better context
 * @param userQuestion - Optional specific question from the user
 */
export async function analyzeImageWithVision(
  buffer: Buffer,
  mimeType: string,
  ocrText?: string | null,
  userQuestion?: string
): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    logger.warn("ANTHROPIC_API_KEY not set - skipping image analysis");
    return ocrText || "Bildanalys ej tillgänglig (ANTHROPIC_API_KEY saknas).";
  }

  try {
    const base64 = buffer.toString("base64");

    // Build prompt with OCR context if available
    let prompt = "Beskriv denna bild i detalj på svenska. Inkludera alla synliga objekt, personer, färger, och kontext.";

    if (ocrText && ocrText.trim()) {
      prompt += `\n\nOCR har extraherat följande text från bilden:\n---\n${ocrText}\n---\nAnvänd denna text som kontext för din analys.`;
    }

    if (userQuestion) {
      prompt += `\n\nAnvändaren frågar specifikt: ${userQuestion}`;
    }

    prompt += "\n\nOm det är en teknisk ritning, diagram eller dokument, beskriv strukturen och innehållet noggrant.";

    const result = await generateText({
      model: anthropic("claude-opus-4-6"),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              image: `data:${mimeType};base64,${base64}`,
            },
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      ],
      maxOutputTokens: 2000,
    });
    return result.text;
  } catch (error) {
    logger.error("Image analysis with vision failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    // Fall back to OCR text if vision fails
    return ocrText || "Bildanalys misslyckades.";
  }
}

// Legacy function for backwards compatibility
export async function processImage(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  return analyzeImageWithVision(buffer, mimeType);
}

// File type detection and routing
export type ProcessableFileType =
  | "excel"
  | "word"
  | "csv"
  | "image"
  | "pdf"
  | "unknown";

export function detectFileType(
  mimeType: string,
  fileName: string
): ProcessableFileType {
  // Excel
  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel" ||
    /\.xlsx?$/i.test(fileName)
  ) {
    return "excel";
  }

  // Word
  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword" ||
    /\.docx?$/i.test(fileName)
  ) {
    return "word";
  }

  // CSV
  if (mimeType === "text/csv" || /\.csv$/i.test(fileName)) {
    return "csv";
  }

  // Image
  if (mimeType.startsWith("image/")) {
    return "image";
  }

  // PDF (handled by existing OCR)
  if (mimeType === "application/pdf" || /\.pdf$/i.test(fileName)) {
    return "pdf";
  }

  return "unknown";
}

export function isProcessableFile(mimeType: string, fileName: string): boolean {
  return detectFileType(mimeType, fileName) !== "unknown";
}
