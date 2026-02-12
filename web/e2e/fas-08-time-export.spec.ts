import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const SCREENSHOT_DIR = path.join(process.cwd(), "..", "screenshots", "fas-08");
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

  await expect(page).toHaveURL(new RegExp(`/${LOCALE}/dashboard`), { timeout: 15000 });
}

async function getFirstProjectPath(page: Page) {
  await page.goto(`/${LOCALE}/projects`, {
    waitUntil: "domcontentloaded",
    timeout: 20000,
  });
  await dismissOptionalOverlays(page);

  const projectLinks = page.locator(`a[href^="/${LOCALE}/projects/"]`);
  await expect(projectLinks.first()).toBeVisible({ timeout: 15000 });
  const firstHref = await projectLinks.first().getAttribute("href");
  if (!firstHref || !new RegExp(`^/${LOCALE}/projects/[^/]+$`).test(firstHref)) {
    throw new Error("Kunde inte hitta ett projekt i listan.");
  }

  return firstHref;
}

async function waitForOpenedUrlCount(page: Page, expectedCount: number) {
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const opened = (window as Window & { __openedUrls?: string[] }).__openedUrls;
          return Array.isArray(opened) ? opened.length : 0;
        }),
      { timeout: 20000 }
    )
    .toBeGreaterThanOrEqual(expectedCount);
}

async function getLastOpenedUrl(page: Page) {
  return page.evaluate(() => {
    const opened = (window as Window & { __openedUrls?: string[] }).__openedUrls ?? [];
    return opened[opened.length - 1] ?? "";
  });
}

test("Block 8.3: time tracking and export flow", async ({ page }) => {
  test.setTimeout(180000);

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => {
    if (!/hydration/i.test(error.message)) {
      pageErrors.push(error.message);
    }
  });

  await page.addInitScript(() => {
    const withOpenedUrls = window as Window & {
      __openedUrls?: string[];
      __openPatched?: boolean;
      open: Window["open"];
    };

    if (withOpenedUrls.__openPatched) {
      return;
    }

    withOpenedUrls.__openedUrls = [];
    withOpenedUrls.__openPatched = true;
    const originalOpen = window.open.bind(window);

    window.open = ((...args: Parameters<Window["open"]>) => {
      const [url] = args;
      if (typeof url === "string") {
        withOpenedUrls.__openedUrls?.push(url);
      }
      return originalOpen(...args);
    }) as Window["open"];
  });

  await loginAsAdmin(page);
  const firstProjectPath = await getFirstProjectPath(page);
  const timeTrackingShot = path.join(SCREENSHOT_DIR, "time-tracking-tab.png");
  const summaryShot = path.join(SCREENSHOT_DIR, "time-summary.png");
  const exportPanelShot = path.join(SCREENSHOT_DIR, "export-panel.png");

  await page.goto(`${firstProjectPath}?tab=time`, {
    waitUntil: "domcontentloaded",
    timeout: 20000,
  });
  await dismissOptionalOverlays(page);

  const timeTab = page.getByRole("tab", { name: /tid|time/i });
  await expect(timeTab).toBeVisible({ timeout: 10000 });

  await expect(page.getByText(/registrera tid/i).first()).toBeVisible({ timeout: 10000 });
  await page.screenshot({
    path: timeTrackingShot,
    fullPage: true,
  });

  const noTasksMessage = page.getByText(/inga uppgifter att rapportera tid på ännu/i);
  const hasNoTasks = await noTasksMessage.isVisible().catch(() => false);

  if (!hasNoTasks) {
    const uniqueDescription = `PW Fas 8 ${Date.now()}`;
    await page.getByLabel(/antal|amount/i).fill("45");
    await page.getByLabel(/beskrivning|description/i).fill(uniqueDescription);
    await page.getByRole("button", { name: /spara tid/i }).click();

    await expect(page.getByText(uniqueDescription)).toBeVisible({ timeout: 15000 });
  }

  await expect(page.getByText(/per dag/i).first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/per vecka/i).first()).toBeVisible({ timeout: 10000 });
  await page.getByText(/per dag/i).first().scrollIntoViewIfNeeded();
  await page.screenshot({
    path: summaryShot,
    fullPage: true,
  });

  const exportHeading = page.getByText(/export och rapporter/i).first();
  await expect(exportHeading).toBeVisible({ timeout: 10000 });
  const exportPanel = page.locator("div.rounded-lg, div.rounded-xl").filter({ has: exportHeading });
  await exportPanel.first().screenshot({
    path: exportPanelShot,
  });

  const timeReportButton = page.getByRole("button", { name: /exportera tidrapport/i });
  await expect(timeReportButton).toBeVisible({ timeout: 10000 });
  await timeReportButton.click();
  await waitForOpenedUrlCount(page, 1);

  const excelUrl = await getLastOpenedUrl(page);
  expect(excelUrl).toMatch(/^https?:\/\//);

  const projectSummaryButton = page.getByRole("button", {
    name: /exportera projektsammanställning|exportera projektsammanstallning/i,
  });
  await expect(projectSummaryButton).toBeVisible({ timeout: 10000 });
  await projectSummaryButton.click();
  await waitForOpenedUrlCount(page, 2);

  const pdfUrl = await getLastOpenedUrl(page);
  expect(pdfUrl).toMatch(/^https?:\/\//);

  expect(fs.existsSync(timeTrackingShot)).toBe(true);
  expect(fs.existsSync(summaryShot)).toBe(true);
  expect(fs.existsSync(exportPanelShot)).toBe(true);
  expect(pageErrors, `JS errors found:\n${pageErrors.join("\n")}`).toEqual([]);
});
