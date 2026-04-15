import path from "node:path"
import react from "@vitejs/plugin-react"
import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vitest/config"

const alias = { "@": path.resolve(__dirname, "./src") }

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/test/**",
        "src/components/ui/**",
        "src/components/workbench/readonly-assistant-thread.tsx",
        "src/main.tsx",
      ],
    },
    projects: [
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "unit",
          globals: true,
          environment: "jsdom",
          setupFiles: ["./src/test/setup.ts"],
          css: true,
          // Browser tests live under tests/**; keep them out of the jsdom run.
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["**/*.browser.test.{ts,tsx}", "**/node_modules/**"],
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "browser",
          include: ["tests/**/*.browser.test.{ts,tsx}"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            screenshotFailures: true,
            viewport: { width: 1280, height: 800 },
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
})
