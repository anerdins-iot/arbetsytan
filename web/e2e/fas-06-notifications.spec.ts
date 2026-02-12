import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const SCREENSHOT_DIR = path.join(process.cwd(), "..", "screenshots", "fas-06");
const LOCALE = "sv";

test.beforeAll(() => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

test("Block 6.5: login, notification bell, notification list and push settings screenshots", async ({
  page,
}) => {
  test.setTimeout(90000);

  await page.goto(`/${LOCALE}/login`, { waitUntil: "domcontentloaded", timeout: 45000 });

  await page.getByLabel(/e-post|email/i).fill("admin@example.com");
  await page.getByLabel(/lösenord|password/i).fill("password123");
  await page.getByRole("button", { name: /logga in|sign in/i }).click();

  await expect(page).toHaveURL(new RegExp(`/${LOCALE}/dashboard`), {
    timeout: 10000,
  });

  const notificationButton = page.getByRole("button", {
    name: /notifikationer|notifications/i,
  });
  await expect(notificationButton).toBeVisible({ timeout: 5000 });

  await notificationButton.click();
  await page.waitForTimeout(600);

  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, "01-notification-list.png"),
    fullPage: false,
  });

  await page.goto(`/${LOCALE}/settings`, { waitUntil: "domcontentloaded", timeout: 10000 });
  await expect(page).toHaveURL(new RegExp(`/${LOCALE}/settings`), { timeout: 5000 });

  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, "02-push-settings.png"),
    fullPage: true,
  });
});
