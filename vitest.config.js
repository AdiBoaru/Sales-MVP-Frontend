import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Test runner config, kept separate from vite.config.js so the dev/build pipeline
// stays untouched. Component tests render in jsdom; the `@` alias mirrors the app's.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.js"],
    include: ["test/**/*.{test,spec}.{js,jsx}"],
    css: false,
  },
});
