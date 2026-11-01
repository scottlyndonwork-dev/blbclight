import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end smoke tests against a running LIGHT instance connected to a
 * TEST Supabase project (never production). Configure:
 *   E2E_BASE_URL (default http://localhost:3000), E2E_EMAIL, E2E_PASSWORD
 * The account should be a Super Administrator in the test project.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    locale: "en-PH",
    timezoneId: "Asia/Manila",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
