import {
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
  Footer,
  Tab,
  TabStopPosition,
  TabStopType,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from "docx";
import {
  parseMarkdown,
  type MarkdownNode,
  type TextSegment,
} from "./markdown-parser";

export type DocxTemplate = "projektrapport" | "offert" | "protokoll" | null;

// ============================================================================
// Helpers
// ============================================================================

function formatDate(): string {
  return new Date().toLocaleDateString("sv-SE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Convert text segments with styles to docx TextRun array.
 */
function segmentsToTextRuns(segments: TextSegment[]): TextRun[] {
  return segments.map((seg) => {
    const options: any = { text: seg.text };
    if (seg.style.bold) options.bold = true;
    if (seg.style.italic) options.italics = true;
    if (seg.style.code) {
      options.font = "Courier New";
      options.size = 18; // 9pt
      options.shading = {
        type: "clear" as const,
        color: "auto",
        fill: "f3f4f6",
      };
    }
    return new TextRun(options);
  });
}

/**
 * Convert a markdown node to docx Paragraph(s) or Table.
 */
function markdownNodeToDocx(
  node: MarkdownNode
): Paragraph | Table | Paragraph[] {
  switch (node.type) {
    case "heading": {
      const level =
        node.level === 1
          ? HeadingLevel.HEADING_1
          : node.level === 2
            ? HeadingLevel.HEADING_2
            : HeadingLevel.HEADING_3;
      return new Paragraph({
        children: node.segments
          ? segmentsToTextRuns(node.segments)
          : [new TextRun("")],
        heading: level,
        spacing: { before: 300, after: 120 },
      });
    }

    case "paragraph": {
      return new Paragraph({
        children: node.segments
          ? segmentsToTextRuns(node.segments)
          : [new TextRun("")],
        spacing: { after: 200 },
      });
    }

    case "list": {
      const items: Paragraph[] = [];
      node.items?.forEach((item, i) => {
        const bullet = node.ordered ? `${i + 1}.` : "•";
        items.push(
          new Paragraph({
            children: [new TextRun(`${bullet} ${item[0] || ""}`)],
            spacing: { after: 120 },
          })
        );
      });
      return items;
    }

    case "table": {
      const rows: TableRow[] = [];

      // Header row
      if (node.headers) {
        rows.push(
          new TableRow({
            children: node.headers.map(
              (header) =>
                new TableCell({
                  children: [new Paragraph({ text: header })],
                  shading: {
                    type: "clear" as const,
                    color: "auto",
                    fill: "f9fafb",
                  },
                })
            ),
          })
        );
      }

      // Data rows
      node.rows?.forEach((row) => {
        rows.push(
          new TableRow({
            children: row.map(
              (cell) =>
                new TableCell({
                  children: [new Paragraph({ text: cell })],
                })
            ),
          })
        );
      });

      return new Table({
        rows,
        width: {
          size: 100,
          type: WidthType.PERCENTAGE,
        },
      });
    }

    case "code-block": {
      return new Paragraph({
        children: [
          new TextRun({
            text: node.code || "",
            font: "Courier New",
            size: 18,
          }),
        ],
        shading: {
          type: "clear" as const,
          color: "auto",
          fill: "f3f4f6",
        },
        spacing: { before: 120, after: 200 },
      });
    }

    case "hr": {
      return new Paragraph({
        border: {
          bottom: {
            style: BorderStyle.SINGLE,
            size: 1,
            color: "e5e7eb",
          },
        },
        spacing: { before: 240, after: 240 },
      });
    }

    default:
      return new Paragraph({ text: "" });
  }
}

// ============================================================================
// Base (null template) — original behavior
// ============================================================================

function buildBaseDocx(title: string, content: string): Document {
  const nodes = parseMarkdown(content);
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      text: title || "Dokument",
      heading: HeadingLevel.TITLE,
    }),
  ];

  for (const node of nodes) {
    const result = markdownNodeToDocx(node);
    if (Array.isArray(result)) {
      children.push(...result);
    } else {
      children.push(result);
    }
  }

  if (children.length === 1) {
    children.push(new Paragraph({ text: "(Inget innehåll.)" }));
  }

  return new Document({
    sections: [{ children }],
  });
}

// ============================================================================
// Projektrapport template
// ============================================================================

function buildProjektrapportDocx(
  title: string,
  content: string
): Document {
  const date = formatDate();
  const nodes = parseMarkdown(content);
  const children: (Paragraph | Table)[] = [];

  // Title
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: title || "Projektrapport",
          bold: true,
          size: 44,
          color: "1e40af",
        }),
      ],
    })
  );

  // Date subtitle
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Datum: ${date}`,
          size: 20,
          color: "6b7280",
        }),
      ],
      spacing: { after: 400 },
      border: {
        bottom: {
          style: BorderStyle.SINGLE,
          size: 6,
          color: "1e40af",
        },
      },
    })
  );

  // Content blocks
  for (const node of nodes) {
    const result = markdownNodeToDocx(node);
    if (Array.isArray(result)) {
      children.push(...result);
    } else {
      children.push(result);
    }
  }

  if (nodes.length === 0) {
    children.push(new Paragraph({ text: "(Inget innehåll.)" }));
  }

  return new Document({
    sections: [
      {
        children,
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: title || "Projektrapport",
                    size: 18,
                    color: "9ca3af",
                  }),
                  new TextRun({
                    children: [new Tab()],
                  }),
                  new TextRun({
                    text: date,
                    size: 18,
                    color: "9ca3af",
                  }),
                ],
                tabStops: [
                  {
                    type: TabStopType.RIGHT,
                    position: TabStopPosition.MAX,
                  },
                ],
                border: {
                  top: {
                    style: BorderStyle.SINGLE,
                    size: 1,
                    color: "e5e7eb",
                  },
                },
              }),
            ],
          }),
        },
      },
    ],
  });
}

// ============================================================================
// Offert template
// ============================================================================

function buildOffertDocx(title: string, content: string): Document {
  const date = formatDate();
  const nodes = parseMarkdown(content);
  const children: (Paragraph | Table)[] = [];

  // Title
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: title || "Offert",
          bold: true,
          size: 40,
        }),
      ],
    })
  );

  // Date
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Datum: ${date}`,
          size: 20,
          color: "6b7280",
        }),
      ],
      spacing: { after: 400 },
    })
  );

  // Content
  for (const node of nodes) {
    const result = markdownNodeToDocx(node);
    if (Array.isArray(result)) {
      children.push(...result);
    } else {
      children.push(result);
    }
  }

  if (nodes.length === 0) {
    children.push(new Paragraph({ text: "(Inget innehåll.)" }));
  }

  return new Document({
    sections: [
      {
        children,
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: "Offerten gäller i 30 dagar från ovan angivet datum.",
                    size: 18,
                    color: "6b7280",
                    italics: true,
                  }),
                ],
                border: {
                  top: {
                    style: BorderStyle.SINGLE,
                    size: 1,
                    color: "d1d5db",
                  },
                },
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: date,
                    size: 18,
                    color: "9ca3af",
                  }),
                ],
              }),
            ],
          }),
        },
      },
    ],
  });
}

// ============================================================================
// Protokoll template
// ============================================================================

function buildProtokollDocx(title: string, content: string): Document {
  const date = formatDate();
  const nodes = parseMarkdown(content);
  const children: (Paragraph | Table)[] = [];

  // Title
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: title || "Protokoll",
          bold: true,
          size: 36,
        }),
      ],
      border: {
        bottom: {
          style: BorderStyle.SINGLE,
          size: 6,
          color: "374151",
        },
      },
    })
  );

  // Date
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Datum: ${date}`,
          size: 20,
          color: "6b7280",
        }),
      ],
      spacing: { after: 300 },
    })
  );

  // Content
  for (const node of nodes) {
    const result = markdownNodeToDocx(node);
    if (Array.isArray(result)) {
      children.push(...result);
    } else {
      children.push(result);
    }
  }

  if (nodes.length === 0) {
    children.push(new Paragraph({ text: "(Inget innehåll.)" }));
  }

  return new Document({
    sections: [
      {
        children,
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: date,
                    size: 18,
                    color: "9ca3af",
                  }),
                ],
                border: {
                  top: {
                    style: BorderStyle.SINGLE,
                    size: 1,
                    color: "e5e7eb",
                  },
                },
              }),
            ],
          }),
        },
      },
    ],
  });
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Builds a Word document from a title and content.
 * Content can be a string (markdown) or array of strings (legacy).
 * Supports markdown formatting: headings, bold, italic, lists, tables, code blocks.
 */
export async function buildSimpleDocx(
  title: string,
  contentOrParagraphs: string | string[],
  template?: DocxTemplate
): Promise<Uint8Array> {
  let doc: Document;

  // Convert content to string format
  const content =
    typeof contentOrParagraphs === "string"
      ? contentOrParagraphs
      : contentOrParagraphs.join("\n\n");

  if (template) {
    // Template mode: apply specific template styling
    switch (template) {
      case "projektrapport":
        doc = buildProjektrapportDocx(title, content);
        break;
      case "offert":
        doc = buildOffertDocx(title, content);
        break;
      case "protokoll":
        doc = buildProtokollDocx(title, content);
        break;
      default:
        doc = buildBaseDocx(title, content);
    }
  } else {
    // Base mode: simple styling with markdown support
    doc = buildBaseDocx(title, content);
  }

  const buffer = await Packer.toBuffer(doc);
  return new Uint8Array(buffer);
}
