import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const SCREENSHOT_DIR = path.join(process.cwd(), "..", "screenshots", "fas-10");
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

test("Block 10.2: landing page screenshots and CTA verification", async ({
  page,
}) => {
  test.setTimeout(180000);

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => {
    if (!/hydration/i.test(error.message)) {
      pageErrors.push(error.message);
    }
  });

  // ── Step 1: Navigate to landing page ──
  await page.goto(`/${LOCALE}`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await dismissOptionalOverlays(page);

  // Verify page loaded — check for brand name in header
  const brandName = page.getByText("ArbetsYtan").first();
  await expect(brandName).toBeVisible({ timeout: 15000 });

  // ── Step 2: Screenshot Hero section (desktop) ──
  // The hero section is the first section in main
  const heroSection = page.locator("main > section").first();
  await expect(heroSection).toBeVisible({ timeout: 10000 });

  // Verify hero heading is visible
  const heroHeading = page.getByRole("heading", {
    name: /smartare projektledning|smarter project management/i,
  });
  await expect(heroHeading).toBeVisible({ timeout: 10000 });

  await heroSection.screenshot({
    path: path.join(SCREENSHOT_DIR, "hero-desktop.png"),
  });

  // ── Step 3: Screenshot Features section ──
  const featuresSection = page.locator("#features");
  await featuresSection.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  // Verify features heading
  const featuresHeading = page.getByRole("heading", {
    name: /allt du behöver|everything you need/i,
  });
  await expect(featuresHeading).toBeVisible({ timeout: 10000 });

  await featuresSection.screenshot({
    path: path.join(SCREENSHOT_DIR, "features.png"),
  });

  // ── Step 4: Screenshot "How it works" section ──
  const howItWorksSection = page.locator("#how-it-works");
  await howItWorksSection.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  // Verify heading
  const howItWorksHeading = page.getByRole("heading", {
    name: /kom igång på tre steg|get started in three steps/i,
  });
  await expect(howItWorksHeading).toBeVisible({ timeout: 10000 });

  await howItWorksSection.screenshot({
    path: path.join(SCREENSHOT_DIR, "how-it-works.png"),
  });

  // ── Step 5: Screenshot Pricing section ──
  const pricingSection = page.locator("#pricing");
  await pricingSection.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  // Verify pricing heading
  const pricingHeading = page.getByRole("heading", {
    name: /enkel och transparent|simple and transparent/i,
  });
  await expect(pricingHeading).toBeVisible({ timeout: 10000 });

  await pricingSection.screenshot({
    path: path.join(SCREENSHOT_DIR, "pricing.png"),
  });

  // ── Step 6: Screenshot Social proof / Testimonials section ──
  // Social proof section has no id, find it by heading text
  const socialProofHeading = page.getByRole("heading", {
    name: /hantverkare som redan|craftsmen who already/i,
  });
  await socialProofHeading.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await expect(socialProofHeading).toBeVisible({ timeout: 10000 });

  // Take screenshot of the section containing testimonials
  const socialProofSection = socialProofHeading.locator("ancestor::section").first();
  // Fallback: use the section that comes after pricing
  const testimonialSection = page.locator("section").filter({
    has: socialProofHeading,
  });
  await testimonialSection.screenshot({
    path: path.join(SCREENSHOT_DIR, "testimonials.png"),
  });

  // ── Step 7: Screenshot Footer ──
  const footer = page.locator("footer");
  await footer.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await expect(footer).toBeVisible({ timeout: 10000 });

  await footer.screenshot({
    path: path.join(SCREENSHOT_DIR, "footer.png"),
  });

  // ── Step 8: Mobile viewport (375x812 - iPhone SE) ──
  await page.setViewportSize({ width: 375, height: 812 });

  // Go back to top of page
  await page.goto(`/${LOCALE}`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForTimeout(1000);

  // Take full-page screenshot in mobile viewport
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, "mobile-full.png"),
    fullPage: true,
  });

  // ── Step 9: Verify CTA button ("Kom igång gratis" / "Get started free") ──
  // Reset to desktop viewport for CTA test
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`/${LOCALE}`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForTimeout(1000);

  // Find the hero CTA button "Kom igång gratis"
  const ctaButton = page
    .getByRole("link", { name: /kom igång gratis|get started free/i })
    .first();
  await expect(ctaButton).toBeVisible({ timeout: 10000 });

  // Verify the CTA link is clickable and has an href
  const ctaHref = await ctaButton.getAttribute("href");
  expect(ctaHref).toBeTruthy();

  // Click CTA and verify navigation
  await ctaButton.click();
  await page.waitForTimeout(2000);

  // The CTA links to "/" which with locale becomes /sv or /en
  // Verify we're on a valid page (no error)
  const currentUrl = page.url();
  expect(currentUrl).toMatch(/\/(sv|en)/);

  // ── Step 10: Verify all screenshots exist ──
  const expectedScreenshots = [
    "hero-desktop.png",
    "features.png",
    "how-it-works.png",
    "pricing.png",
    "testimonials.png",
    "footer.png",
    "mobile-full.png",
  ];

  for (const screenshot of expectedScreenshots) {
    const screenshotPath = path.join(SCREENSHOT_DIR, screenshot);
    expect(
      fs.existsSync(screenshotPath),
      `Screenshot ${screenshot} should exist`
    ).toBe(true);
  }

  // ── Step 11: Check for JS errors ──
  expect(
    pageErrors,
    `JS errors found:\n${pageErrors.join("\n")}`
  ).toEqual([]);
});
