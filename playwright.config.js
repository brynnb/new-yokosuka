import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_APP_URL
  || process.env.PLAYWRIGHT_BASE_URL
  || "http://127.0.0.1:5175";
const webServerHost = process.env.PLAYWRIGHT_WEB_SERVER_HOST || "127.0.0.1";
const webServerPort = process.env.PLAYWRIGHT_WEB_SERVER_PORT || "5175";
const webServerUrl = process.env.PLAYWRIGHT_WEB_SERVER_URL || baseURL;
const webServerCommand = process.env.PLAYWRIGHT_WEB_SERVER_COMMAND
  || `npm run dev -- --host ${webServerHost} --port ${webServerPort}`;
const webServer = process.env.PLAYWRIGHT_SKIP_WEB_SERVER === "true"
  ? undefined
  : {
      command: webServerCommand,
      url: webServerUrl,
      reuseExistingServer: true,
      timeout: 120_000,
    };

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./tests/reports/playwright-results",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: "./tests/reports/playwright-html" }],
  ],
  use: {
    baseURL,
    actionTimeout: 30_000,
    navigationTimeout: 120_000,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  ...(webServer ? { webServer } : {}),
});
