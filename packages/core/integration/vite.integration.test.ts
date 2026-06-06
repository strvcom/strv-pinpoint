import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Connection, connect } from "../src/cdp/connector.js";
import { getSelectionTool } from "../src/tools/get-selection.js";
import { screenshotTool } from "../src/tools/screenshot-tool.js";

/**
 * Proves the SAME CDP + fiber-identity bridge works on Vite + React with no core
 * changes (TASK-3). Requires examples/vite-react running and a Chrome started
 * with --remote-debugging-port=9222.
 *
 *   pnpm --dir examples/vite-react exec vite --port 5180 --strictPort &
 *   <chrome> --headless=new --remote-debugging-port=9222 about:blank &
 *   pnpm --filter @frontman-flow/core exec vitest run --config vitest.integration.config.ts vite
 */
const APP_URL = process.env.FF_VITE_URL ?? "http://localhost:5180";
const CDP_URL = process.env.FF_CDP_URL ?? "http://localhost:9222";

let connection: Connection;

beforeAll(async () => {
  connection = await connect({ cdpUrl: CDP_URL, appUrl: APP_URL });
  await connection.page.evaluate<unknown>(
    "window.__frontmanFlowSelection = window.__frontmanFlowExtractSelection(document.querySelector('#hero-heading'))",
  );
  await connection.page.evaluate<unknown>(
    "window.__frontmanFlowRegion = { x: 12, y: 12, width: 140, height: 50 }",
  );
});

afterAll(async () => {
  await connection?.close();
});

describe("frontman-flow loop on Vite + React (integration)", () => {
  it("get_selection returns the user component identity (cleaner than Next — no framework wrappers)", async () => {
    const result = await getSelectionTool({ page: connection.page });
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.status).toBe("selected");
    expect(payload.componentName).toBe("Hero");
    expect(payload.ancestry).toEqual(["Hero", "App"]);
    expect(payload.tagName).toBe("H1");
  });

  it("screenshot('region') returns PNG bytes", async () => {
    const result = await screenshotTool({ page: connection.page }, { target: "region" });
    const img = result.content[0] as { type: string; data: string };
    expect(img.type).toBe("image");
    expect(Buffer.from(img.data, "base64").length).toBeGreaterThan(100);
  });
});
