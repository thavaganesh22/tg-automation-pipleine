import { defineConfig, devices } from "@playwright/test";

/**
 * Config for running tests directly from the playwright-tests/ directory.
 * For CI / AGT-06 runs a separate config is generated at project root.
 */
export default defineConfig({
  testDir: "./specs",
  outputDir: "../test-results/local",

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
    ["list"],
    ["html", { outputFolder: "../playwright-report", open: "never" }],
  ],

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
