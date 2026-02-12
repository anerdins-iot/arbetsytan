import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { tenantDb, prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";

type AppSubscriptionStatus = "ACTIVE" | "PAST_DUE" | "CANCELED" | "TRIALING";

function toDate(unixSeconds?: number | null): Date | null {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000);
}

function mapStripeStatus(status: Stripe.Subscription.Status): AppSubscriptionStatus {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "canceled":
      return "CANCELED";
    case "past_due":
    case "unpaid":
    case "incomplete":
    case "incomplete_expired":
    case "paused":
      return "PAST_DUE";
    default:
      return "PAST_DUE";
  }
}

function getCustomerId(value: string | Stripe.Customer | Stripe.DeletedCustomer | null): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.id;
}

async function findTenantByStripeCustomerId(stripeCustomerId: string) {
  return prisma.tenant.findUnique({
    where: { stripeCustomerId },
    select: { id: true },
  });
}

async function upsertSubscriptionFromStripe(
  tenantId: string,
  subscription: Stripe.Subscription
): Promise<void> {
  const db = tenantDb(tenantId);
  const firstItem = subscription.items.data[0];
  const priceId = firstItem?.price?.id ?? null;
  const currentPeriodStart = toDate(firstItem?.current_period_start);
  const currentPeriodEnd = toDate(firstItem?.current_period_end);

  await db.subscription.upsert({
    where: { tenantId },
    create: {
      tenantId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      status: mapStripeStatus(subscription.status),
      currentPeriodStart,
      currentPeriodEnd,
      trialEndsAt: toDate(subscription.trial_end),
      canceledAt: toDate(subscription.canceled_at),
    },
    update: {
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      status: mapStripeStatus(subscription.status),
      currentPeriodStart,
      currentPeriodEnd,
      trialEndsAt: toDate(subscription.trial_end),
      canceledAt: toDate(subscription.canceled_at),
    },
  });
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
  if (session.mode !== "subscription") return;
  if (!session.subscription) return;

  const stripeCustomerId = getCustomerId(session.customer);
  if (!stripeCustomerId) return;

  const tenant = await findTenantByStripeCustomerId(stripeCustomerId);
  if (!tenant) return;

  const stripeSubscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription.id;

  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  await upsertSubscriptionFromStripe(tenant.id, subscription);
}

async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const stripeCustomerId = getCustomerId(invoice.customer);
  if (!stripeCustomerId) return;

  const tenant = await findTenantByStripeCustomerId(stripeCustomerId);
  if (!tenant) return;

  const db = tenantDb(tenant.id);
  const parentSubscription = invoice.parent?.subscription_details?.subscription;
  const stripeSubscriptionId =
    typeof parentSubscription === "string" ? parentSubscription : parentSubscription?.id;

  if (stripeSubscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    await upsertSubscriptionFromStripe(tenant.id, subscription);
    return;
  }

  await db.subscription.updateMany({
    data: { status: "ACTIVE" },
  });
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const stripeCustomerId = getCustomerId(invoice.customer);
  if (!stripeCustomerId) return;

  const tenant = await findTenantByStripeCustomerId(stripeCustomerId);
  if (!tenant) return;

  const db = tenantDb(tenant.id);
  const parentSubscription = invoice.parent?.subscription_details?.subscription;
  const stripeSubscriptionId =
    typeof parentSubscription === "string" ? parentSubscription : parentSubscription?.id;

  if (stripeSubscriptionId) {
    await db.subscription.updateMany({
      where: { stripeSubscriptionId },
      data: { status: "PAST_DUE" },
    });
    return;
  }

  await db.subscription.updateMany({
    data: { status: "PAST_DUE" },
  });
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  const stripeCustomerId = getCustomerId(subscription.customer);
  if (!stripeCustomerId) return;

  const tenant = await findTenantByStripeCustomerId(stripeCustomerId);
  if (!tenant) return;

  await upsertSubscriptionFromStripe(tenant.id, subscription);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const stripeCustomerId = getCustomerId(subscription.customer);
  if (!stripeCustomerId) return;

  const tenant = await findTenantByStripeCustomerId(stripeCustomerId);
  if (!tenant) return;

  const db = tenantDb(tenant.id);
  await db.subscription.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      status: "CANCELED",
      canceledAt: toDate(subscription.canceled_at) ?? new Date(),
    },
  });
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET_MISSING" }, { status: 500 });
  }

  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "MISSING_STRIPE_SIGNATURE" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    console.error("[stripe-webhook] invalid signature", error);
    return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "invoice.paid":
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[stripe-webhook] handler failed", error);
    return NextResponse.json({ error: "WEBHOOK_HANDLER_FAILED" }, { status: 500 });
  }
}
