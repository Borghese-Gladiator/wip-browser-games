import { defineConfig } from "vitest/config";

// Unit tests only. The Playwright E2E suite under e2e/ is run separately via
// `npm run test:e2e` and must not be collected by vitest.
export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
  },
});
