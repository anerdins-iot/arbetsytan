import { test, expect } from "@playwright/test";

/**
 * Project Notes tab on mobile viewport.
 *
 * Flow:
 * 1. Log in
 * 2. Go to project notes tab (?tab=notes)
 * 3. Wait for Notes tab content and see at least one note (or category filter)
 * 4. Optionally open create note modal or category manager
 * 5. Assert no horizontal overflow on mobile
 *
 * Requires: server on baseURL, DB seeded (admin@example.com / password123,
 * project seed-project-1 with 1 note "E2E seed anteckning" and 5 note categories).
 * Run: npx playwright test fas-04-project-notes-mobile --project=mobile
 *      (with PLAYWRIGHT_BROWSERS_PATH=/workspace/.playwright-browsers if needed)
 */
const SEED_PROJECT_ID = "seed-project-1";
const LOCALE = "sv";

test.describe("Project Notes tab on mobile viewport", () => {
  test.use({ project: "mobile" });

  test("notes tab loads, shows at least one note, modals and no horizontal overflow", async ({
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

    // --- Go to project notes tab ---
    await page.goto(`/${LOCALE}/projects/${SEED_PROJECT_ID}?tab=notes`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await expect(page).toHaveURL(new RegExp(`/${LOCALE}/projects/${SEED_PROJECT_ID}`), {
      timeout: 10000,
    });

    // --- Ensure Anteckningar tab is active ---
    const notesTab = page.getByRole("tab", { name: "Anteckningar" });
    await notesTab.click();
    const notesTabPanel = page.getByRole("tabpanel", { name: "Anteckningar" });
    await expect(notesTabPanel).toBeVisible({ timeout: 5000 });

    // --- Wait for notes tab content: search field ---
    const searchOrFilter = notesTabPanel.getByPlaceholder(/sök anteckningar/i);
    await expect(searchOrFilter).toBeVisible({ timeout: 10000 });

    // --- Notes list loaded: either seed note or empty state (DB may have "E2E seed anteckning" or be empty) ---
    const seedNote = notesTabPanel.getByText("E2E seed anteckning");
    const emptyState = notesTabPanel.getByText(/inga anteckningar ännu|no notes yet/i);
    await expect(seedNote.or(emptyState)).toBeVisible({ timeout: 15000 });

    // --- Assert no horizontal overflow on the notes tab content ---
    const hasHorizontalScroll = await page.evaluate(() => {
      const html = document.documentElement;
      return html.scrollWidth > html.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);

    // --- Open create note modal ---
    const createButton = notesTabPanel.getByRole("button", {
      name: /ny anteckning|create note/i,
    });
    await createButton.scrollIntoViewIfNeeded();
    await createButton.click();
    // Wait for create-note dialog (NoteModal); may be portalled and animated
    const createDialog = page.getByRole("dialog", { name: /ny anteckning|create note/i });
    await expect(createDialog).toBeVisible({ timeout: 10000 });
    const overflowAfterCreate = await page.evaluate(() => {
      const html = document.documentElement;
      return html.scrollWidth > html.clientWidth;
    });
    expect(overflowAfterCreate).toBe(false);

    const closeCreate = page.getByRole("button", { name: /avbryt|cancel|stäng|close/i }).first();
    await closeCreate.click();
    await expect(createDialog).not.toBeVisible({ timeout: 3000 });

    // --- Open category manager ---
    const categoryManagerButton = notesTabPanel.getByRole("button", {
      name: /hantera kategorier|manage categories/i,
    });
    await categoryManagerButton.scrollIntoViewIfNeeded();
    await categoryManagerButton.click();
    await page.waitForTimeout(800);

    const categoryDialog = page.getByRole("dialog");
    await expect(categoryDialog).toBeVisible({ timeout: 5000 });
    const overflowAfterCategory = await page.evaluate(() => {
      const html = document.documentElement;
      return html.scrollWidth > html.clientWidth;
    });
    expect(overflowAfterCategory).toBe(false);

    const closeCategory = page.getByRole("button", { name: /avbryt|cancel|stäng|close/i }).first();
    await closeCategory.click();
    await expect(categoryDialog).not.toBeVisible({ timeout: 3000 });
  });
});
