import path from "node:path";
import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
  test: {
    exclude: [...configDefaults.exclude, "**/*.integration.test.ts", "e2e/**"],
    env: {
      ENCRYPTION_KEY: "12345678901234567890123456789012",
      ENCRYPTION_KEY_PREVIOUS: "abcdefghijklmnopqrstuvwxyz123456",
      SESSION_SECRET: "test-session-secret-value-32b!!",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
    },
  },
});
