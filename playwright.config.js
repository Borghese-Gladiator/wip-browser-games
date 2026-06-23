import { defineConfig } from "@playwright/test";

// Boots the authoritative WS server and the Vite dev server, then runs the
// E2E spec. Per-context video/trace recording is configured in the spec so all
// four player streams are captured independently.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  outputDir: "e2e/artifacts",
  webServer: [
    {
      command: "node packages/poker-server/src/server.js",
      port: 3001,
      timeout: 10_000,
      reuseExistingServer: false,
    },
    {
      command: "node packages/sheng-ji-server/src/server.js",
      port: 3002,
      timeout: 10_000,
      reuseExistingServer: false,
    },
    {
      command: "npx vite --port 5173",
      port: 5173,
      timeout: 30_000,
      reuseExistingServer: false,
    },
  ],
});
