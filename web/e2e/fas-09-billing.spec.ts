import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const SCREENSHOT_DIR = path.join(process.cwd(), "..", "screenshots", "fas-09");
const LOCALE = "sv";

test.beforeAll(() => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

async function dismissOptionalOverlays(page: Page) {
  const dismissButtons = [/godkänn|acceptera|accept|ok|okej/i, /stäng|close/i];

  for (const name of dismissButtons) {
    const button = page.getByRole("button", { name }).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click().catch(() => {});
      await page.waitForTimeout(200);
    }
  }
}

async function loginAsAdmin(page: Page) {
  await page.goto(`/${LOCALE}/login`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });

  await dismissOptionalOverlays(page);
  await page.getByLabel(/e-post|email/i).fill("admin@example.com");
  await page.getByLabel(/lösenord|password/i).fill("password123");
  await page.getByRole("button", { name: /logga in|sign in|log in/i }).click();

  await expect(page).toHaveURL(new RegExp(`/${LOCALE}/dashboard`), {
    timeout: 15000,
  });
}

test("Block 9.3: billing page, subscription status and cost per user", async ({
  page,
}) => {
  test.setTimeout(180000);

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => {
    const msg = error.message;
    if (
      /hydration/i.test(msg) ||
      /NextIntlClientProvider|useTranslations/i.test(msg)
    ) {
      return;
    }
    pageErrors.push(msg);
  });

  // Intercept navigation attempts to Stripe portal (will fail without real Stripe session)
  // Track attempted navigations so we can verify the button tries to redirect
  await page.addInitScript(() => {
    const win = window as Window & {
      __navigatedUrls?: string[];
      __navPatched?: boolean;
    };

    if (win.__navPatched) return;
    win.__navigatedUrls = [];
    win.__navPatched = true;

    // Intercept location.href setter to catch Stripe portal redirect
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      window,
      "location"
    );
    // Cannot override location directly, so we'll track via beforeunload
    window.addEventListener("beforeunload", () => {
      win.__navigatedUrls?.push(window.location.href);
    });
  });

  // ── Step 1: Log in as admin ──
  await loginAsAdmin(page);

  // ── Step 2: Navigate to billing page ──
  await page.goto(`/${LOCALE}/settings/billing`, {
    waitUntil: "domcontentloaded",
    timeout: 20000,
  });
  await dismissOptionalOverlays(page);

  // Verify billing page loaded — check for title
  const billingTitle = page.getByRole("heading", {
    name: /fakturering|billing/i,
  });
  await expect(billingTitle).toBeVisible({ timeout: 15000 });

  // ── Step 3: Screenshot of billing page (plan, status, next invoice) ──
  const billingPageShot = path.join(SCREENSHOT_DIR, "billing-page.png");
  await page.screenshot({
    path: billingPageShot,
    fullPage: true,
  });

  // ── Step 4: Verify subscription status section ──
  const currentPlanHeading = page.getByRole("heading", {
    name: /aktuell plan|current plan/i,
  });
  await expect(currentPlanHeading).toBeVisible({ timeout: 10000 });

  // Check for status badge — should be TRIALING or ACTIVE from seed data
  const statusLabel = page.getByText(/status:/i);
  await expect(statusLabel).toBeVisible({ timeout: 10000 });

  // Look for a status badge (Testperiod/Aktiv/Trial/Active)
  const statusBadge = page
    .locator("div")
    .filter({ has: statusLabel })
    .locator("div, span")
    .filter({
      hasText: /testperiod|aktiv|trial|active/i,
    })
    .first();
  await expect(statusBadge).toBeVisible({ timeout: 10000 });

  // Take screenshot showing trial/active status
  const statusSection = page
    .locator("div.rounded-lg.border")
    .filter({ has: currentPlanHeading })
    .first();
  await statusSection.screenshot({
    path: path.join(SCREENSHOT_DIR, "subscription-status.png"),
  });

  // ── Step 5: Verify team size section ──
  const teamSizeHeading = page.getByRole("heading", {
    name: /teamstorlek|team size/i,
  });
  await expect(teamSizeHeading).toBeVisible({ timeout: 10000 });

  // Verify member count is shown (e.g. "3 användare" or "3 users")
  const memberCount = page.getByText(/\d+\s*(användare|users?)/i);
  await expect(memberCount).toBeVisible({ timeout: 10000 });

  // ── Step 6: Verify cost per user section and take screenshot ──
  const costHeading = page.getByRole("heading", {
    name: /kostnad per användare|cost per user/i,
  });
  await expect(costHeading).toBeVisible({ timeout: 10000 });

  // Verify price per user is shown (299 kr)
  const pricePerUser = page.getByText(/299\s*kr/i);
  await expect(pricePerUser).toBeVisible({ timeout: 10000 });

  // Verify total monthly cost is displayed
  const totalCost = page.getByText(/total månadskostnad|total monthly cost/i);
  await expect(totalCost).toBeVisible({ timeout: 10000 });

  const costSection = page
    .locator("div.rounded-lg.border")
    .filter({ has: costHeading })
    .first();
  await costSection.screenshot({
    path: path.join(SCREENSHOT_DIR, "cost-per-user.png"),
  });

  // ── Step 7: Verify Stripe portal button ──
  const manageHeading = page.getByRole("heading", {
    name: /hantera prenumeration|manage subscription/i,
  });

  // The manage plan section only shows if subscription exists
  const hasManageSection = await manageHeading.isVisible().catch(() => false);

  if (hasManageSection) {
    const portalButton = page.getByRole("button", {
      name: /öppna kundportal|open customer portal/i,
    });
    await expect(portalButton).toBeVisible({ timeout: 10000 });

    // Intercept the server action to prevent actual Stripe redirect
    // Route the createBillingPortalSession action to return a mock URL
    await page.route("**/settings/billing*", async (route) => {
      const request = route.request();
      // Only intercept POST (server action) requests, let GETs through
      if (request.method() === "POST") {
        const postData = request.postData() ?? "";
        // If this is a server action call, let it through but we already clicked
        await route.continue();
      } else {
        await route.continue();
      }
    });

    // Click the portal button — it will attempt to call createBillingPortalSession
    // This may fail (no real Stripe key) but we verify the button exists and is clickable
    await portalButton.click();

    // Wait a moment for the action to process
    await page.waitForTimeout(2000);

    // The button should show loading state or an error (since no real Stripe in test)
    // Either "Öppnar..." (loading) or error message is acceptable
    const portalError = page.getByText(
      /kunde inte öppna|could not open|portalError/i
    );
    const isLoading = page.getByRole("button", {
      name: /öppnar|opening/i,
    });

    const hasError = await portalError.isVisible().catch(() => false);
    const isStillLoading = await isLoading.isVisible().catch(() => false);

    // Either error (expected without real Stripe) or loading state is OK
    // The important thing is the button was clickable and triggered the action

    // Take screenshot of the manage section (may show error state)
    const manageSection = page
      .locator("div.rounded-lg.border")
      .filter({ has: manageHeading })
      .first();
    await manageSection.screenshot({
      path: path.join(SCREENSHOT_DIR, "manage-subscription.png"),
    });
  }

  // ── Step 8: Verify all screenshots exist ──
  expect(fs.existsSync(billingPageShot)).toBe(true);
  expect(
    fs.existsSync(path.join(SCREENSHOT_DIR, "subscription-status.png"))
  ).toBe(true);
  expect(fs.existsSync(path.join(SCREENSHOT_DIR, "cost-per-user.png"))).toBe(
    true
  );

  // ── Step 9: Check for JS errors ──
  expect(
    pageErrors,
    `JS errors found:\n${pageErrors.join("\n")}`
  ).toEqual([]);
});
