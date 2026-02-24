import { test, expect } from "@playwright/test";

/**
 * Project Overview tab on mobile viewport.
 *
 * Flow:
 * 1. Log in
 * 2. Go to project Overview tab (?tab=overview)
 * 3. Wait for Overview tab content (project info, recent activity)
 * 4. Optionally open and close "Redigera projekt" dialog
 * 5. Assert recent activity list is visible with at least one item
 * 6. Assert no horizontal overflow on mobile
 *
 * Requires: server on baseURL, DB seeded (admin@example.com / password123,
 * project seed-project-1 with 2 activity log entries).
 */
const SEED_PROJECT_ID = "seed-project-1";
const LOCALE = "sv";

test.describe("Project Overview tab on mobile viewport", () => {
  test.use({ project: "mobile" });

  test("Overview tab loads, activity list visible, edit dialog works, no horizontal overflow", async ({
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

    // --- Go to project Overview tab ---
    await page.goto(`/${LOCALE}/projects/${SEED_PROJECT_ID}?tab=overview`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await expect(page).toHaveURL(
      new RegExp(`/${LOCALE}/projects/${SEED_PROJECT_ID}`),
      { timeout: 10000 }
    );

    // --- Ensure Overview tab is active ---
    const overviewTab = page.getByRole("tab", { name: /översikt|overview/i });
    await overviewTab.click();
    const overviewPanel = page.getByRole("tabpanel", {
      name: /översikt|overview/i,
    });
    await expect(overviewPanel).toBeVisible({ timeout: 5000 });

    // --- Wait for Overview content: recent activity section ---
    const recentActivityHeading = overviewPanel.getByText(
      /senaste aktivitet|recent activity/i
    );
    await expect(recentActivityHeading).toBeVisible({ timeout: 10000 });

    // --- Assert recent activity list has at least one item (seed has 2: created task, created note) ---
    await expect(
      overviewPanel.getByText(/skapade|created|uppgift|task|anteckning|note/i)
    ).toBeVisible();

    // --- Optional: open "Redigera projekt" dialog (button "Redigera" in project info card) ---
    const editButton = overviewPanel.getByRole("button", {
      name: /redigera|edit/i,
    }).first();
    await editButton.scrollIntoViewIfNeeded();
    await editButton.click();
    const editDialog = page.getByRole("dialog");
    await expect(editDialog).toBeVisible({ timeout: 5000 });
    await expect(editDialog.getByText(/redigera projekt|edit project/i)).toBeVisible();

    // --- Close dialog ---
    const closeButton = page
      .getByRole("button", { name: /stäng|close|avbryt|cancel/i })
      .first();
    await closeButton.click();
    await expect(editDialog).not.toBeVisible({ timeout: 3000 });

    // --- No horizontal overflow on mobile ---
    const hasHorizontalScroll = await page.evaluate(() => {
      const html = document.documentElement;
      return html.scrollWidth > html.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });
});
