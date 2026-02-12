/**
 * Production seed runner for Docker containers.
 * Only runs when RUN_SEED=true environment variable is set.
 * Uses raw SQL via pg — no Prisma CLI or tsx needed.
 * Idempotent: uses INSERT ... ON CONFLICT DO UPDATE.
 */
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

/** Pre-computed bcrypt hash of "password123" with 12 rounds */
const PASSWORD_HASH = '$2b$12$wQqTKfuV9UfWnfKOXUWZyeF4RJIU/2dzs97ZC42A3F5a/vPnX25By';

async function run() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');

    // 1. Upsert tenant
    await client.query(`
      INSERT INTO "Tenant" ("id", "name", "orgNumber", "stripeCustomerId", "createdAt", "updatedAt")
      VALUES ('seed-tenant-1', 'Anerdins El', '556677-8899', 'cus_seed_test_001', now(), now())
      ON CONFLICT ("id") DO UPDATE SET "stripeCustomerId" = 'cus_seed_test_001', "updatedAt" = now()
    `);

    // 2. Upsert subscription
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 14);
    const periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() + 30);

    await client.query(`
      INSERT INTO "Subscription" ("id", "tenantId", "stripeSubscriptionId", "stripePriceId", "status", "currentPeriodStart", "currentPeriodEnd", "trialEndsAt", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, 'seed-tenant-1', 'sub_seed_test_001', 'price_seed_test_001', 'TRIALING', now(), $1, $2, now(), now())
      ON CONFLICT ("tenantId") DO NOTHING
    `, [periodEnd, trialEnd]);

    // 3. Upsert users
    const users = [
      { id: 'seed-user-admin', name: 'Anna Admin', email: 'admin@example.com', role: 'ADMIN' },
      { id: 'seed-user-pm', name: 'Per Projektledare', email: 'pm@example.com', role: 'PROJECT_MANAGER' },
      { id: 'seed-user-worker', name: 'Maja Montör', email: 'montor@example.com', role: 'WORKER' },
    ];

    for (const u of users) {
      await client.query(`
        INSERT INTO "User" ("id", "name", "email", "locale", "password", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, 'sv', $4, now(), now())
        ON CONFLICT ("email") DO UPDATE SET "password" = $4, "updatedAt" = now()
      `, [u.id, u.name, u.email, PASSWORD_HASH]);

      // We need the actual user ID (might differ if user already existed)
      const { rows } = await client.query(`SELECT "id" FROM "User" WHERE "email" = $1`, [u.email]);
      const userId = rows[0].id;

      await client.query(`
        INSERT INTO "Membership" ("id", "userId", "tenantId", "role", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, $1, 'seed-tenant-1', $2, now(), now())
        ON CONFLICT ("userId", "tenantId") DO NOTHING
      `, [userId, u.role]);
    }

    // 4. Upsert project
    await client.query(`
      INSERT INTO "Project" ("id", "name", "description", "status", "address", "tenantId", "createdAt", "updatedAt")
      VALUES ('seed-project-1', 'Kvarnbergsskolan', 'Elinstallation i nybyggnad', 'ACTIVE', 'Kvarnbergsvägen 12, Göteborg', 'seed-tenant-1', now(), now())
      ON CONFLICT ("id") DO NOTHING
    `);

    // 5. Create tasks (skip if project already has tasks)
    const { rows: existingTasks } = await client.query(
      `SELECT COUNT(*) as count FROM "Task" WHERE "projectId" = 'seed-project-1'`
    );

    if (parseInt(existingTasks[0].count) === 0) {
      const { rows: [task1] } = await client.query(`
        INSERT INTO "Task" ("id", "title", "description", "status", "priority", "projectId", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, 'Dra kabel i källaren', 'Enligt ritning A-101', 'TODO', 'MEDIUM', 'seed-project-1', now(), now())
        RETURNING "id"
      `);

      const { rows: [task2] } = await client.query(`
        INSERT INTO "Task" ("id", "title", "description", "status", "priority", "projectId", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, 'Montera tavlor', 'Fas 2, vån 1', 'IN_PROGRESS', 'HIGH', 'seed-project-1', now(), now())
        RETURNING "id"
      `);

      // Get worker membership
      const { rows: workerRows } = await client.query(`
        SELECT m."id" FROM "Membership" m
        JOIN "User" u ON u."id" = m."userId"
        WHERE u."email" = 'montor@example.com' AND m."tenantId" = 'seed-tenant-1'
      `);

      if (workerRows.length > 0) {
        const workerMembershipId = workerRows[0].id;
        await client.query(`
          INSERT INTO "TaskAssignment" ("id", "taskId", "membershipId", "createdAt")
          VALUES (gen_random_uuid()::text, $1, $2, now())
          ON CONFLICT ("taskId", "membershipId") DO NOTHING
        `, [task1.id, workerMembershipId]);

        await client.query(`
          INSERT INTO "TaskAssignment" ("id", "taskId", "membershipId", "createdAt")
          VALUES (gen_random_uuid()::text, $1, $2, now())
          ON CONFLICT ("taskId", "membershipId") DO NOTHING
        `, [task2.id, workerMembershipId]);
      }
    }

    await client.query('COMMIT');
    console.log('Seed OK: tenant, users, memberships, project, tasks created.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err.message);
    await client.end();
    process.exit(1);
  }

  await client.end();
}

run().catch(err => {
  console.error('Seed runner failed:', err);
  process.exit(1);
});
