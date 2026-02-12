/**
 * Lightweight migration runner for production Docker containers.
 * Replaces `prisma migrate deploy` to avoid needing the Prisma schema engine binary.
 * Reads SQL migration files and applies them in order, tracking state in _prisma_migrations.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const MIGRATIONS_DIR = join(import.meta.dirname, 'prisma', 'migrations');

async function run() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  // Create _prisma_migrations table if it doesn't exist
  await client.query(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) NOT NULL PRIMARY KEY,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Get already applied migrations
  const { rows: applied } = await client.query(
    'SELECT migration_name FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL'
  );
  const appliedSet = new Set(applied.map(r => r.migration_name));

  // Read migration directories (sorted alphabetically = chronologically)
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  const migrationDirs = entries
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort();

  let appliedCount = 0;

  for (const dir of migrationDirs) {
    if (appliedSet.has(dir)) {
      continue; // Already applied
    }

    const sqlPath = join(MIGRATIONS_DIR, dir, 'migration.sql');
    let sql;
    try {
      sql = await readFile(sqlPath, 'utf-8');
    } catch {
      console.warn(`Skipping ${dir}: no migration.sql found`);
      continue;
    }

    console.log(`Applying migration: ${dir}`);
    const id = crypto.randomUUID();

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        `INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
         VALUES ($1, $2, $3, now(), 1)`,
        [id, 'applied-by-migrate-script', dir]
      );
      await client.query('COMMIT');
      appliedCount++;
      console.log(`Applied: ${dir}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`Failed to apply ${dir}:`, err.message);
      await client.end();
      process.exit(1);
    }
  }

  await client.end();

  if (appliedCount === 0) {
    console.log('No pending migrations.');
  } else {
    console.log(`Applied ${appliedCount} migration(s).`);
  }
}

run().catch(err => {
  console.error('Migration runner failed:', err);
  process.exit(1);
});
