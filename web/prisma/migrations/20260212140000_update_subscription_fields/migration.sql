ALTER TABLE "Subscription"
ADD COLUMN "stripePriceId" TEXT,
ADD COLUMN "currentPeriodStart" TIMESTAMP(3),
ADD COLUMN "trialEndsAt" TIMESTAMP(3),
ADD COLUMN "canceledAt" TIMESTAMP(3);

ALTER TABLE "Subscription"
ALTER COLUMN "stripeSubscriptionId" DROP NOT NULL;

ALTER TABLE "Subscription"
DROP COLUMN "plan";
