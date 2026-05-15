import { defineConfig, devices } from "@playwright/test";

// Default to the local artifact-router proxy on :80 so that /api requests
// (served by the api-server artifact on a different port) are proxied
// alongside the agentops web app. Set E2E_BASE_URL to override (e.g. to
// $REPLIT_DEV_DOMAIN in CI when port 80 isn't directly reachable).
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:80";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
