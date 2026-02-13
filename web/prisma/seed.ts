import "dotenv/config";
import bcrypt from "bcrypt";
import { prisma } from "../src/lib/db";

async function main() {
  /** Shared test password for seed users: fredrik@anerdins.se, pm@example.com, montor@example.com → "password123" */
  const testPasswordHash = await bcrypt.hash("password123", 12);
  const tenant = await prisma.tenant.upsert({
    where: { id: "seed-tenant-1" },
    update: { stripeCustomerId: "cus_seed_test_001" },
    create: {
      id: "seed-tenant-1",
      name: "Anerdins El",
      orgNumber: "556677-8899",
      stripeCustomerId: "cus_seed_test_001",
    },
  });

  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 14);
  const periodEnd = new Date();
  periodEnd.setDate(periodEnd.getDate() + 30);

  await prisma.subscription.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      stripeSubscriptionId: "sub_seed_test_001",
      stripePriceId: "price_seed_test_001",
      status: "TRIALING",
      currentPeriodStart: new Date(),
      currentPeriodEnd: periodEnd,
      trialEndsAt: trialEnd,
    },
  });

  const adminUser = await prisma.user.upsert({
    where: { email: "fredrik@anerdins.se" },
    update: { password: testPasswordHash },
    create: {
      name: "Fredrik Admin",
      email: "fredrik@anerdins.se",
      locale: "sv",
      password: testPasswordHash,
    },
  });

  const pmUser = await prisma.user.upsert({
    where: { email: "pm@example.com" },
    update: { password: testPasswordHash },
    create: {
      name: "Per Projektledare",
      email: "pm@example.com",
      locale: "sv",
      password: testPasswordHash,
    },
  });

  const workerUser = await prisma.user.upsert({
    where: { email: "montor@example.com" },
    update: { password: testPasswordHash },
    create: {
      name: "Maja Montör",
      email: "montor@example.com",
      locale: "sv",
      password: testPasswordHash,
    },
  });

  const adminMembership = await prisma.membership.upsert({
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

  // Koppla medlemmar till projektet via ProjectMember
  for (const membership of [adminMembership, pmMembership, workerMembership]) {
    await prisma.projectMember.upsert({
      where: {
        projectId_membershipId: {
          projectId: project.id,
          membershipId: membership.id,
        },
      },
      update: {},
      create: {
        projectId: project.id,
        membershipId: membership.id,
      },
    });
  }

  // Default note categories for tenant
  await prisma.noteCategory.createMany({
    data: [
      { name: "Beslut", slug: "beslut", color: "#22c55e", tenantId: tenant.id },
      { name: "Teknisk info", slug: "teknisk_info", color: "#3b82f6", tenantId: tenant.id },
      { name: "Kundönskemål", slug: "kundonskem\u00e5l", color: "#f59e0b", tenantId: tenant.id },
      { name: "Viktig info", slug: "viktig_info", color: "#ef4444", tenantId: tenant.id },
      { name: "Övrigt", slug: "ovrigt", color: "#6b7280", tenantId: tenant.id },
    ],
    skipDuplicates: true,
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

  // --- Automations (example scheduled actions) ---
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);

  function nextMorning9AM(): Date {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }

  await prisma.automation.create({
    data: {
      name: "Påminnelse om kundmöte",
      description: "Påminn om möte med kunden på fredag",
      triggerAt: tomorrow,
      recurrence: null,
      timezone: "Europe/Stockholm",
      actionTool: "notify",
      actionParams: { message: "Glöm inte kundmötet imorgon kl 10!" },
      status: "PENDING",
      userId: pmUser.id,
      tenantId: tenant.id,
      projectId: project.id,
      createdBy: "USER",
    },
  });

  await prisma.automation.create({
    data: {
      name: "Daglig projektrapport",
      description: "Generera projektrapport varje morgon",
      triggerAt: nextMorning9AM(),
      recurrence: "0 9 * * *",
      timezone: "Europe/Stockholm",
      actionTool: "generateProjectReport",
      actionParams: {},
      status: "ACTIVE",
      userId: adminUser.id,
      tenantId: tenant.id,
      projectId: project.id,
      createdBy: "AI",
    },
  });

  await prisma.automation.create({
    data: {
      name: "Veckovis uppgiftspåminnelse",
      description: "Påminn om oavslutade uppgifter varje måndag",
      triggerAt: nextMorning9AM(),
      recurrence: "0 8 * * 1",
      timezone: "Europe/Stockholm",
      actionTool: "notify",
      actionParams: { message: "Veckovisa påminnelse: granska oavslutade uppgifter i projektet." },
      status: "ACTIVE",
      userId: pmUser.id,
      tenantId: tenant.id,
      projectId: project.id,
      createdBy: "USER",
    },
  });

  await prisma.automation.create({
    data: {
      name: "Månadsgenomgång (pausad)",
      description: "Månatlig sammanställning – pausad tills vidare",
      triggerAt: nextMorning9AM(),
      recurrence: "0 9 1 * *",
      timezone: "Europe/Stockholm",
      actionTool: "generateProjectReport",
      actionParams: {},
      status: "PAUSED",
      userId: adminUser.id,
      tenantId: tenant.id,
      projectId: project.id,
      createdBy: "AI",
    },
  });

  console.log("Seed OK: tenant, users, memberships, project, note categories, tasks, automations created.");
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
