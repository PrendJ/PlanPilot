import { defineConfig, devices } from "@playwright/test";
const port = Number(process.env.BOARDCUE_E2E_PORT || 3127);
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: "./e2e",
  use: { baseURL, trace: "retain-on-failure" },
  webServer: { command: "node .next/standalone/server.js", url: baseURL, reuseExistingServer: false, timeout: 120000, env: { PORT: String(port), HOSTNAME: "127.0.0.1" }, ...(process.platform === "win32" ? {} : { gracefulShutdown: { signal: "SIGINT" as const, timeout: 1000 } }) },
  projects: [
    { name: "mobile-320", use: { viewport: { width: 320, height: 740 } } },
    { name: "mobile-375", use: { viewport: { width: 375, height: 812 } } },
    { name: "tablet-768", use: { viewport: { width: 768, height: 1024 } } },
    { name: "laptop-1024", use: { viewport: { width: 1024, height: 768 } } },
    { name: "desktop-1440", use: { viewport: { width: 1440, height: 900 } } },
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
