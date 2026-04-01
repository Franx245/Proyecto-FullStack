// @ts-check
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 1,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:5173",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "default",
      use: { browserName: "chromium" },
    },
    {
      name: "production",
      use: {
        browserName: "chromium",
        baseURL: process.env.PRODUCTION_URL || "https://duelvault.com",
      },
    },
  ],
});
