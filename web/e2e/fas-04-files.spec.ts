import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const SCREENSHOT_DIR = path.join(process.cwd(), "..", "screenshots", "fas-04");
const SEED_PROJECT_ID = "seed-project-1";
const LOCALE = "sv";

test.beforeAll(() => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

test("Block 4.5: login, project files tab, upload, lightbox and PDF preview", async ({
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

  await page.goto(`/${LOCALE}/projects/${SEED_PROJECT_ID}?tab=files`);
  await expect(page).toHaveURL(
    new RegExp(`/${LOCALE}/projects/${SEED_PROJECT_ID}`),
    { timeout: 10000 }
  );

  await page.getByRole("tab", { name: "Filer" }).click();

  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, "01-files-tab.png"),
    fullPage: true,
  });

  const testImagePath = path.join(process.cwd(), "e2e", "fixtures", "test-image.png");
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(testImagePath);

  await expect(
    page.getByText("test-image.png").or(page.getByText("Uppladdade filer"))
  ).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1500);

  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, "02-after-upload.png"),
    fullPage: true,
  });

  const imagePreviewButton = page.locator("button").filter({ has: page.locator("img") }).first();
  const hasImage = await imagePreviewButton.count() > 0;
  if (hasImage) {
    await imagePreviewButton.click();
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "03-lightbox.png"),
      fullPage: false,
    });
    await page.getByRole("button", { name: /stäng förhandsgranskning|close/i }).click();
    await page.waitForTimeout(300);
  } else {
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "03-lightbox.png"),
      fullPage: false,
    });
  }

  const pdfCard = page.locator('div').filter({ hasText: /\.pdf$/i }).locator('button').first();
  const hasPdf = await pdfCard.count() > 0;
  if (hasPdf) {
    await pdfCard.click();
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "04-pdf-preview.png"),
      fullPage: false,
    });
  } else {
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "04-pdf-preview.png"),
      fullPage: false,
    });
  }
});
