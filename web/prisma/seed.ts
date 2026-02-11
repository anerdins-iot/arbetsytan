import "dotenv/config";
import { prisma } from "../src/lib/db";

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { id: "seed-tenant-1" },
    update: {},
    create: {
      id: "seed-tenant-1",
      name: "Anerdins El",
      orgNumber: "556677-8899",
    },
  });

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      name: "Anna Admin",
      email: "admin@example.com",
      locale: "sv",
    },
  });

  const pmUser = await prisma.user.upsert({
    where: { email: "pm@example.com" },
    update: {},
    create: {
      name: "Per Projektledare",
      email: "pm@example.com",
      locale: "sv",
    },
  });

  const workerUser = await prisma.user.upsert({
    where: { email: "montor@example.com" },
    update: {},
    create: {
      name: "Maja Montör",
      email: "montor@example.com",
      locale: "sv",
    },
  });

  await prisma.membership.upsert({
    where: {
      userId_tenantId: { userId: adminUser.id, tenantId: tenant.id },
    },
    update: {},
    create: {
      userId: adminUser.id,
      tenantId: tenant.id,
      role: "ADMIN",
    },
  });

  const pmMembership = await prisma.membership.upsert({
    where: {
      userId_tenantId: { userId: pmUser.id, tenantId: tenant.id },
    },
    update: {},
    create: {
      userId: pmUser.id,
      tenantId: tenant.id,
      role: "PROJECT_MANAGER",
    },
  });

  const workerMembership = await prisma.membership.upsert({
    where: {
      userId_tenantId: { userId: workerUser.id, tenantId: tenant.id },
    },
    update: {},
    create: {
      userId: workerUser.id,
      tenantId: tenant.id,
      role: "WORKER",
    },
  });

  const project = await prisma.project.upsert({
    where: { id: "seed-project-1" },
    update: {},
    create: {
      id: "seed-project-1",
      name: "Kvarnbergsskolan",
      description: "Elinstallation i nybyggnad",
      status: "ACTIVE",
      address: "Kvarnbergsvägen 12, Göteborg",
      tenantId: tenant.id,
    },
  });

  const task1 = await prisma.task.create({
    data: {
      title: "Dra kabel i källaren",
      description: "Enligt ritning A-101",
      status: "TODO",
      priority: "MEDIUM",
      projectId: project.id,
    },
  });

  const task2 = await prisma.task.create({
    data: {
      title: "Montera tavlor",
      description: "Fas 2, vån 1",
      status: "IN_PROGRESS",
      priority: "HIGH",
      projectId: project.id,
    },
  });

  await prisma.taskAssignment.create({
    data: {
      taskId: task1.id,
      membershipId: workerMembership.id,
    },
  });

  await prisma.taskAssignment.create({
    data: {
      taskId: task2.id,
      membershipId: workerMembership.id,
    },
  });

  console.log("Seed OK: tenant, users, memberships, project, tasks created.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
