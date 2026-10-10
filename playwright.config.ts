import { defineConfig } from "@playwright/test";
const port = process.env.PLAYWRIGHT_PORT ?? "3000";
export default defineConfig({
 testDir: "./tests", fullyParallel: true,
 use: { baseURL: `http://127.0.0.1:${port}`, browserName: "chromium" },
 projects: [{ name: "desktop", use: { viewport: { width: 1440, height: 1000 } } }, { name: "mobile", use: { viewport: { width: 390, height: 844 } } }],
 webServer: { command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`, url: `http://127.0.0.1:${port}`, reuseExistingServer: !process.env.CI, timeout: 120000 },
});
