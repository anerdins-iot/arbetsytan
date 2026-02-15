/**
 * Post-seed validation: run against DB after seed.
 * Reports PASS/FAIL with concrete counts/rows for:
 * 1) Målarkommentar (Comment) on seed-task
 * 2) Seed files in File
 * 3) OCR/chunks for seed files
 * 4) Embeddings in DocumentChunk
 * 5) FileAnalysis for seed images
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";

type Row = Record<string, unknown>;

async function runQuery<T extends Row>(sql: string): Promise<T[]> {
  const r = await prisma.$queryRawUnsafe<T[]>(sql);
  return Array.isArray(r) ? r : [];
}

async function runCount(sql: string): Promise<number> {
  const rows = await runQuery<{ count: string }>(sql);
  const n = rows[0]?.count;
  return n != null ? Number(n) : 0;
}

async function main() {
  const results: { check: string; pass: boolean; detail: string }[] = [];

  // 1) Målarkommentar: QA-task + author name contains "målare"
  const q1 = await runQuery<{ task_id: string; title: string; comment_id: string; content: string; author_name: string }>(`
    SELECT t.id AS task_id, t.title, c.id AS comment_id, c.content, u.name AS author_name
    FROM "Task" t
    JOIN "Comment" c ON c."taskId" = t.id
    JOIN "User" u ON u.id = c."authorId"
    WHERE t."projectId" = 'seed-project-1'
      AND (t.title ILIKE '%QA%' OR t.title ILIKE '%qa%')
      AND u.name ILIKE '%målare%'
  `);
  const count1 = q1.length;
  const pass1 = count1 >= 1;
  results.push({
    check: "1) Målarkommentar (Comment) på seed-task",
    pass: pass1,
    detail: pass1
      ? `PASS: ${count1} rad(er). task_id=${q1[0].task_id}, comment_id=${q1[0].comment_id}, author=${q1[0].author_name}`
      : `FAIL: 0 rader (förväntat: minst 1). Seed har comment på task2 från "Maja Montör", ingen QA-task och ingen användare med "målare" i namnet.`,
  });

  // 1b) Kommentarer på seed-projekt (alla)
  const q1b = await runQuery<{ task_id: string; title: string; comment_id: string; author_name: string }>(`
    SELECT t.id AS task_id, t.title, c.id AS comment_id, u.name AS author_name
    FROM "Task" t
    JOIN "Comment" c ON c."taskId" = t.id
    JOIN "User" u ON u.id = c."authorId"
    WHERE t."projectId" = 'seed-project-1'
  `);
  if (q1b.length > 0) {
    results[results.length - 1].detail += ` | Kommentarer i projekt: ${q1b.length} (t.ex. ${q1b[0].comment_id} på ${q1b[0].title} av ${q1b[0].author_name}).`;
  }

  // 2) Seed-filer i File (projekt seed-project-1)
  const q2Project = await runQuery<{ id: string; name: string; type: string; has_ocr: boolean }>(`
    SELECT id, name, type, "ocrText" IS NOT NULL AS has_ocr
    FROM "File"
    WHERE "projectId" = 'seed-project-1'
    ORDER BY "createdAt"
  `);
  const q2Personal = await runQuery<{ id: string; name: string; type: string; has_ocr: boolean }>(`
    SELECT id, name, type, "ocrText" IS NOT NULL AS has_ocr
    FROM "File"
    WHERE id IN ('seed-file-ritning', 'seed-file-senaste-bild')
    ORDER BY "createdAt"
  `);
  const pass2Project = q2Project.length >= 1;
  const pass2Personal = q2Personal.length >= 1;
  results.push({
    check: "2) Seed-filer i File",
    pass: pass2Project || pass2Personal,
    detail:
      pass2Project || pass2Personal
        ? `PASS: projekt-filer=${q2Project.length}, personliga seed-filer=${q2Personal.length}. ${JSON.stringify(q2Personal.length ? q2Personal : q2Project)}`
        : `FAIL: 0 projekt-filer och 0 personliga seed-filer.`,
  });

  // 3) OCR/chunks för seed-filer (både projekt och personliga)
  const q3Project = await runQuery<{ id: string; name: string; has_ocr_text: boolean; chunk_count: string }>(`
    SELECT f.id, f.name, (f."ocrText" IS NOT NULL AND length(f."ocrText") > 0) AS has_ocr_text,
           (SELECT count(*)::text FROM "DocumentChunk" dc WHERE dc."fileId" = f.id) AS chunk_count
    FROM "File" f
    WHERE f."projectId" = 'seed-project-1'
  `);
  const q3Personal = await runQuery<{ id: string; name: string; has_ocr_text: boolean; chunk_count: string }>(`
    SELECT f.id, f.name, (f."ocrText" IS NOT NULL AND length(f."ocrText") > 0) AS has_ocr_text,
           (SELECT count(*)::text FROM "DocumentChunk" dc WHERE dc."fileId" = f.id) AS chunk_count
    FROM "File" f
    WHERE f.id IN ('seed-file-ritning', 'seed-file-senaste-bild')
  `);
  const filesWithOcrOrChunks =
    [...q3Project, ...q3Personal].filter(
      (r) => r.has_ocr_text || Number(r.chunk_count) > 0
    ).length;
  const totalFiles = q3Project.length + q3Personal.length;
  const pass3 = totalFiles === 0 || filesWithOcrOrChunks >= 1;
  results.push({
    check: "3) OCR/chunks för seed-filer",
    pass: pass3,
    detail: `${
      pass3 ? "PASS" : "FAIL"
    }: Filer med OCR eller chunks=${filesWithOcrOrChunks} av ${totalFiles} seed-filer. Projekt: ${JSON.stringify(
      q3Project
    )}; Personliga: ${JSON.stringify(q3Personal)}.`,
  });

  // 4) Embeddings i DocumentChunk (seed-filer = projekt eller personliga)
  const chunksWithEmbeddingProject = await runCount(`
    SELECT count(*) AS count
    FROM "DocumentChunk" dc
    JOIN "File" f ON f.id = dc."fileId"
    WHERE f."projectId" = 'seed-project-1' AND dc.embedding IS NOT NULL
  `);
  const chunksWithEmbeddingPersonal = await runCount(`
    SELECT count(*) AS count
    FROM "DocumentChunk" dc
    JOIN "File" f ON f.id = dc."fileId"
    WHERE f.id IN ('seed-file-ritning', 'seed-file-senaste-bild') AND dc.embedding IS NOT NULL
  `);
  const totalChunksPersonal = await runCount(`
    SELECT count(*) AS count
    FROM "DocumentChunk" dc
    WHERE dc."fileId" IN ('seed-file-ritning', 'seed-file-senaste-bild')
  `);
  const totalChunksProject = await runCount(`
    SELECT count(*) AS count
    FROM "DocumentChunk" dc
    JOIN "File" f ON f.id = dc."fileId"
    WHERE f."projectId" = 'seed-project-1'
  `);
  const withEmb = chunksWithEmbeddingProject + chunksWithEmbeddingPersonal;
  const totalChunks = totalChunksProject + totalChunksPersonal;
  const pass4 = totalChunks === 0 || withEmb === totalChunks;
  results.push({
    check: "4) Embeddings i DocumentChunk (seed-filer)",
    pass: pass4,
    detail: `${
      pass4 ? "PASS" : "FAIL"
    }: Chunks med embedding=${withEmb} (projekt=${chunksWithEmbeddingProject}, personliga=${chunksWithEmbeddingPersonal}), totalt chunks=${totalChunks}. Förväntat: alla chunks ha embedding om det finns chunks.`,
  });

  // 5) FileAnalysis för seed-bilder (projekt eller personliga)
  const q5Project = await runCount(`
    SELECT count(*) AS count
    FROM "FileAnalysis" fa
    JOIN "File" f ON f.id = fa."fileId"
    WHERE f."projectId" = 'seed-project-1' AND f.type LIKE 'image/%'
  `);
  const q5Personal = await runCount(`
    SELECT count(*) AS count
    FROM "FileAnalysis" fa
    JOIN "File" f ON f.id = fa."fileId"
    WHERE f.id IN ('seed-file-ritning', 'seed-file-senaste-bild') AND f.type LIKE 'image/%'
  `);
  const seedImageCount = await runCount(`
    SELECT count(*) AS count FROM "File"
    WHERE id IN ('seed-file-ritning', 'seed-file-senaste-bild') AND type LIKE 'image/%'
  `);
  const projectImageCount = await runCount(`
    SELECT count(*) AS count FROM "File"
    WHERE "projectId" = 'seed-project-1' AND type LIKE 'image/%'
  `);
  const expectedImages = projectImageCount + seedImageCount;
  const analysesCount = q5Project + q5Personal;
  const pass5 = expectedImages === 0 || analysesCount >= expectedImages;
  results.push({
    check: "5) FileAnalysis för seed-bilder",
    pass: pass5,
    detail: `${
      pass5 ? "PASS" : "FAIL"
    }: FileAnalysis-rader=${analysesCount} (projekt=${q5Project}, personliga=${q5Personal}), seed-bilder=${expectedImages}. Förväntat: minst en rad per seed-bild.`,
  });

  // Output
  console.log("\n=== Post-seed validering ===\n");
  for (const r of results) {
    console.log(`${r.pass ? "PASS" : "FAIL"}: ${r.check}`);
    console.log(`  ${r.detail}\n`);
  }
  const failed = results.filter((r) => !r.pass).length;
  process.exit(failed > 0 ? 1 : 0);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
