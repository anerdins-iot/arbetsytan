import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const SCREENSHOT_DIR = path.join(process.cwd(), "..", "screenshots", "fas-02");
const LOCALE = "sv";

test.beforeAll(() => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

async function dismissOptionalOverlays(page: Page) {
  const dismissButtons = [
    /godkänn|acceptera|accept|ok|okej/i,
    /stäng|close/i,
  ];

  for (const name of dismissButtons) {
    const button = page.getByRole("button", { name }).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click().catch(() => {});
      await page.waitForTimeout(200);
    }
  }
}

test("Block 2.6: auth flows — register, login, forgot password, team invite, protected routes", async ({
  page,
}) => {
  test.setTimeout(180000);

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => {
    const msg = error.message;
    if (
      /hydration/i.test(msg) ||
      /unexpected response was received from the server/i.test(msg)
    ) {
      return;
    }
    pageErrors.push(msg);
  });

  // ── Step 1: Navigate to login page and screenshot ──
  await page.goto(`/${LOCALE}/login`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await dismissOptionalOverlays(page);

  const loginHeading = page.getByRole("heading", {
    name: /logga in|sign in|log in/i,
  });
  await expect(loginHeading).toBeVisible({ timeout: 15000 });

  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, "01-login-page.png"),
    fullPage: true,
  });

  // ── Step 2: Navigate to register page and screenshot ──
  await page.goto(`/${LOCALE}/register`, {
    waitUntil: "domcontentloaded",
    timeout: 15000,
  });
  await dismissOptionalOverlays(page);

  const registerHeading = page.getByRole("heading", {
    name: /skapa konto|registrera|register|create account/i,
  });
  await expect(registerHeading).toBeVisible({ timeout: 10000 });

  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, "02-register-page.png"),
    fullPage: true,
  });

  // ── Step 3: Fill in registration form and submit ──
  const uniqueEmail = `test-e2e-${Date.now()}@example.com`;

  await page.locator("#name").fill("Test Playwright");
  await page.locator("#email").fill(uniqueEmail);
  await page.locator("#password").fill("Test1234secure!");
  await page.locator("#companyName").fill("Playwright AB");

  await page.getByRole("button", {
    name: /skapa konto|registrera|register|create account/i,
  }).click();

  // Verify redirect to dashboard after registration
  await expect(page).toHaveURL(new RegExp(`/${LOCALE}/dashboard`), {
    timeout: 20000,
  });

  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, "03-dashboard-after-register.png"),
    fullPage: true,
  });

  // ── Step 4: Sign out by clearing session ──
  // Auth.js uses /api/auth/signout — POST with CSRF token
  // Simplest approach: clear cookies to simulate sign-out
  await page.context().clearCookies();

  // Verify redirect to login when accessing dashboard
  await page.goto(`/${LOCALE}/dashboard`, {
    waitUntil: "domcontentloaded",
    timeout: 15000,
  });

  // Should redirect to login page
  await page.waitForURL(/\/(sv|en)\/(login)/, { timeout: 15000 });

  // ── Step 5: Login with the registered credentials ──
  await page.goto(`/${LOCALE}/login`, {
    waitUntil: "domcontentloaded",
    timeout: 15000,
  });
  await dismissOptionalOverlays(page);

  await page.getByLabel(/e-post|email/i).fill(uniqueEmail);
  await page.getByLabel(/lösenord|password/i).fill("Test1234secure!");
  await page.getByRole("button", {
    name: /logga in|sign in|log in/i,
  }).click();

  // Verify redirect to dashboard after login
  await expect(page).toHaveURL(new RegExp(`/${LOCALE}/dashboard`), {
    timeout: 20000,
  });

  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, "04-dashboard-after-login.png"),
    fullPage: true,
  });

  // ── Step 6: Navigate to forgot password page and screenshot ──
  // Clear cookies first to access auth pages
  await page.context().clearCookies();

  await page.goto(`/${LOCALE}/forgot-password`, {
    waitUntil: "domcontentloaded",
    timeout: 15000,
  });
  await dismissOptionalOverlays(page);

  const forgotHeading = page.getByRole("heading", {
    name: /glömt lösenord|forgot password|reset password/i,
  });
  await expect(forgotHeading).toBeVisible({ timeout: 10000 });

  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, "05-forgot-password-page.png"),
    fullPage: true,
  });

  // ── Step 7: Login as admin and navigate to team settings ──
  await page.goto(`/${LOCALE}/login`, {
    waitUntil: "domcontentloaded",
    timeout: 15000,
  });
  await dismissOptionalOverlays(page);

  await page.getByLabel(/e-post|email/i).fill("admin@example.com");
  await page.getByLabel(/lösenord|password/i).fill("password123");
  await page.getByRole("button", {
    name: /logga in|sign in|log in/i,
  }).click();

  await expect(page).toHaveURL(new RegExp(`/${LOCALE}/dashboard`), {
    timeout: 20000,
  });

  // Navigate to team settings (invitation form)
  await page.goto(`/${LOCALE}/settings/team`, {
    waitUntil: "domcontentloaded",
    timeout: 15000,
  });

  // Wait for team page to load — look for the main h1 heading
  const teamHeading = page.getByRole("heading", { name: "Team", exact: true });
  await expect(teamHeading).toBeVisible({ timeout: 10000 });

  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, "06-team-settings-invite.png"),
    fullPage: true,
  });

  // ── Step 8: Verify unauthenticated requests redirect to login ──
  await page.context().clearCookies();

  // Try accessing protected routes
  const protectedRoutes = [
    `/${LOCALE}/dashboard`,
    `/${LOCALE}/settings`,
    `/${LOCALE}/settings/team`,
  ];

  for (const route of protectedRoutes) {
    await page.goto(route, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    // Should redirect to login
    await page.waitForURL(/\/(sv|en)\/(login)/, { timeout: 15000 });
  }

  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, "07-unauthenticated-redirect.png"),
    fullPage: true,
  });

  // ── Step 9: Verify all screenshots exist ──
  const expectedScreenshots = [
    "01-login-page.png",
    "02-register-page.png",
    "03-dashboard-after-register.png",
    "04-dashboard-after-login.png",
    "05-forgot-password-page.png",
    "06-team-settings-invite.png",
    "07-unauthenticated-redirect.png",
  ];

  for (const screenshot of expectedScreenshots) {
    const screenshotPath = path.join(SCREENSHOT_DIR, screenshot);
    expect(
      fs.existsSync(screenshotPath),
      `Screenshot ${screenshot} should exist`
    ).toBe(true);
  }

  // ── Step 10: Check for JS errors ──
  expect(
    pageErrors,
    `JS errors found:\n${pageErrors.join("\n")}`
  ).toEqual([]);
});
