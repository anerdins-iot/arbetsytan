import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
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
  paragraph: {
    marginBottom: 10,
  },
});

/**
 * Builds a simple PDF from a title and body text (paragraphs separated by double newlines).
 * Used for AI-generated documents saved to project files.
 */
export async function buildSimplePdf(
  title: string,
  content: string
): Promise<Uint8Array> {
  const paragraphs = content
    .trim()
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) {
    paragraphs.push("(Inget innehåll.)");
  }

  const document = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{title || "Dokument"}</Text>
        {paragraphs.map((text, i) => (
          <View key={i} style={styles.paragraph}>
            <Text>{text}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );

  const buffer = await renderToBuffer(document);
  return new Uint8Array(buffer);
}
