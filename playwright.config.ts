import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright base config — used by AGT-06 as template.
 * AGT-06 generates a run-specific config at runtime.
 * This file is for local development / IDE support.
 */
export default defineConfig({
  testDir: "./playwright-tests/specs",
  outputDir: "./test-results/local",

  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    headless: true,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "on-first-retry",
  },

  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : 2,
  timeout: 60_000,

  reporter: [
    ["line"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
