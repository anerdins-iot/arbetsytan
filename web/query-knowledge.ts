import { PrismaClient } from './generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const adapter = new PrismaPg({ connectionString: 'postgresql://postgres:postgres@localhost:5432/myapp' });
  const prisma = new PrismaClient({ adapter });
  const rows = await prisma.knowledgeEntity.findMany({ orderBy: { lastSeen: 'desc' }, take: 10 });
  console.log(JSON.stringify(rows, null, 2));
  await prisma.$disconnect();
}
main();
