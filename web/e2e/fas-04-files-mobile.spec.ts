import { test, expect } from "@playwright/test";

/**
 * File detail modal on mobile viewport.
 *
 * Flow (matches real user):
 * 1. Log in
 * 2. On mobile the topbar is always visible; project content is in main (no need to open hamburger when navigating by URL)
 * 3. Go to project files tab (?tab=files so Filer is active)
 * 4. Wait for file list and find the card that contains a filename (e.g. .pdf); click the card’s primary button to open detail modal
 * 5. Assert modal visible and no horizontal overflow; close modal
 *
 * Requires: server on baseURL, DB seeded (admin@example.com / password123, project seed-project-1 with at least one file).
 * Run: web/scripts/run-fas04-files-mobile-e2e.sh or npx playwright test with PLAYWRIGHT_BROWSERS_PATH if needed.
 */
const SEED_PROJECT_ID = "seed-project-1";
const LOCALE = "sv";

test.describe("File detail modal on mobile viewport", () => {
  test("file detail modal opens and has no horizontal overflow on mobile", async ({
    page,
  }) => {
    test.setTimeout(90000);

    // --- Login ---
    await page.goto(`/${LOCALE}/login`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.getByLabel(/e-post|email/i).fill("admin@example.com");
    await page.getByLabel(/lösenord|password/i).fill("password123");
    await page.getByRole("button", { name: /logga in|sign in/i }).click();
    await expect(page).toHaveURL(new RegExp(`/${LOCALE}/dashboard`), {
      timeout: 25000,
    });

    // --- Go to project files tab (URL selects tab so Filer is active) ---
    await page.goto(`/${LOCALE}/projects/${SEED_PROJECT_ID}?tab=files`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await expect(page).toHaveURL(new RegExp(`/${LOCALE}/projects/${SEED_PROJECT_ID}`), {
      timeout: 10000,
    });

    // --- Ensure Filer tab is active (in case URL param was ignored) ---
    const filerTab = page.getByRole("tab", { name: "Filer" });
    await filerTab.click();
    const filesTabPanel = page.getByRole("tabpanel", { name: "Filer" });
    await expect(filesTabPanel).toBeVisible({ timeout: 5000 });

    // --- Wait for file list and the seed file name (so we target the right card) ---
    await expect(
      filesTabPanel.getByText(/uppladdade filer|uploaded files/i)
    ).toBeVisible({ timeout: 5000 });
    const fileNameParagraph = filesTabPanel.getByText(/e2e-plan\.pdf|ritning.*\.png|\.(pdf|png|jpg|jpeg|docx|xlsx)$/i).first();
    await expect(fileNameParagraph).toBeVisible({ timeout: 10000 });

    // --- Thumbnail button is in the same card as the filename (card = 3 levels up from the <p>) ---
    const fileCard = fileNameParagraph.locator("..").locator("..").locator("..");
    const openDetailButton = fileCard.locator("button").first();
    await openDetailButton.scrollIntoViewIfNeeded();
    await openDetailButton.click();
    await page.waitForTimeout(1200);

    // --- Modal visible and no horizontal overflow ---
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });
    const hasHorizontalScroll = await page.evaluate(() => {
      const html = document.documentElement;
      return html.scrollWidth > html.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);

    // --- Close modal ---
    const closeButton = page.getByRole("button", { name: /stäng|close/i }).first();
    await expect(closeButton).toBeVisible({ timeout: 3000 });
    await closeButton.click();
    await expect(dialog).not.toBeVisible({ timeout: 3000 });
  });

  test("upload area (dropzone) is visible on Files tab", async ({ page }) => {
    test.setTimeout(60000);

    // --- Login ---
    await page.goto(`/${LOCALE}/login`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.getByLabel(/e-post|email/i).fill("admin@example.com");
    await page.getByLabel(/lösenord|password/i).fill("password123");
    await page.getByRole("button", { name: /logga in|sign in/i }).click();
    await expect(page).toHaveURL(new RegExp(`/${LOCALE}/dashboard`), {
      timeout: 25000,
    });

    // --- Go to project files tab ---
    await page.goto(`/${LOCALE}/projects/${SEED_PROJECT_ID}?tab=files`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    const filerTab = page.getByRole("tab", { name: "Filer" });
    await filerTab.click();
    const filesTabPanel = page.getByRole("tabpanel", { name: "Filer" });
    await expect(filesTabPanel).toBeVisible({ timeout: 5000 });

    // --- Upload area: dropzone text and/or choose-files button ---
    const dropzoneText = filesTabPanel.getByText(
      /dra och släpp filer|drag and drop files/i
    );
    await expect(dropzoneText).toBeVisible({ timeout: 5000 });
    const chooseFilesButton = filesTabPanel.getByRole("button", {
      name: /välj filer|choose files/i,
    });
    await expect(chooseFilesButton).toBeVisible({ timeout: 3000 });
  });
});
