/**
 * One-off backfill: set Tenant.slug and Membership.emailSlug where null.
 * Run after deploying migrations for add_tenant_slug and add_membership_email_slug.
 *
 * Usage: cd web && npx tsx scripts/backfill-email-slugs.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import {
  computeEmailSlugForUser,
  slugifyForReplyTo,
} from "../src/lib/email-tracking";
import { randomBytes } from "node:crypto";

async function main() {
  // 1) Tenants without slug
  const tenantsWithoutSlug = await prisma.tenant.findMany({
    where: { slug: null },
    select: { id: true, name: true },
  });
  console.log(`Tenants without slug: ${tenantsWithoutSlug.length}`);

  for (const tenant of tenantsWithoutSlug) {
    const base = slugifyForReplyTo(tenant.name ?? "tenant");
    let slug = base;
    let exists = await prisma.tenant.findUnique({ where: { slug } });
    while (exists) {
      slug = `${base}-${randomBytes(2).toString("hex")}`;
      exists = await prisma.tenant.findUnique({ where: { slug } });
    }
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { slug },
    });
    console.log(`  Set slug "${slug}" for tenant ${tenant.name}`);
  }

  // 2) Memberships without emailSlug (per tenant)
  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true },
  });

  for (const tenant of tenants) {
    const memberships = await prisma.membership.findMany({
      where: { tenantId: tenant.id },
      include: { user: { select: { id: true, name: true } } },
    });
    const withSlug = memberships
      .map((m) => m.emailSlug)
      .filter((s): s is string => s != null);
    const withoutSlug = memberships.filter((m) => m.emailSlug == null);

    if (withoutSlug.length === 0) continue;

    console.log(
      `Tenant ${tenant.name}: ${withoutSlug.length} memberships without emailSlug`
    );
    const used = new Set(withSlug.map((s) => s.toLowerCase()));

    for (const m of withoutSlug) {
      const slug = computeEmailSlugForUser(m.user.name ?? "user", [...used]);
      used.add(slug.toLowerCase());
      await prisma.membership.update({
        where: { id: m.id },
        data: { emailSlug: slug },
      });
      console.log(`  Set emailSlug "${slug}" for ${m.user.name}`);
    }
  }

  console.log("Backfill done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
