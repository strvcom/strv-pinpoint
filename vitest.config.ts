import { defineConfig } from "vitest/config";
export default defineConfig({
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "preact",
  },
  test: {
    include: ["packages/**/*.test.ts", "packages/**/*.test.tsx", "scripts/**/*.test.mjs"],
    exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
    environment: "node",
  },
});
