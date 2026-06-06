import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { connect, type Connection } from "../src/cdp/connector.js";
import { getSelectionTool } from "../src/tools/get-selection.js";
import { screenshotTool } from "../src/tools/screenshot-tool.js";

/**
 * Requires: examples/nextjs dev server running, and a Chrome started with
 * --remote-debugging-port=9222. Defaults assume the app on :3100 (port 3000 is
 * taken by Docker on this machine). Override with FF_APP_URL / FF_CDP_URL.
 *
 * Excluded from the default `vitest run`; run with:
 *   pnpm --filter @frontman-flow/core exec vitest run --config vitest.integration.config.ts
 */
const APP_URL = process.env.FF_APP_URL ?? "http://localhost:3100/clienttest";
const CDP_URL = process.env.FF_CDP_URL ?? "http://localhost:9222";

let connection: Connection;

beforeAll(async () => {
  connection = await connect({ cdpUrl: CDP_URL, appUrl: APP_URL });
  // The overlay (with the extractor) was injected by connect(). Drive the
  // gestures programmatically (no real mouse): pick #ct-heading, set a region.
  await connection.page.evaluate<unknown>(
    "window.__frontmanFlowSelection = window.__frontmanFlowExtractSelection(document.querySelector('#ct-heading'))",
  );
  await connection.page.evaluate<unknown>(
    "window.__frontmanFlowRegion = { x: 8, y: 8, width: 120, height: 48 }",
  );
});

afterAll(async () => {
  await connection?.close();
});

describe("frontman-flow loop (integration)", () => {
  it("get_selection returns the user component identity for the picked element", async () => {
    const result = await getSelectionTool({ page: connection.page });
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload.status).toBe("selected");
    expect(payload.componentName).toBe("ClientTest");
    expect(payload.tagName).toBe("H1");
    expect(typeof payload.selector).toBe("string");
  });

  it("screenshot('region') returns PNG bytes for the drag-selected area", async () => {
    const result = await screenshotTool({ page: connection.page }, { target: "region" });
    const img = result.content[0] as { type: string; data: string };
    expect(img.type).toBe("image");
    expect(Buffer.from(img.data, "base64").length).toBeGreaterThan(100);
  });

  it("screenshot('selection') returns PNG bytes for the picked element", async () => {
    const result = await screenshotTool({ page: connection.page }, { target: "selection" });
    const img = result.content[0] as { type: string; data: string };
    expect(img.type).toBe("image");
    expect(Buffer.from(img.data, "base64").length).toBeGreaterThan(100);
  });
});
