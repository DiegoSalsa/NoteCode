import { defineConfig, devices } from "@playwright/test";
const env = {
  DATABASE_URL:
    "postgresql://postgres@127.0.0.1:55473/notecode_commercial_test",
  DIRECT_URL: "postgresql://postgres@127.0.0.1:55473/notecode_commercial_test",
  SESSION_SECRET: "commercial-local-test-secret-32chars",
  ENCRYPTION_KEY: "12345678901234567890123456789012",
};
Object.assign(process.env, env);
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3217",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3217",
    url: "http://localhost:3217",
    env,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
