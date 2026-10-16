import path from "node:path";
import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    include: ["lib/commercial/**/*.integration.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    env: {
      DATABASE_URL:
        "postgresql://postgres@127.0.0.1:55473/notecode_commercial_test",
      DIRECT_URL:
        "postgresql://postgres@127.0.0.1:55473/notecode_commercial_test",
      ENCRYPTION_KEY: "12345678901234567890123456789012",
      SESSION_SECRET: "commercial-local-test-secret-32chars",
    },
  },
});
