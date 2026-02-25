import { test, expect } from "@playwright/test";

/**
 * Project Tasks tab (Kanban) on mobile viewport.
 *
 * Flow:
 * 1. Log in
 * 2. Go to project tasks tab (?tab=tasks)
 * 3. Wait for Kanban / tab panel
 * 4. See at least one task column and one task card
 * 5. Optionally open "Skapa uppgift" (create task) dialog
 * 6. Assert no horizontal overflow on mobile
 *
 * Requires: server on baseURL, DB seeded (admin@example.com / password123, project seed-project-1 with 4 tasks).
 * Run: npx playwright test fas-04-project-tasks-mobile --project=mobile (PLAYWRIGHT_BROWSERS_PATH if needed).
 */
const SEED_PROJECT_ID = "seed-project-1";
const LOCALE = "sv";

test.describe("Project Tasks tab (Kanban) on mobile viewport", () => {
  test("tasks tab shows Kanban with column and card, create dialog and no horizontal overflow", async ({
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

    // --- Go to project tasks tab ---
    await page.goto(`/${LOCALE}/projects/${SEED_PROJECT_ID}?tab=tasks`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await expect(page).toHaveURL(new RegExp(`/${LOCALE}/projects/${SEED_PROJECT_ID}`), {
      timeout: 10000,
    });

    // --- Ensure Uppgifter tab is active and wait for Kanban panel ---
    const tasksTab = page.getByRole("tab", { name: /uppgifter|tasks/i });
    await tasksTab.click();
    const tasksTabPanel = page.getByRole("tabpanel", { name: /uppgifter|tasks/i });
    await expect(tasksTabPanel).toBeVisible({ timeout: 5000 });

    // --- At least one Kanban column (Att göra / Pågående / Klart) ---
    const columnHeading = tasksTabPanel.getByRole("heading", {
      name: /att göra|pågående|klart|to do|in progress|done/i,
    });
    await expect(columnHeading.first()).toBeVisible({ timeout: 5000 });

    // --- At least one task card (seed has e.g. "Dra kabel", "Montera tavlor", "QA slutkontroll") ---
    const taskCard = tasksTabPanel.getByText(
      /dra kabel|montera tavlor|offert skickad|qa slutkontroll/i
    ).first();
    await expect(taskCard).toBeVisible({ timeout: 5000 });

    // --- No horizontal overflow before opening dialog ---
    let hasHorizontalScroll = await page.evaluate(() => {
      const html = document.documentElement;
      return html.scrollWidth > html.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);

    // --- Open "Skapa uppgift" via the "Ny uppgift" button ---
    const createTaskButton = tasksTabPanel.getByRole("button", {
      name: /ny uppgift|create task/i,
    });
    await createTaskButton.scrollIntoViewIfNeeded();
    await createTaskButton.click();

    const createDialog = page.getByRole("dialog", {
      name: /skapa uppgift|create task/i,
    });
    await expect(createDialog).toBeVisible({ timeout: 5000 });

    // --- No horizontal overflow with dialog open ---
    hasHorizontalScroll = await page.evaluate(() => {
      const html = document.documentElement;
      return html.scrollWidth > html.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);

    // --- Close create dialog ---
    const closeButton = page.getByRole("button", { name: /stäng|close|cancel/i }).first();
    await expect(closeButton).toBeVisible({ timeout: 3000 });
    await closeButton.click();
    await expect(createDialog).not.toBeVisible({ timeout: 3000 });
  });
});
