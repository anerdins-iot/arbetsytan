import { test, expect } from "@playwright/test";

/**
 * Personal AI chat and datarikt panels (tool result Sheets).
 *
 * Flow:
 * 1. Log in as admin@example.com
 * 2. Go to project page (so AI has project context) or dashboard
 * 3. Open personal AI chat (topbar button)
 * 4. Send a message that triggers a tool returning __ data (e.g. list tasks, shopping lists)
 * 5. Assert "Hittade X — Öppna" button appears and clicking it opens the Sheet with expected content
 *
 * Requires: server on baseURL, DB seeded (admin@example.com / password123,
 * seed-project-1 with tasks and optional note/shopping lists).
 * Run: npx playwright test e2e/fas-04-personal-ai.spec.ts --project=chromium
 */
const LOCALE = "sv";

async function loginAsAdmin(page: import("@playwright/test").Page) {
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
}

test.describe("Personal AI chat and datarikt panels", () => {
  test("open AI chat, ask for shopping lists, see Hittade X — Öppna and open Sheet", async ({
    page,
  }) => {
    test.setTimeout(120000);

    await loginAsAdmin(page);

    await page.goto(`/${LOCALE}/dashboard`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible({ timeout: 10000 });

    const aiChatButton = page.getByRole("button", {
      name: /personlig ai|ai-assistent|ai chatt/i,
    });
    await aiChatButton.click();

    // Chat panel (docked or sheet) may take a moment to render; retry click once if not visible
    let chatInput = page.getByPlaceholder(/fråga om uppgifter|projekt eller meddelanden/i);
    if (!(await chatInput.isVisible().catch(() => false))) {
      await page.waitForTimeout(500);
      await aiChatButton.click();
    }
    await expect(chatInput).toBeVisible({ timeout: 20000 });

    await chatInput.fill("Visa mina inköpslistor");
    await page.getByRole("button", { name: /skicka/i }).click();

    const foundListsText = page.getByText(/hittade\s+\d+\s+inköpslist/i);
    await expect(foundListsText).toBeVisible({ timeout: 35000 });

    const openButton = page.locator('div:has(p:has-text("Hittade"))').getByRole("button", {
      name: "Öppna",
    }).first();
    await expect(openButton).toBeVisible({ timeout: 5000 });
    await openButton.click();

    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible({ timeout: 5000 });
    await expect(sheet.getByRole("heading", { name: "Inköpslistor" })).toBeVisible({
      timeout: 5000,
    });
  });
});
