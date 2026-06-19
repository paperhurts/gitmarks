import { defineConfig } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Load e2e credentials from the gitignored e2e/.env.e2e (no dotenv dep).
// Used by the real GitHub round-trip test; absent in CI, where that test skips.
const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, "e2e", ".env.e2e");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2];
  }
}

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
  timeout: 60_000,
});
