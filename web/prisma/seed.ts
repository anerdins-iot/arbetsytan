import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { prisma } from "../src/lib/db";
import { processPersonalFileOcr } from "../src/lib/ai/ocr";
import { runFileAnalysisSync } from "../src/lib/ai/queue-file-analysis";
import { processFileEmbeddings } from "../src/lib/ai/embeddings";
import { ensureTenantBucket, putObjectToMinio } from "../src/lib/minio";

async function main() {
  /** Shared test password for seed users: admin@example.com (e2e), fredrik@anerdins.se, pm@example.com, montor@example.com → "password123" */
  const testPasswordHash = await bcrypt.hash("password123", 12);
  const tenant = await prisma.tenant.upsert({
    where: { id: "seed-tenant-1" },
    update: { stripeCustomerId: "cus_seed_test_001" },
    create: {
      id: "seed-tenant-1",
      name: "Anerdins El",
      orgNumber: "556677-8899",
      stripeCustomerId: "cus_seed_test_001",
      inboxCode: crypto.randomBytes(4).toString("hex"),
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

  const malareUser = await prisma.user.upsert({
    where: { email: "malare@example.com" },
    update: { password: testPasswordHash },
    create: {
      name: "Kalle Målare",
      email: "malare@example.com",
      locale: "sv",
      password: testPasswordHash,
    },
  });

  /** E2E admin used by all e2e/*.spec.ts (password: password123) */
  const e2eAdminUser = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: { password: testPasswordHash },
    create: {
      name: "E2E Admin",
      email: "admin@example.com",
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

  const e2eAdminMembership = await prisma.membership.upsert({
    where: {
      userId_tenantId: { userId: e2eAdminUser.id, tenantId: tenant.id },
    },
    update: {},
    create: {
      userId: e2eAdminUser.id,
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

  const malareMembership = await prisma.membership.upsert({
    where: {
      userId_tenantId: { userId: malareUser.id, tenantId: tenant.id },
    },
    update: {},
    create: {
      userId: malareUser.id,
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

  // Koppla medlemmar till projektet via ProjectMember (inkl. e2e-admin för E2E-tester)
  for (const membership of [adminMembership, e2eAdminMembership, pmMembership, workerMembership, malareMembership]) {
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

  // --- Idempotent tasks (QA: ritning, offertstatus, deadlines, status) ---
  const task1 = await prisma.task.upsert({
    where: { id: "seed-task-1" },
    update: {},
    create: {
      id: "seed-task-1",
      title: "Dra kabel i källaren",
      description: "Enligt ritning A-101",
      status: "TODO",
      priority: "MEDIUM",
      projectId: project.id,
    },
  });

  const taskDeadline = new Date();
  taskDeadline.setDate(taskDeadline.getDate() + 14);
  const task2 = await prisma.task.upsert({
    where: { id: "seed-task-2" },
    update: {},
    create: {
      id: "seed-task-2",
      title: "Montera tavlor",
      description: "Fas 2, vån 1",
      status: "IN_PROGRESS",
      priority: "HIGH",
      deadline: taskDeadline,
      projectId: project.id,
    },
  });

  const task3 = await prisma.task.upsert({
    where: { id: "seed-task-3" },
    update: {},
    create: {
      id: "seed-task-3",
      title: "Offert skickad",
      description: "Offert till kund godkänd",
      status: "DONE",
      priority: "MEDIUM",
      projectId: project.id,
    },
  });

  const taskQA = await prisma.task.upsert({
    where: { id: "seed-task-qa" },
    update: {},
    create: {
      id: "seed-task-qa",
      title: "QA slutkontroll",
      description: "Slutkontroll enligt QA-checklista",
      status: "TODO",
      priority: "MEDIUM",
      projectId: project.id,
    },
  });

  // Idempotent task assignments
  await prisma.taskAssignment.upsert({
    where: {
      taskId_membershipId: { taskId: task1.id, membershipId: workerMembership.id },
    },
    update: {},
    create: { taskId: task1.id, membershipId: workerMembership.id },
  });
  await prisma.taskAssignment.upsert({
    where: {
      taskId_membershipId: { taskId: task2.id, membershipId: workerMembership.id },
    },
    update: {},
    create: { taskId: task2.id, membershipId: workerMembership.id },
  });

  // Idempotent målare-kommentar (Comment, inte note): användare med "Målare" i namn på task med "QA" i titel (post-seed validering)
  await prisma.comment.upsert({
    where: { id: "seed-comment-1" },
    update: { taskId: taskQA.id, authorId: malareUser.id },
    create: {
      id: "seed-comment-1",
      taskId: taskQA.id,
      authorId: malareUser.id,
      content: "Jag har kollat ritningen och kan börja montera nästa vecka. Behöver elräkning från elnätsbolaget först.",
    },
  });

  // --- Idempotent automations ---
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);

  function nextMorning9AM(): Date {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }

  await prisma.automation.upsert({
    where: { id: "seed-automation-1" },
    update: {},
    create: {
      id: "seed-automation-1",
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

  await prisma.automation.upsert({
    where: { id: "seed-automation-2" },
    update: {},
    create: {
      id: "seed-automation-2",
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

  await prisma.automation.upsert({
    where: { id: "seed-automation-3" },
    update: {},
    create: {
      id: "seed-automation-3",
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

  await prisma.automation.upsert({
    where: { id: "seed-automation-4" },
    update: {},
    create: {
      id: "seed-automation-4",
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

  // --- E2E: aktivitetslogg, tidspost och anteckning så att Översikt, Tid och Anteckningar har innehåll ---
  await prisma.activityLog.upsert({
    where: { id: "seed-activity-1" },
    update: {},
    create: {
      id: "seed-activity-1",
      action: "created",
      entity: "task",
      entityId: task1.id,
      metadata: {},
      projectId: project.id,
      actorId: e2eAdminUser.id,
    },
  });
  await prisma.activityLog.upsert({
    where: { id: "seed-activity-2" },
    update: {},
    create: {
      id: "seed-activity-2",
      action: "created",
      entity: "note",
      entityId: "seed-note-e2e",
      metadata: {},
      projectId: project.id,
      actorId: e2eAdminUser.id,
    },
  });

  const seedTimeDate = new Date();
  seedTimeDate.setHours(0, 0, 0, 0);
  await prisma.timeEntry.upsert({
    where: { id: "seed-timeentry-e2e" },
    update: {},
    create: {
      id: "seed-timeentry-e2e",
      description: "E2E seed tidspost",
      minutes: 60,
      date: seedTimeDate,
      taskId: task1.id,
      projectId: project.id,
      userId: e2eAdminUser.id,
      tenantId: tenant.id,
      entryType: "WORK",
    },
  });

  await prisma.note.upsert({
    where: { id: "seed-note-e2e" },
    update: {},
    create: {
      id: "seed-note-e2e",
      title: "E2E seed anteckning",
      content: "Används för att fylla Anteckningar-fliken i E2E-tester.",
      category: "ovrigt",
      isPinned: false,
      projectId: project.id,
      createdById: e2eAdminUser.id,
    },
  });

  // --- QA personlig AI: seedade filer med full pipeline (OCR + chunks + embeddings + bildanalys), idempotent ---
  const seedFileIds = ["seed-file-ritning", "seed-file-senaste-bild"];
  const hasMinioEnv =
    process.env.S3_ENDPOINT &&
    process.env.S3_ACCESS_KEY &&
    process.env.S3_SECRET_KEY &&
    process.env.S3_BUCKET &&
    process.env.S3_REGION;

  if (!hasMinioEnv) {
    console.warn("Seed: S3/MinIO env saknas — hoppar över filpipeline och personliga filer.");
  } else {
    try {
      const bucket = await ensureTenantBucket(tenant.id);
      // 1x1 PNG (fallback när seed-assets saknas)
      const minimalPng = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64"
      );

      const seedAssetsDir = path.join(__dirname, "seed-assets");
      const readSeedAsset = (fileName: string): Buffer => {
        const filePath = path.join(seedAssetsDir, fileName);
        if (fs.existsSync(filePath)) {
          return fs.readFileSync(filePath);
        }
        return minimalPng;
      };

      const personalKey = (fileName: string): string =>
        `${process.env.S3_BUCKET}/personal/${adminUser.id}/seed-${fileName}`;

      for (const entry of [
        { id: "seed-file-ritning", name: "ritning-a101.png", type: "image/png" },
        { id: "seed-file-senaste-bild", name: "senaste-bild-plats.png", type: "image/png" },
      ]) {
        const body = readSeedAsset(entry.name);
        const key = personalKey(entry.name);
        await prisma.file.upsert({
          where: { id: entry.id },
          update: {},
          create: {
            id: entry.id,
            name: entry.name,
            type: entry.type,
            size: body.length,
            bucket,
            key,
            projectId: null,
            uploadedById: adminUser.id,
          },
        });
        await putObjectToMinio({
          bucket,
          key,
          body: new Uint8Array(body),
          contentType: entry.type,
        });
      }

      // Idempotens: ta bort gamla analyser för seed-filer så omseed inte dubblerar
      await prisma.fileAnalysis.deleteMany({ where: { fileId: { in: seedFileIds } } });

      for (const entry of [
        { id: "seed-file-ritning", name: "ritning-a101.png", type: "image/png" },
        { id: "seed-file-senaste-bild", name: "senaste-bild-plats.png", type: "image/png" },
      ]) {
        const key = personalKey(entry.name);
        const ocrResult = await processPersonalFileOcr({
          fileId: entry.id,
          tenantId: tenant.id,
          userId: adminUser.id,
          bucket,
          key,
          fileType: entry.type,
          fileName: entry.name,
        });
        const ocrText = ocrResult.success
          ? (await prisma.file.findUnique({ where: { id: entry.id }, select: { ocrText: true } }))?.ocrText ?? ""
          : "";
        await runFileAnalysisSync({
          fileId: entry.id,
          fileName: entry.name,
          fileType: entry.type,
          bucket,
          key,
          tenantId: tenant.id,
          userId: adminUser.id,
          ocrText,
          userDescription: "",
        });
        if (process.env.OPENAI_API_KEY) {
          await processFileEmbeddings(entry.id, tenant.id);
        } else {
          console.warn("Seed: OPENAI_API_KEY saknas — embeddings hoppas över för", entry.id);
        }
      }

      // Projektfil för E2E (t.ex. fas-04-files-mobile: filmodalen på projektfliken)
      const projectFileKey = `${process.env.S3_BUCKET}/projects/${project.id}/seed-e2e-plan.pdf`;
      const minimalPdf = Buffer.from(
        "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000101 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF",
        "utf-8"
      );
      await prisma.file.upsert({
        where: { id: "seed-project-file-e2e" },
        update: {},
        create: {
          id: "seed-project-file-e2e",
          name: "e2e-plan.pdf",
          type: "application/pdf",
          size: minimalPdf.length,
          bucket,
          key: projectFileKey,
          projectId: project.id,
          uploadedById: e2eAdminUser.id,
        },
      });
      await putObjectToMinio({
        bucket,
        key: projectFileKey,
        body: new Uint8Array(minimalPdf),
        contentType: "application/pdf",
      });

      console.log("Seed: personliga filer (OCR + chunks + embeddings + analys) klara.");
    } catch (e) {
      console.warn("Seed: filpipeline misslyckades (t.ex. Mistral/MinIO). Fortsätter utan filer.", e);
    }
  }

  console.log("Seed OK: tenant, users, memberships, project, note categories, tasks, comment, automations, QA-filer.");
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
