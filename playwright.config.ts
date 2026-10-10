import { defineConfig } from "@playwright/test";
export default defineConfig({
 testDir: "./tests", fullyParallel: true,
 use: { baseURL: "http://127.0.0.1:3000", browserName: "chromium" },
 projects: [{ name: "desktop", use: { viewport: { width: 1440, height: 1000 } } }, { name: "mobile", use: { viewport: { width: 390, height: 844 } } }],
 webServer: { command: "npm run dev -- --hostname 127.0.0.1", url: "http://127.0.0.1:3000", reuseExistingServer: !process.env.CI, timeout: 120000 },
});
