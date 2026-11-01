import { expect, test, type Page } from "@playwright/test";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.skip(!email || !password, "Set E2E_EMAIL and E2E_PASSWORD for a test-project Super Administrator.");

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("unauthenticated visitors are sent to sign in", async ({ page }) => {
  await page.goto("/members");
  await expect(page).toHaveURL(/\/login/);
});

test("public verification rejects unknown codes without signing in", async ({ page }) => {
  await page.goto(`/verify/${"0".repeat(32)}`);
  await expect(page.getByRole("heading", { name: "Certificate not found" })).toBeVisible();
});

test("register a member, record attendance, and record income", async ({ page }) => {
  await signIn(page);
  const unique = `E2E${Date.now()}`;

  // Register member
  await page.goto("/members/new");
  await page.getByLabel("First name").fill("Test");
  await page.getByLabel("Last name").fill(unique);
  await page.getByRole("button", { name: "Register member" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(unique) })).toBeVisible();

  // Create a session and record attendance by typing the name
  await page.goto("/attendance");
  await page.getByRole("button", { name: "New session" }).first().click();
  await page.getByLabel("Start time").fill(`0${Math.floor(Math.random() * 9)}:${String(Math.floor(Math.random() * 59)).padStart(2, "0")}`);
  await page.getByRole("button", { name: "Create and start recording" }).click();
  await expect(page).toHaveURL(/\/attendance\/[0-9a-f-]{36}/);
  await page.getByPlaceholder("Type a name or member ID, then press Enter").fill(unique);
  await page.getByRole("option", { name: new RegExp(unique) }).click();
  await expect(page.getByRole("cell", { name: new RegExp(unique) })).toBeVisible();

  // Duplicate entry is prevented
  await page.getByPlaceholder("Type a name or member ID, then press Enter").fill(unique);
  await page.getByRole("option", { name: new RegExp(unique) }).click();
  await expect(page.getByText(/already recorded/)).toBeVisible();

  // Record and post income
  await page.goto("/finance/transactions/new?kind=income");
  await page.getByLabel("Amount (PHP)").fill("1234.56");
  await page.getByLabel("Category").click();
  await page.getByRole("option", { name: "Sunday Offerings" }).click();
  await page.getByLabel("Description").fill(`E2E offering ${unique}`);
  await page.getByRole("button", { name: "Post income" }).click();
  await expect(page.getByText("+₱1,234.56")).toBeVisible();
});
