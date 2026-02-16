
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { randomBytes } from 'node:crypto';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const tenants = await prisma.tenant.findMany({
    where: { inboxCode: null }
  });

  console.log(`Found ${tenants.length} tenants without inboxCode`);

  for (const tenant of tenants) {
    let inboxCode = '';
    let isUnique = false;
    
    while (!isUnique) {
      inboxCode = randomBytes(4).toString('hex'); // 8 chars
      const existing = await prisma.tenant.findUnique({
        where: { inboxCode }
      });
      if (!existing) isUnique = true;
    }

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { inboxCode }
    });
    console.log(`Generated inboxCode ${inboxCode} for tenant ${tenant.name}`);
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
