import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      // Redirect "webextension-polyfill" to a test stub so the real polyfill
      // (which throws in Node/jsdom) is never loaded during unit tests.
      "webextension-polyfill": path.resolve(
        __dirname,
        "test/webextension-polyfill-stub.ts",
      ),
    },
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    globals: false,
  },
});
