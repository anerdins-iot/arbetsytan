# Post-seed validering

Kör från `web/` (där `prisma.config.ts` och `.env` med `DATABASE_URL` finns).  
För SQL: använd `psql "$DATABASE_URL"` (sätt DATABASE_URL från `web/.env` eller export manuellt).

---

## 1) QA-task + kommentar från målare

```bash
cd web
psql "$DATABASE_URL" -c "
SELECT t.id AS task_id, t.title, c.id AS comment_id, c.content, u.name AS author_name
FROM \"Task\" t
JOIN \"Comment\" c ON c.\"taskId\" = t.id
JOIN \"User\" u ON u.id = c.\"authorId\"
WHERE t.\"projectId\" = 'seed-project-1'
  AND (t.title ILIKE '%QA%' OR t.title ILIKE '%qa%')
  AND u.name ILIKE '%målare%';
"
```

Förväntat: minst en rad (task + comment, author name innehåller "målare").

---

## 2) Seed-filer finns i File

```bash
cd web
psql "$DATABASE_URL" -c "
SELECT id, name, type, \"projectId\", \"ocrText\" IS NOT NULL AS has_ocr
FROM \"File\"
WHERE \"projectId\" = 'seed-project-1'
ORDER BY \"createdAt\";
"
```

Förväntat: minst en fil kopplad till seed-projektet.

---

## 3) OCR-text / chunks finns

```bash
cd web
psql "$DATABASE_URL" -c "
SELECT f.id, f.name, f.\"ocrText\" IS NOT NULL AND length(f.\"ocrText\") > 0 AS has_ocr_text,
       (SELECT count(*) FROM \"DocumentChunk\" dc WHERE dc.\"fileId\" = f.id) AS chunk_count
FROM \"File\" f
WHERE f.\"projectId\" = 'seed-project-1';
"
```

Förväntat: seed-filer har `has_ocr_text` true och/eller `chunk_count` > 0.

---

## 4) Embeddings finns i DocumentChunk (seed-filer)

```bash
cd web
psql "$DATABASE_URL" -c "
SELECT f.name, dc.id AS chunk_id, dc.embedding IS NOT NULL AS has_embedding
FROM \"File\" f
JOIN \"DocumentChunk\" dc ON dc.\"fileId\" = f.id
WHERE f.\"projectId\" = 'seed-project-1'
LIMIT 10;
"
```

Förväntat: alla visade rader har `has_embedding` true. Räkna:

```bash
psql "$DATABASE_URL" -c "
SELECT count(*) AS chunks_with_embedding
FROM \"DocumentChunk\" dc
JOIN \"File\" f ON f.id = dc.\"fileId\"
WHERE f.\"projectId\" = 'seed-project-1' AND dc.embedding IS NOT NULL;
"
```

---

## 5) FileAnalysis finns för seed-bilder

```bash
cd web
psql "$DATABASE_URL" -c "
SELECT f.id, f.name, f.type, fa.id AS analysis_id, left(fa.content, 80) AS content_preview
FROM \"File\" f
JOIN \"FileAnalysis\" fa ON fa.\"fileId\" = f.id
WHERE f.\"projectId\" = 'seed-project-1'
  AND f.type LIKE 'image/%';
"
```

Förväntat: minst en rad per seed-bild (bild = `type` som börjar med `image/`).

---

## Snabbkontroll (alla fem)

Kör från `web/` efter `set -a && source .env && set +a` (eller export DATABASE_URL):

```bash
echo "=== 1) QA-task + målarkommentar ==="
psql "$DATABASE_URL" -t -c "SELECT count(*) FROM \"Task\" t JOIN \"Comment\" c ON c.\"taskId\" = t.id JOIN \"User\" u ON u.id = c.\"authorId\" WHERE t.\"projectId\" = 'seed-project-1' AND t.title ILIKE '%QA%' AND u.name ILIKE '%målare%';"

echo "=== 2) Antal seed-filer ==="
psql "$DATABASE_URL" -t -c "SELECT count(*) FROM \"File\" WHERE \"projectId\" = 'seed-project-1';"

echo "=== 3) Filer med OCR/chunks ==="
psql "$DATABASE_URL" -c "SELECT f.name, (f.\"ocrText\" IS NOT NULL AND length(f.\"ocrText\") > 0) AS has_ocr, (SELECT count(*) FROM \"DocumentChunk\" dc WHERE dc.\"fileId\" = f.id) AS chunks FROM \"File\" f WHERE f.\"projectId\" = 'seed-project-1';"

echo "=== 4) Chunks med embedding ==="
psql "$DATABASE_URL" -t -c "SELECT count(*) FROM \"DocumentChunk\" dc JOIN \"File\" f ON f.id = dc.\"fileId\" WHERE f.\"projectId\" = 'seed-project-1' AND dc.embedding IS NOT NULL;"

echo "=== 5) FileAnalysis för bilder ==="
psql "$DATABASE_URL" -t -c "SELECT count(*) FROM \"FileAnalysis\" fa JOIN \"File\" f ON f.id = fa.\"fileId\" WHERE f.\"projectId\" = 'seed-project-1' AND f.type LIKE 'image/%';"
```
