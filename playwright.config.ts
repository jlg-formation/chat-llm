import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: "http://localhost:5173/chat-llm/",
    headless: true,
  },
  webServer: {
    command: "bun run dev",
    url: "http://localhost:5173/chat-llm/",
    reuseExistingServer: true,
  },
});
