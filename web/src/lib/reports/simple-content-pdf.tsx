import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import {
  parseMarkdown,
  type MarkdownNode,
  type TextSegment,
} from "./markdown-parser";

export type PdfTemplate = "projektrapport" | "offert" | "protokoll" | null;

// ============================================================================
// Base styles (null / fritt format)
// ============================================================================

const baseStyles = StyleSheet.create({
  page: {
    fontSize: 11,
    padding: 28,
    fontFamily: "Helvetica",
    color: "#111827",
    lineHeight: 1.5,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 16,
  },
  heading1: {
    fontSize: 16,
    fontWeight: 700,
    marginTop: 12,
    marginBottom: 8,
  },
  heading2: {
    fontSize: 14,
    fontWeight: 700,
    marginTop: 10,
    marginBottom: 6,
  },
  heading3: {
    fontSize: 12,
    fontWeight: 700,
    marginTop: 8,
    marginBottom: 4,
  },
  paragraph: {
    marginBottom: 10,
  },
  list: {
    marginBottom: 10,
  },
  listItem: {
    flexDirection: "row",
    marginBottom: 4,
  },
  listBullet: {
    width: 20,
  },
  codeBlock: {
    fontFamily: "Courier",
    fontSize: 9,
    backgroundColor: "#f3f4f6",
    padding: 8,
    marginBottom: 10,
    borderRadius: 2,
  },
  table: {
    marginBottom: 10,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#f9fafb",
    borderBottomWidth: 2,
    borderBottomColor: "#d1d5db",
    fontWeight: 700,
  },
  tableCell: {
    flex: 1,
    padding: 4,
    fontSize: 10,
  },
  hr: {
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    marginVertical: 12,
  },
});

// ============================================================================
// Projektrapport styles
// ============================================================================

const projektrapportStyles = StyleSheet.create({
  page: {
    fontSize: 11,
    padding: 36,
    paddingBottom: 60,
    fontFamily: "Helvetica",
    color: "#111827",
    lineHeight: 1.5,
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: "#1e40af",
    paddingBottom: 12,
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: "#1e40af",
  },
  headerSubtitle: {
    fontSize: 10,
    color: "#6b7280",
    marginTop: 4,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: 700,
    color: "#1e3a5f",
    marginTop: 16,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    paddingBottom: 4,
  },
  heading1: {
    fontSize: 14,
    fontWeight: 700,
    color: "#1e3a5f",
    marginTop: 16,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    paddingBottom: 4,
  },
  heading2: {
    fontSize: 13,
    fontWeight: 700,
    color: "#1e3a5f",
    marginTop: 12,
    marginBottom: 6,
  },
  heading3: {
    fontSize: 12,
    fontWeight: 700,
    color: "#1e3a5f",
    marginTop: 10,
    marginBottom: 4,
  },
  paragraph: {
    marginBottom: 10,
  },
  list: {
    marginBottom: 10,
  },
  listItem: {
    flexDirection: "row",
    marginBottom: 4,
  },
  listBullet: {
    width: 20,
  },
  codeBlock: {
    fontFamily: "Courier",
    fontSize: 9,
    backgroundColor: "#f3f4f6",
    padding: 8,
    marginBottom: 10,
  },
  table: {
    marginBottom: 10,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#f9fafb",
    borderBottomWidth: 2,
    borderBottomColor: "#1e40af",
    fontWeight: 700,
  },
  tableCell: {
    flex: 1,
    padding: 4,
    fontSize: 10,
  },
  hr: {
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    marginVertical: 12,
  },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 36,
    right: 36,
    fontSize: 9,
    color: "#9ca3af",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

// ============================================================================
// Offert styles
// ============================================================================

const offertStyles = StyleSheet.create({
  page: {
    fontSize: 11,
    padding: 36,
    paddingBottom: 80,
    fontFamily: "Helvetica",
    color: "#111827",
    lineHeight: 1.5,
  },
  header: {
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: "#111827",
  },
  headerSubtitle: {
    fontSize: 10,
    color: "#6b7280",
    marginTop: 4,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: 700,
    marginTop: 14,
    marginBottom: 6,
  },
  heading1: {
    fontSize: 13,
    fontWeight: 700,
    marginTop: 14,
    marginBottom: 6,
  },
  heading2: {
    fontSize: 12,
    fontWeight: 700,
    marginTop: 12,
    marginBottom: 5,
  },
  heading3: {
    fontSize: 11,
    fontWeight: 700,
    marginTop: 10,
    marginBottom: 4,
  },
  paragraph: {
    marginBottom: 10,
  },
  list: {
    marginBottom: 10,
  },
  listItem: {
    flexDirection: "row",
    marginBottom: 4,
  },
  listBullet: {
    width: 20,
  },
  codeBlock: {
    fontFamily: "Courier",
    fontSize: 9,
    backgroundColor: "#f3f4f6",
    padding: 8,
    marginBottom: 10,
  },
  table: {
    marginBottom: 10,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#f9fafb",
    borderBottomWidth: 2,
    borderBottomColor: "#d1d5db",
    fontWeight: 700,
  },
  tableCell: {
    flex: 1,
    padding: 4,
    fontSize: 10,
  },
  hr: {
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
    marginVertical: 12,
  },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 36,
    right: 36,
    fontSize: 9,
    color: "#6b7280",
    borderTopWidth: 1,
    borderTopColor: "#d1d5db",
    paddingTop: 8,
  },
  footerTerms: {
    marginBottom: 4,
  },
  footerDate: {
    color: "#9ca3af",
  },
});

// ============================================================================
// Protokoll styles
// ============================================================================

const protokollStyles = StyleSheet.create({
  page: {
    fontSize: 11,
    padding: 36,
    paddingBottom: 60,
    fontFamily: "Helvetica",
    color: "#111827",
    lineHeight: 1.5,
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: "#374151",
    paddingBottom: 10,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 700,
  },
  headerSubtitle: {
    fontSize: 10,
    color: "#6b7280",
    marginTop: 4,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: 700,
    marginTop: 14,
    marginBottom: 6,
    backgroundColor: "#f3f4f6",
    padding: 4,
  },
  heading1: {
    fontSize: 13,
    fontWeight: 700,
    marginTop: 14,
    marginBottom: 6,
    backgroundColor: "#f3f4f6",
    padding: 4,
  },
  heading2: {
    fontSize: 12,
    fontWeight: 700,
    marginTop: 12,
    marginBottom: 5,
  },
  heading3: {
    fontSize: 11,
    fontWeight: 700,
    marginTop: 10,
    marginBottom: 4,
  },
  paragraph: {
    marginBottom: 10,
  },
  list: {
    marginBottom: 10,
  },
  listItem: {
    flexDirection: "row",
    marginBottom: 4,
  },
  listBullet: {
    width: 20,
  },
  codeBlock: {
    fontFamily: "Courier",
    fontSize: 9,
    backgroundColor: "#f3f4f6",
    padding: 8,
    marginBottom: 10,
  },
  table: {
    marginBottom: 10,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    borderBottomWidth: 2,
    borderBottomColor: "#374151",
    fontWeight: 700,
  },
  tableCell: {
    flex: 1,
    padding: 4,
    fontSize: 10,
  },
  hr: {
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    marginVertical: 12,
  },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 36,
    right: 36,
    fontSize: 9,
    color: "#9ca3af",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 8,
  },
});

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
 * Render text segments with inline styles (bold, italic, code).
 */
function renderTextSegments(segments: TextSegment[]) {
  return segments.map((seg, idx) => {
    const style: any = {};
    if (seg.style.bold) style.fontWeight = 700;
    if (seg.style.italic) style.fontStyle = "italic";
    if (seg.style.code) {
      style.fontFamily = "Courier";
      style.backgroundColor = "#f3f4f6";
      style.padding = 2;
      style.fontSize = 9;
    }
    return (
      <Text key={idx} style={style}>
        {seg.text}
      </Text>
    );
  });
}

/**
 * Render a single markdown node as PDF elements.
 */
function renderMarkdownNode(node: MarkdownNode, index: number, styles: any) {
  switch (node.type) {
    case "heading":
      const headingStyle =
        node.level === 1
          ? styles.heading1 || baseStyles.heading1
          : node.level === 2
            ? styles.heading2 || baseStyles.heading2
            : styles.heading3 || baseStyles.heading3;
      return (
        <View key={index} style={headingStyle}>
          <Text>{node.segments && renderTextSegments(node.segments)}</Text>
        </View>
      );

    case "paragraph":
      return (
        <View key={index} style={styles.paragraph || baseStyles.paragraph}>
          <Text>{node.segments && renderTextSegments(node.segments)}</Text>
        </View>
      );

    case "list":
      return (
        <View key={index} style={styles.list || baseStyles.list}>
          {node.items?.map((item, i) => (
            <View
              key={i}
              style={styles.listItem || baseStyles.listItem}
            >
              <Text style={styles.listBullet || baseStyles.listBullet}>
                {node.ordered ? `${i + 1}.` : "•"}
              </Text>
              <Text>{item[0]}</Text>
            </View>
          ))}
        </View>
      );

    case "table":
      return (
        <View key={index} style={styles.table || baseStyles.table}>
          {node.headers && (
            <View style={styles.tableHeaderRow || baseStyles.tableHeaderRow}>
              {node.headers.map((header, i) => (
                <View key={i} style={styles.tableCell || baseStyles.tableCell}>
                  <Text>{header}</Text>
                </View>
              ))}
            </View>
          )}
          {node.rows?.map((row, i) => (
            <View key={i} style={styles.tableRow || baseStyles.tableRow}>
              {row.map((cell, j) => (
                <View key={j} style={styles.tableCell || baseStyles.tableCell}>
                  <Text>{cell}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      );

    case "code-block":
      return (
        <View key={index} style={styles.codeBlock || baseStyles.codeBlock}>
          <Text>{node.code}</Text>
        </View>
      );

    case "hr":
      return <View key={index} style={styles.hr || baseStyles.hr} />;

    default:
      return null;
  }
}


// ============================================================================
// Build functions per template
// ============================================================================

function buildBasePdf(title: string, content: string) {
  const nodes = parseMarkdown(content);

  return (
    <Document>
      <Page size="A4" style={baseStyles.page}>
        <Text style={baseStyles.title}>{title || "Dokument"}</Text>
        {nodes.map((node, i) => renderMarkdownNode(node, i, baseStyles))}
      </Page>
    </Document>
  );
}

function buildProjektrapportPdf(title: string, content: string) {
  const nodes = parseMarkdown(content);
  const date = formatDate();

  return (
    <Document>
      <Page size="A4" style={projektrapportStyles.page}>
        <View style={projektrapportStyles.header}>
          <Text style={projektrapportStyles.headerTitle}>
            {title || "Projektrapport"}
          </Text>
          <Text style={projektrapportStyles.headerSubtitle}>
            Datum: {date}
          </Text>
        </View>
        {nodes.map((node, i) => renderMarkdownNode(node, i, projektrapportStyles))}
        <View style={projektrapportStyles.footer} fixed>
          <Text>{title || "Projektrapport"}</Text>
          <Text>{date}</Text>
        </View>
      </Page>
    </Document>
  );
}

function buildOffertPdf(title: string, content: string) {
  const nodes = parseMarkdown(content);
  const date = formatDate();

  return (
    <Document>
      <Page size="A4" style={offertStyles.page}>
        <View style={offertStyles.header}>
          <Text style={offertStyles.headerTitle}>
            {title || "Offert"}
          </Text>
          <Text style={offertStyles.headerSubtitle}>Datum: {date}</Text>
        </View>
        {nodes.map((node, i) => renderMarkdownNode(node, i, offertStyles))}
        <View style={offertStyles.footer} fixed>
          <Text style={offertStyles.footerTerms}>
            Offerten gäller i 30 dagar från ovan angivet datum.
          </Text>
          <Text style={offertStyles.footerDate}>{date}</Text>
        </View>
      </Page>
    </Document>
  );
}

function buildProtokollPdf(title: string, content: string) {
  const nodes = parseMarkdown(content);
  const date = formatDate();

  return (
    <Document>
      <Page size="A4" style={protokollStyles.page}>
        <View style={protokollStyles.header}>
          <Text style={protokollStyles.headerTitle}>
            {title || "Protokoll"}
          </Text>
          <Text style={protokollStyles.headerSubtitle}>Datum: {date}</Text>
        </View>
        {nodes.map((node, i) => renderMarkdownNode(node, i, protokollStyles))}
        <View style={protokollStyles.footer} fixed>
          <Text>{date}</Text>
        </View>
      </Page>
    </Document>
  );
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Builds a PDF from a title and body text.
 * Optionally applies a template for layout/styling.
 */
export async function buildSimplePdf(
  title: string,
  content: string,
  template?: PdfTemplate
): Promise<Uint8Array> {
  let document;

  switch (template) {
    case "projektrapport":
      document = buildProjektrapportPdf(title, content);
      break;
    case "offert":
      document = buildOffertPdf(title, content);
      break;
    case "protokoll":
      document = buildProtokollPdf(title, content);
      break;
    default:
      document = buildBasePdf(title, content);
      break;
  }

  const buffer = await renderToBuffer(document);
  return new Uint8Array(buffer);
}
