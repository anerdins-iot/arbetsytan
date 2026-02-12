import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const SCREENSHOT_DIR = path.join(__dirname, "..", "..", "screenshots", "fas-11");

const FAKE_USER = {
  id: "test-user-1",
  email: "test@arbetsytan.se",
  name: "Test Användare",
  tenantId: "test-tenant-1",
  role: "Admin",
};

// Create a fake JWT with test user data
function createFakeJwt(): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      ...FAKE_USER,
      userId: FAKE_USER.id,
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  ).toString("base64url");
  const signature = Buffer.from("fake-signature").toString("base64url");
  return `${header}.${payload}.${signature}`;
}

const FAKE_JWT = createFakeJwt();

// Set up API mocks for all mobile endpoints
async function setupMocks(page: Page) {
  // Mock login API — returns tokens and user
  await page.route("**/api/auth/mobile", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        accessToken: FAKE_JWT,
        refreshToken: FAKE_JWT,
        user: FAKE_USER,
      }),
    });
  });

  // Mock tasks
  await page.route("**/api/mobile/tasks", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        tasks: [
          {
            id: "task-1",
            title: "Installera eluttag i kök",
            status: "IN_PROGRESS",
            priority: "HIGH",
            deadline: "2026-02-20T00:00:00Z",
            projectId: "project-1",
            projectName: "Kungsholmen Renovering",
          },
          {
            id: "task-2",
            title: "Dra kablar i badrum",
            status: "TODO",
            priority: "MEDIUM",
            deadline: "2026-02-25T00:00:00Z",
            projectId: "project-1",
            projectName: "Kungsholmen Renovering",
          },
          {
            id: "task-3",
            title: "Slutbesiktning elcentral",
            status: "DONE",
            priority: "URGENT",
            deadline: null,
            projectId: "project-2",
            projectName: "Södermalm Nybygge",
          },
        ],
      }),
    });
  });

  // Mock projects
  await page.route("**/api/mobile/projects", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        projects: [
          {
            id: "project-1",
            name: "Kungsholmen Renovering",
            status: "ACTIVE",
            description: "Total renovering av lägenhet, 3 rum och kök",
            taskCount: 12,
            updatedAt: "2026-02-10T14:30:00Z",
          },
          {
            id: "project-2",
            name: "Södermalm Nybygge",
            status: "ACTIVE",
            description: "Elinstallation i nyproduktion, 24 lägenheter",
            taskCount: 48,
            updatedAt: "2026-02-09T09:15:00Z",
          },
          {
            id: "project-3",
            name: "Vasastan Kontor",
            status: "COMPLETED",
            description: "Kontorsrenovering med ny belysning",
            taskCount: 8,
            updatedAt: "2026-01-28T16:00:00Z",
          },
        ],
      }),
    });
  });

  // Mock push registration
  await page.route("**/api/mobile/push/register", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });

  // Block socket.io to prevent connection errors
  await page.route("**/socket.io/**", (route) => {
    route.abort();
  });
}

// Log in through the app's own login form
async function performLogin(page: Page) {
  await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);

  // Fill in login form
  const emailInput = page.locator('input[placeholder="namn@foretag.se"]');
  const passwordInput = page.locator('input[placeholder="Ditt lösenord"]');

  await emailInput.fill("test@arbetsytan.se");
  await passwordInput.fill("test123");

  // Click login button
  const loginButton = page.getByText("Logga in").last();
  await loginButton.click();

  // Wait for navigation after login
  await page.waitForTimeout(3000);
}

test.beforeAll(() => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

test.describe.serial("Block 11.5: Expo Web Screenshots", () => {
  test("Login screen", async ({ page }) => {
    test.setTimeout(60000);

    const pageErrors: string[] = [];
    page.on("pageerror", (error) => {
      if (/hydration|ResizeObserver|crypto|getRandomValues|socket|push|notifications/i.test(error.message)) return;
      pageErrors.push(error.message);
    });

    // Navigate to root — unauthenticated users see login
    await page.goto("http://localhost:8081", { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);

    // Verify login screen rendered
    const loginVisible = await page.getByText("ArbetsYtan").first().isVisible().catch(() => false);
    expect(loginVisible).toBe(true);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "login-screen.png"),
      fullPage: true,
    });
  });

  test("Dashboard (after login)", async ({ page }) => {
    test.setTimeout(90000);
    page.on("pageerror", () => {});

    await setupMocks(page);
    await performLogin(page);

    // Wait for dashboard data to load
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "dashboard.png"),
      fullPage: true,
    });
  });

  test("Projects list", async ({ page }) => {
    test.setTimeout(90000);
    page.on("pageerror", () => {});

    await setupMocks(page);
    await performLogin(page);

    // Navigate to Projects tab
    const projectsTab = page.getByText("Projekt").first();
    if (await projectsTab.isVisible().catch(() => false)) {
      await projectsTab.click();
      await page.waitForTimeout(3000);
    }

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "projects.png"),
      fullPage: true,
    });
  });

  test("AI chat", async ({ page }) => {
    test.setTimeout(90000);
    page.on("pageerror", () => {});

    await setupMocks(page);
    await performLogin(page);

    // Navigate to AI tab
    const aiTab = page.getByText("AI").first();
    if (await aiTab.isVisible().catch(() => false)) {
      await aiTab.click();
      await page.waitForTimeout(3000);
    }

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "ai-chat.png"),
      fullPage: true,
    });
  });

  test("Settings", async ({ page }) => {
    test.setTimeout(90000);
    page.on("pageerror", () => {});

    await setupMocks(page);
    await performLogin(page);

    // Navigate to Settings tab (Inställningar)
    const settingsTab = page.getByText(/inställningar/i).first();
    if (await settingsTab.isVisible().catch(() => false)) {
      await settingsTab.click();
      await page.waitForTimeout(3000);
    }

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "settings.png"),
      fullPage: true,
    });
  });

  test("Verify all screenshots exist", async () => {
    const expectedScreenshots = [
      "login-screen.png",
      "dashboard.png",
      "projects.png",
      "ai-chat.png",
      "settings.png",
    ];

    for (const screenshot of expectedScreenshots) {
      const screenshotPath = path.join(SCREENSHOT_DIR, screenshot);
      expect(
        fs.existsSync(screenshotPath),
        `Screenshot ${screenshot} should exist at ${screenshotPath}`
      ).toBe(true);
    }
  });
});
