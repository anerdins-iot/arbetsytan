import { test, expect, type Locator, type Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const SCREENSHOT_DIR = path.join(process.cwd(), "..", "screenshots", "fas-07");
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

async function openSelectAndChoose(trigger: Locator, optionText: RegExp) {
  await trigger.click();
  await trigger.page().getByRole("option", { name: optionText }).first().click();
}

test("Block 7.4: settings flow, language switch, dark mode and screenshots", async ({
  page,
}) => {
  test.setTimeout(120000);

  // Track real JS errors (not hydration warnings or React dev warnings)
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => {
    // Only track actual runtime errors, not hydration mismatches
    if (!error.message.includes("hydration") && !error.message.includes("Hydration")) {
      pageErrors.push(error.message);
    }
  });

  await loginAsAdmin(page);

  await page.goto(`/${LOCALE}/settings`, {
    waitUntil: "domcontentloaded",
    timeout: 15000,
  });
  await expect(page).toHaveURL(new RegExp(`/${LOCALE}/settings`), { timeout: 10000 });
  await dismissOptionalOverlays(page);

  const companyTitle = page.getByRole("heading", { name: /företag|company/i });
  await expect(companyTitle).toBeVisible({ timeout: 10000 });
  const companySection = page.locator("div.rounded-lg.border").filter({ has: companyTitle }).first();
  await companySection.screenshot({
    path: path.join(SCREENSHOT_DIR, "01-company-settings.png"),
  });

  const usersTitle = page.getByRole("heading", { name: /användare|users/i });
  await expect(usersTitle).toBeVisible({ timeout: 10000 });
  const usersSection = page.locator("div.rounded-lg.border").filter({ has: usersTitle }).first();
  await usersSection.screenshot({
    path: path.join(SCREENSHOT_DIR, "02-user-list.png"),
  });

  const roleTriggers = usersSection.locator('button[role="combobox"]');
  const roleTriggerCount = await roleTriggers.count();
  if (roleTriggerCount > 1) {
    const targetRoleTrigger = roleTriggers.nth(1);
    const initialRole = (await targetRoleTrigger.textContent())?.trim() ?? "";

    const fallbackRole = /admin/i.test(initialRole)
      ? /projektledare|project manager|montör|worker/i
      : /admin/i;

    await openSelectAndChoose(targetRoleTrigger, fallbackRole);
    await page.waitForTimeout(800);

    const saveError = page.getByText(
      /kunde inte uppdatera användaren|could not update the user|det måste finnas minst en admin|at least one admin must remain/i
    );
    if (!(await saveError.isVisible().catch(() => false)) && initialRole.length > 0) {
      await openSelectAndChoose(roleTriggers.nth(1), new RegExp(initialRole, "i"));
      await page.waitForTimeout(800);
    }
  }

  const permissionsTitle = page.getByRole("heading", {
    name: /rättigheter per roll|role permissions/i,
  });
  await expect(permissionsTitle).toBeVisible({ timeout: 10000 });
  const permissionsSection = page
    .locator("div.rounded-lg.border")
    .filter({ has: permissionsTitle })
    .first();
  await permissionsSection.screenshot({
    path: path.join(SCREENSHOT_DIR, "03-permissions-matrix.png"),
  });

  await page.goto(`/${LOCALE}/settings/profile`, {
    waitUntil: "domcontentloaded",
    timeout: 15000,
  });
  await expect(page).toHaveURL(new RegExp(`/${LOCALE}/settings/profile`), {
    timeout: 10000,
  });

  const profileHeading = page.getByRole("heading", {
    name: /personliga inställningar|personal settings/i,
  });
  await expect(profileHeading).toBeVisible({ timeout: 10000 });
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, "04-profile-settings.png"),
    fullPage: true,
  });

  // Change language preference (saves to User.locale but doesn't auto-redirect)
  const languageSelect = page.getByLabel(/språk|language/i);
  await expect(languageSelect).toBeVisible({ timeout: 10000 });
  await languageSelect.click();
  await page.getByRole("option", { name: /engelska|english/i }).click();

  // Wait for preference to be saved, then manually navigate to English version
  await page.waitForTimeout(1000);
  await page.goto("/en/settings/profile", { waitUntil: "domcontentloaded" });

  await expect(page).toHaveURL(/\/en\/settings\/profile/, { timeout: 10000 });
  await expect(page.getByRole("heading", { name: /personal settings/i })).toBeVisible({
    timeout: 10000,
  });

  // After switching to English, only use English label
  const darkModeToggle = page.getByRole("checkbox", { name: /dark mode/i });
  await expect(darkModeToggle).toBeVisible({ timeout: 10000 });
  const wasDark = await darkModeToggle.isChecked();
  await darkModeToggle.click();
  await expect(darkModeToggle).toHaveJSProperty("checked", !wasDark);

  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, "05-language-en-dark-mode.png"),
    fullPage: true,
  });

  // Only check for real JS errors (hydration warnings are ignored)
  expect(
    pageErrors,
    `JS errors found:\n${pageErrors.join("\n")}`
  ).toEqual([]);
});
