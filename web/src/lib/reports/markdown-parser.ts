/**
 * Markdown parser for PDF and Word generation.
 * Converts markdown text to a structured AST that can be consumed by PDF/Word builders.
 */

export type MarkdownNodeType =
  | "heading"
  | "paragraph"
  | "list"
  | "table"
  | "hr"
  | "code-block";

export type TextStyle = {
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
};

export type TextSegment = {
  text: string;
  style: TextStyle;
};

export type MarkdownNode = {
  type: MarkdownNodeType;
  level?: number; // For headings (1-3)
  ordered?: boolean; // For lists
  items?: string[][]; // For lists (array of items, each item is array of TextSegments converted to strings for simplicity)
  segments?: TextSegment[]; // For paragraphs
  rows?: string[][]; // For tables (array of rows, each row is array of cells)
  headers?: string[]; // For table headers
  language?: string; // For code blocks
  code?: string; // For code blocks
};

/**
 * Parse markdown text into structured nodes.
 */
export function parseMarkdown(content: string): MarkdownNode[] {
  if (!content || !content.trim()) {
    return [
      {
        type: "paragraph",
        segments: [{ text: "(Inget innehåll.)", style: {} }],
      },
    ];
  }

  const nodes: MarkdownNode[] = [];
  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Skip empty lines
    if (!line.trim()) {
      i++;
      continue;
    }

    // Horizontal rule: ---, ***, or ___
    if (/^(\-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      nodes.push({ type: "hr" });
      i++;
      continue;
    }

    // Headings: # Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      const text = headingMatch[2]!.trim();
      nodes.push({
        type: "heading",
        level,
        segments: parseInlineStyles(text),
      });
      i++;
      continue;
    }

    // Code block: ```language
    if (line.trim().startsWith("```")) {
      const language = line.trim().slice(3).trim() || "text";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith("```")) {
        codeLines.push(lines[i]!);
        i++;
      }
      i++; // Skip closing ```
      nodes.push({
        type: "code-block",
        language,
        code: codeLines.join("\n"),
      });
      continue;
    }

    // Unordered list: - item or * item
    if (/^[\-\*]\s+/.test(line)) {
      const listItems: string[][] = [];
      while (i < lines.length && /^[\-\*]\s+/.test(lines[i]!)) {
        const itemText = lines[i]!.replace(/^[\-\*]\s+/, "").trim();
        listItems.push([itemText]); // Store as array for consistency
        i++;
      }
      nodes.push({
        type: "list",
        ordered: false,
        items: listItems,
      });
      continue;
    }

    // Ordered list: 1. item
    if (/^\d+\.\s+/.test(line)) {
      const listItems: string[][] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i]!)) {
        const itemText = lines[i]!.replace(/^\d+\.\s+/, "").trim();
        listItems.push([itemText]);
        i++;
      }
      nodes.push({
        type: "list",
        ordered: true,
        items: listItems,
      });
      continue;
    }

    // Table: | col | col |
    if (line.trim().startsWith("|")) {
      const tableRows: string[][] = [];
      let headers: string[] | undefined;

      // First row is headers
      const headerRow = line
        .split("|")
        .map((cell) => cell.trim())
        .filter((cell) => cell);
      headers = headerRow;

      i++;
      // Skip separator row: |---|---|
      if (i < lines.length && /^\|[\s\-:|]+\|/.test(lines[i]!)) {
        i++;
      }

      // Parse data rows
      while (i < lines.length && lines[i]!.trim().startsWith("|")) {
        const row = lines[i]!
          .split("|")
          .map((cell) => cell.trim())
          .filter((cell) => cell);
        tableRows.push(row);
        i++;
      }

      nodes.push({
        type: "table",
        headers,
        rows: tableRows,
      });
      continue;
    }

    // Regular paragraph
    const paragraphLines: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !isSpecialLine(lines[i]!)) {
      paragraphLines.push(lines[i]!.trim());
      i++;
    }

    if (paragraphLines.length > 0) {
      const text = paragraphLines.join(" ");
      nodes.push({
        type: "paragraph",
        segments: parseInlineStyles(text),
      });
    }
  }

  return nodes;
}

/**
 * Check if a line starts a special markdown element.
 */
function isSpecialLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    /^#{1,3}\s+/.test(trimmed) || // Heading
    /^[\-\*]\s+/.test(trimmed) || // Unordered list
    /^\d+\.\s+/.test(trimmed) || // Ordered list
    trimmed.startsWith("|") || // Table
    trimmed.startsWith("```") || // Code block
    /^(\-{3,}|\*{3,}|_{3,})$/.test(trimmed) // HR
  );
}

/**
 * Parse inline styles: **bold**, *italic*, ***bold+italic***, `code`.
 * Returns an array of text segments with style information.
 */
export function parseInlineStyles(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let current = "";
  let i = 0;

  while (i < text.length) {
    // ***text*** (bold + italic)
    if (text.slice(i, i + 3) === "***") {
      if (current) {
        segments.push({ text: current, style: {} });
        current = "";
      }
      const end = text.indexOf("***", i + 3);
      if (end !== -1) {
        const content = text.slice(i + 3, end);
        segments.push({ text: content, style: { bold: true, italic: true } });
        i = end + 3;
        continue;
      }
    }

    // **text** (bold)
    if (text.slice(i, i + 2) === "**") {
      if (current) {
        segments.push({ text: current, style: {} });
        current = "";
      }
      const end = text.indexOf("**", i + 2);
      if (end !== -1) {
        const content = text.slice(i + 2, end);
        segments.push({ text: content, style: { bold: true } });
        i = end + 2;
        continue;
      }
    }

    // *text* (italic)
    if (text[i] === "*") {
      if (current) {
        segments.push({ text: current, style: {} });
        current = "";
      }
      const end = text.indexOf("*", i + 1);
      if (end !== -1) {
        const content = text.slice(i + 1, end);
        segments.push({ text: content, style: { italic: true } });
        i = end + 1;
        continue;
      }
    }

    // `code`
    if (text[i] === "`") {
      if (current) {
        segments.push({ text: current, style: {} });
        current = "";
      }
      const end = text.indexOf("`", i + 1);
      if (end !== -1) {
        const content = text.slice(i + 1, end);
        segments.push({ text: content, style: { code: true } });
        i = end + 1;
        continue;
      }
    }

    current += text[i];
    i++;
  }

  if (current) {
    segments.push({ text: current, style: {} });
  }

  return segments.length > 0 ? segments : [{ text, style: {} }];
}
