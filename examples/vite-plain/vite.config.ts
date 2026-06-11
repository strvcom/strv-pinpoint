import { defineConfig } from "vite";

// Pure HTML/CSS example (no framework). Distinct port so it never collides with
// examples/vite-react (5173); strictPort makes /pinpoint:start URL detection deterministic.
export default defineConfig({
  server: { port: 5174, strictPort: true },
});
