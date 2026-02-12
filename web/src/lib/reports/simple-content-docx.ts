import { Document, HeadingLevel, Packer, Paragraph } from "docx";

/**
 * Builds a simple Word document from a title and paragraph strings.
 * Used for AI-generated documents saved to project files.
 */
export async function buildSimpleDocx(
  title: string,
  paragraphs: string[]
): Promise<Uint8Array> {
  const children: Paragraph[] = [
    new Paragraph({
      text: title || "Dokument",
      heading: HeadingLevel.TITLE,
    }),
  ];
  for (const text of paragraphs) {
    if (text.trim()) {
      children.push(new Paragraph({ text: text.trim() }));
    }
  }
  if (children.length === 1) {
    children.push(new Paragraph({ text: "(Inget innehåll.)" }));
  }

  const doc = new Document({
    sections: [
      {
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return new Uint8Array(buffer);
}
