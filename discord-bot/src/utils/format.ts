/**
 * Format utility for Discord messages.
 *
 * Discord does NOT render markdown tables. This module detects markdown tables
 * in AI responses and converts them to fixed-width code blocks that are
 * readable in Discord.
 *
 * All other markdown (bold, italic, inline code, code blocks, lists) is
 * preserved as-is since Discord supports those natively.
 */

/**
 * Regex that matches a markdown table block:
 * - A header row with pipes
 * - A separator row (pipes + dashes/colons)
 * - One or more data rows with pipes
 *
 * Captures the full table including surrounding newlines.
 */
const MD_TABLE_REGEX =
  /(?:^|\n)((?:\|[^\n]+\|\s*\n)\|[\s:_-]+\|[\s:_-]*(?:\|[\s:_-]*)*\s*\n(?:\|[^\n]+\|\s*\n?)+)/g;

/**
 * Detect if a line is a markdown table separator row (e.g. `| :--- | :--- |`).
 */
function isSeparatorRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return false;
  const cells = trimmed
    .slice(1, -1)
    .split("|")
    .map((c) => c.trim());
  return cells.every((cell) => /^:?-{1,}:?$/.test(cell));
}

/**
 * Parse a markdown table string into rows of cell values.
 * Returns { headers: string[], rows: string[][] }.
 */
function parseTable(tableStr: string): {
  headers: string[];
  rows: string[][];
} {
  const lines = tableStr
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const parseLine = (line: string): string[] => {
    // Remove leading/trailing pipes, then split by pipe
    let trimmed = line.trim();
    if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
    if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
    return trimmed.split("|").map((cell) => cell.trim());
  };

  const headers = parseLine(lines[0]);
  const rows: string[][] = [];

  for (let i = 1; i < lines.length; i++) {
    if (isSeparatorRow(lines[i])) continue;
    rows.push(parseLine(lines[i]));
  }

  return { headers, rows };
}

/**
 * Convert a parsed table to a fixed-width code block.
 * Pads columns to align them neatly.
 */
function tableToCodeBlock(headers: string[], rows: string[][]): string {
  const colCount = headers.length;

  // Calculate max width per column (minimum 3 chars)
  const colWidths: number[] = [];
  for (let c = 0; c < colCount; c++) {
    let max = displayWidth(headers[c]);
    for (const row of rows) {
      const cellWidth = displayWidth(row[c] ?? "");
      if (cellWidth > max) max = cellWidth;
    }
    colWidths.push(Math.max(max, 3));
  }

  // Build header line
  const headerLine = headers
    .map((h, i) => padEnd(h, colWidths[i]))
    .join("  ");

  // Build separator
  const separatorLine = colWidths.map((w) => "─".repeat(w)).join("──");

  // Build data rows
  const dataLines = rows.map((row) =>
    row
      .slice(0, colCount)
      .map((cell, i) => padEnd(cell ?? "", colWidths[i]))
      .join("  ")
  );

  const tableContent = [headerLine, separatorLine, ...dataLines].join("\n");
  return "```\n" + tableContent + "\n```";
}

/**
 * Get the display width of a string, accounting for wide characters.
 * Simple heuristic: counts characters. Most CJK/emoji would be double-width
 * but for Swedish text this is sufficient.
 */
function displayWidth(str: string): number {
  return str.length;
}

/**
 * Pad a string to a given display width with trailing spaces.
 */
function padEnd(str: string, width: number): string {
  const padding = width - displayWidth(str);
  return padding > 0 ? str + " ".repeat(padding) : str;
}

/**
 * Convert all markdown tables in text to Discord-friendly code blocks.
 * Preserves all other markdown formatting.
 *
 * @param text - The AI response text that may contain markdown tables
 * @returns The text with tables converted to code blocks
 */
export function formatForDiscord(text: string): string {
  // Don't process if no pipe characters (quick bail)
  if (!text.includes("|")) return text;

  return text.replace(MD_TABLE_REGEX, (match) => {
    try {
      const { headers, rows } = parseTable(match);
      // Only convert if it looks like a real table (at least 1 header and 1 row)
      if (headers.length < 2 || rows.length < 1) return match;
      return "\n" + tableToCodeBlock(headers, rows);
    } catch {
      // If parsing fails, return original text
      return match;
    }
  });
}
