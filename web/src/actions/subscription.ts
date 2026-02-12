"use server";

import { z } from "zod";
import { requireAuth, requireRole } from "@/lib/auth";
import { tenantDb } from "@/lib/db";
import { stripe } from "@/lib/stripe";

const checkoutInputSchema = z.object({
  priceId: z.string().min(1).max(255),
});

function getAppUrl(): string {
  return (
    process.env.APP_URL?.replace(/\/$/, "") ??
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "http://localhost:3000"
  );
}

export type CurrentSubscription = {
  id: string;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  status: "ACTIVE" | "PAST_DUE" | "CANCELED" | "TRIALING";
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  trialEndsAt: Date | null;
  canceledAt: Date | null;
};

export async function getSubscription(): Promise<CurrentSubscription | null> {
  const { tenantId } = await requireAuth();
  const db = tenantDb(tenantId);

  return db.subscription.findUnique({
    where: { tenantId },
    select: {
      id: true,
      stripeSubscriptionId: true,
      stripePriceId: true,
      status: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      trialEndsAt: true,
      canceledAt: true,
    },
  });
}

export async function createCheckoutSession(priceId: string): Promise<{ url: string }> {
  const parsed = checkoutInputSchema.safeParse({ priceId });
  if (!parsed.success) {
    throw new Error("INVALID_PRICE_ID");
  }

  const { tenantId, userId } = await requireAuth();
  const db = tenantDb(tenantId);

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: {
      stripeCustomerId: true,
    },
  });

  if (!tenant?.stripeCustomerId) {
    throw new Error("STRIPE_CUSTOMER_NOT_FOUND");
  }

  const price = await stripe.prices.retrieve(parsed.data.priceId);
  if (!price.active || price.type !== "recurring") {
    throw new Error("INVALID_STRIPE_PRICE");
  }

  const appUrl = getAppUrl();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: tenant.stripeCustomerId,
    line_items: [{ price: parsed.data.priceId, quantity: 1 }],
    success_url: `${appUrl}/sv/settings/billing?checkout=success`,
    cancel_url: `${appUrl}/sv/settings/billing?checkout=canceled`,
    metadata: {
      tenantId,
      userId,
    },
    subscription_data: {
      metadata: {
        tenantId,
        userId,
      },
    },
  });

  if (!session.url) {
    throw new Error("STRIPE_SESSION_URL_MISSING");
  }

  return { url: session.url };
}

export async function createBillingPortalSession(): Promise<{ url: string }> {
  const { tenantId } = await requireRole(["ADMIN"]);
  const db = tenantDb(tenantId);

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { stripeCustomerId: true },
  });

  if (!tenant?.stripeCustomerId) {
    throw new Error("STRIPE_CUSTOMER_NOT_FOUND");
  }

  const appUrl = getAppUrl();
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: tenant.stripeCustomerId,
    return_url: `${appUrl}/sv/settings/billing`,
  });

  return { url: portalSession.url };
}

export async function getMemberCount(): Promise<number> {
  const { tenantId } = await requireAuth();
  const db = tenantDb(tenantId);

  return db.membership.count();
}

/**
 * Check if the tenant has an active subscription (ACTIVE or TRIALING).
 * Returns true if access should be granted, false if restricted.
 */
export async function checkSubscriptionAccess(): Promise<boolean> {
  const { tenantId } = await requireAuth();
  const db = tenantDb(tenantId);

  const subscription = await db.subscription.findUnique({
    where: { tenantId },
    select: { status: true },
  });

  if (!subscription) return false;
  return subscription.status === "ACTIVE" || subscription.status === "TRIALING";
}

const quantitySchema = z.object({
  quantity: z.number().int().min(1).max(1000),
});

export async function updateSubscriptionQuantity(
  quantity: number
): Promise<void> {
  const parsed = quantitySchema.safeParse({ quantity });
  if (!parsed.success) {
    throw new Error("INVALID_QUANTITY");
  }

  const { tenantId } = await requireRole(["ADMIN"]);
  const db = tenantDb(tenantId);

  const subscription = await db.subscription.findUnique({
    where: { tenantId },
    select: { stripeSubscriptionId: true, status: true },
  });

  if (!subscription?.stripeSubscriptionId) {
    throw new Error("NO_ACTIVE_SUBSCRIPTION");
  }

  if (subscription.status === "CANCELED") {
    throw new Error("SUBSCRIPTION_CANCELED");
  }

  const stripeSubscription = await stripe.subscriptions.retrieve(
    subscription.stripeSubscriptionId
  );

  const firstItem = stripeSubscription.items.data[0];
  if (!firstItem) {
    throw new Error("NO_SUBSCRIPTION_ITEM");
  }

  await stripe.subscriptionItems.update(firstItem.id, {
    quantity: parsed.data.quantity,
  });
}
