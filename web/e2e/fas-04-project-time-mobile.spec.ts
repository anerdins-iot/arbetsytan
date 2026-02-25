import { test, expect } from "@playwright/test";

/**
 * Project Time tab on mobile viewport.
 *
 * Flow:
 * 1. Log in
 * 2. Go to project time tab (?tab=time)
 * 3. Wait for Time tab content: form, at least one time entry or time summary
 * 4. Optionally open export panel
 * 5. Assert no horizontal overflow on mobile
 *
 * Requires: server on baseURL, DB seeded (admin@example.com / password123,
 * project seed-project-1 with at least one time entry and tasks for the form).
 * Run with PLAYWRIGHT_BROWSERS_PATH=/workspace/.playwright-browsers if needed.
 */
const SEED_PROJECT_ID = "seed-project-1";
const LOCALE = "sv";

test.describe("Project Time tab on mobile viewport", () => {
  test("Time tab shows form, time entry or summary, and has no horizontal overflow", async ({
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

    // --- Go to project time tab ---
    await page.goto(`/${LOCALE}/projects/${SEED_PROJECT_ID}?tab=time`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await expect(page).toHaveURL(
      new RegExp(`/${LOCALE}/projects/${SEED_PROJECT_ID}`),
      { timeout: 10000 }
    );

    // --- Ensure Tid tab is active ---
    const timeTab = page.getByRole("tab", { name: "Tid" });
    await timeTab.click();
    const timeTabPanel = page.getByRole("tabpanel", { name: "Tid" });
    await expect(timeTabPanel).toBeVisible({ timeout: 5000 });

    // --- Time entry form visible (Registrera tid) - CardTitle is a div, not heading ---
    await expect(
      timeTabPanel.getByText(/registrera tid/i).first()
    ).toBeVisible({ timeout: 5000 });

    // --- At least one of: time summary (Total tid) or time entry list with content ---
    const totalTimeText = timeTabPanel.getByText(/total tid/i);
    const dayTotalOrEntry = timeTabPanel.getByText(/summa:|tim|min/i);
    await expect(
      totalTimeText.or(dayTotalOrEntry).first()
    ).toBeVisible({ timeout: 10000 });

    // --- Export panel visible (Export och rapporter) ---
    await expect(
      timeTabPanel.getByText(/export och rapporter/i).first()
    ).toBeVisible({ timeout: 5000 });

    // --- No horizontal overflow ---
    const hasHorizontalScroll = await page.evaluate(() => {
      const html = document.documentElement;
      return html.scrollWidth > html.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });
});
