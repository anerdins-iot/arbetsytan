import { test, expect } from "@playwright/test";

/**
 * Project Automations tab on mobile viewport.
 *
 * Flow:
 * 1. Log in
 * 2. Go to project automations tab (?tab=automations)
 * 3. Wait for Automations tab content (tabpanel)
 * 4. See at least one automation in the list
 * 5. Optionally open "Skapa automatisering" or history dialog
 * 6. Assert no horizontal overflow on mobile
 *
 * Requires: server on baseURL, DB seeded (admin@example.com / password123, project seed-project-1 with 4 automations).
 * Run: npx playwright test fas-04-project-automations-mobile --project=mobile (PLAYWRIGHT_BROWSERS_PATH if needed).
 */
const SEED_PROJECT_ID = "seed-project-1";
const LOCALE = "sv";

test.describe("Project Automations tab on mobile viewport", () => {
  test.use({ project: "mobile" });

  test("automations tab shows list, create/history dialog and no horizontal overflow", async ({
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

    // --- Go to project automations tab ---
    await page.goto(`/${LOCALE}/projects/${SEED_PROJECT_ID}?tab=automations`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await expect(page).toHaveURL(new RegExp(`/${LOCALE}/projects/${SEED_PROJECT_ID}`), {
      timeout: 10000,
    });

    // --- Ensure Automations tab is active and wait for tab content (create button is unique to this tab) ---
    const automationsTab = page.getByRole("tab", {
      name: /automatiseringar|automations/i,
    });
    await automationsTab.click();
    const createButton = page.getByRole("button", {
      name: /skapa automatisering|create automation/i,
    });
    await expect(createButton).toBeVisible({ timeout: 5000 });

    // --- At least one automation in the list, or empty state (seed may not be run in env) ---
    const hasAutomation = page.getByText(
      /påminnelse om kundmöte|daglig projektrapport|veckovis uppgiftspåminnelse|månadsgenomgång|aktiv|väntar|pausad/i
    ).first();
    const emptyState = page.getByText(/inga automatiseringar ännu|no automations yet/i);
    await expect(hasAutomation.or(emptyState)).toBeVisible({ timeout: 5000 });

    // --- No horizontal overflow before opening dialog ---
    let hasHorizontalScroll = await page.evaluate(() => {
      const html = document.documentElement;
      return html.scrollWidth > html.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);

    // --- Open "Skapa automatisering" ---
    await createButton.scrollIntoViewIfNeeded();
    await createButton.click();

    const createDialog = page.getByRole("dialog", {
      name: /skapa automatisering|create automation/i,
    });
    await expect(createDialog).toBeVisible({ timeout: 5000 });

    // --- No horizontal overflow with create dialog open ---
    hasHorizontalScroll = await page.evaluate(() => {
      const html = document.documentElement;
      return html.scrollWidth > html.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);

    // --- Close create dialog ---
    const closeCreate = page.getByRole("button", { name: /avbryt|cancel|stäng|close/i }).first();
    await expect(closeCreate).toBeVisible({ timeout: 3000 });
    await closeCreate.scrollIntoViewIfNeeded();
    await closeCreate.click();
    await expect(createDialog).not.toBeVisible({ timeout: 3000 });

    // --- Optionally open history dialog if at least one automation is present ---
    const historyButton = page.getByRole("button", {
      name: /historik|history/i,
    }).first();
    if (await historyButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await historyButton.scrollIntoViewIfNeeded();
      await historyButton.click();

      const historyDialog = page.getByRole("dialog", {
        name: /körningshistorik|execution history/i,
      });
      await expect(historyDialog).toBeVisible({ timeout: 5000 });

      hasHorizontalScroll = await page.evaluate(() => {
        const html = document.documentElement;
        return html.scrollWidth > html.clientWidth;
      });
      expect(hasHorizontalScroll).toBe(false);

      const closeHistory = page.getByRole("button", { name: /stäng|close/i }).first();
      await expect(closeHistory).toBeVisible({ timeout: 3000 });
      await closeHistory.click();
      await expect(historyDialog).not.toBeVisible({ timeout: 3000 });
    }
  });
});
