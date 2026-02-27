/**
 * Ensures a superadmin user always exists in production.
 * Runs on every container start (before the app server).
 *
 * Requires env vars:
 *   SUPERADMIN_EMAIL    — e.g. fredrik@anerdins.se
 *   SUPERADMIN_PASSWORD — plain text, will be bcrypt-hashed
 *   SUPERADMIN_NAME     — optional, defaults to "Superadmin"
 *   SUPERADMIN_TENANT   — optional tenant name, defaults to "ArbetsYtan"
 *
 * If env vars are not set, this script exits silently (no-op).
 * Safe to run multiple times — fully idempotent.
 */
import pg from 'pg';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const EMAIL = process.env.SUPERADMIN_EMAIL;
const PASSWORD = process.env.SUPERADMIN_PASSWORD;
const NAME = process.env.SUPERADMIN_NAME || 'Superadmin';
const TENANT_NAME = process.env.SUPERADMIN_TENANT || 'ArbetsYtan';

if (!EMAIL || !PASSWORD) {
  // Not configured — silent no-op
  process.exit(0);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[superadmin] DATABASE_URL is not set');
  process.exit(1);
}

async function hashPassword(plain) {
  // bcrypt is a native dep — dynamically require it
  const bcrypt = require('bcrypt');
  return bcrypt.hash(plain, 12);
}

async function run() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');

    const passwordHash = await hashPassword(PASSWORD);

    // 1. Upsert user
    await client.query(`
      INSERT INTO "User" ("id", "name", "email", "locale", "password", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, $1, $2, 'sv', $3, now(), now())
      ON CONFLICT ("email") DO UPDATE SET
        "name" = $1,
        "password" = $3,
        "updatedAt" = now()
    `, [NAME, EMAIL, passwordHash]);

    const { rows: [user] } = await client.query(
      `SELECT "id" FROM "User" WHERE "email" = $1`, [EMAIL]
    );

    // 2. Upsert a default tenant if none exists
    const { rows: tenants } = await client.query(`SELECT "id" FROM "Tenant" LIMIT 1`);
    let tenantId;

    if (tenants.length > 0) {
      tenantId = tenants[0].id;
    } else {
      const { rows: [newTenant] } = await client.query(`
        INSERT INTO "Tenant" ("id", "name", "inboxCode", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, $1, $2, now(), now())
        RETURNING "id"
      `, [TENANT_NAME, crypto.randomBytes(4).toString('hex')]);
      tenantId = newTenant.id;

      // Create a trial subscription for the new tenant
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 30);
      await client.query(`
        INSERT INTO "Subscription" ("id", "tenantId", "stripeSubscriptionId", "stripePriceId", "status", "currentPeriodStart", "currentPeriodEnd", "trialEndsAt", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, $1, 'manual', 'manual', 'TRIALING', now(), $2, $2, now(), now())
        ON CONFLICT ("tenantId") DO NOTHING
      `, [tenantId, trialEnd]);
    }

    // 3. Upsert membership as ADMIN
    const emailSlug = EMAIL.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 20);
    await client.query(`
      INSERT INTO "Membership" ("id", "userId", "tenantId", "role", "emailSlug", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, $1, $2, 'ADMIN', $3, now(), now())
      ON CONFLICT ("userId", "tenantId") DO UPDATE SET
        "role" = 'ADMIN',
        "updatedAt" = now()
    `, [user.id, tenantId, emailSlug]);

    await client.query('COMMIT');
    console.log(`[superadmin] OK — ${EMAIL} is ADMIN in tenant ${tenantId}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[superadmin] Failed:', err.message);
    process.exit(1);
  }

  await client.end();
}

run().catch(err => {
  console.error('[superadmin] Unhandled error:', err);
  process.exit(1);
});
