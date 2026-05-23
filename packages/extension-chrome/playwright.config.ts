import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    headless: false,
    actionTimeout: 5000,
    navigationTimeout: 10000,
  },
  timeout: 30_000,
});
