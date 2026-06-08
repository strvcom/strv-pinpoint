import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Connection, connect } from "../src/cdp/connector.js";
import type { SelectionFound } from "../src/types.js";

/**
 * Proves the CDP + fiber-identity bridge works on Vite + React. The extractor
 * runs in-page (window.__frontmanFlowExtractSelection), injected by connect().
 * Requires examples/vite-react running + Chrome on 9222.
 *
 *   pnpm --dir examples/vite-react exec vite --port 5180 --strictPort &
 *   <chrome> --headless=new --remote-debugging-port=9222 about:blank &
 *   pnpm --filter @frontman-flow/core exec vitest run --config vitest.integration.config.ts vite
 */
const APP_URL = process.env.FF_VITE_URL ?? "http://localhost:5180";
const CDP_URL = process.env.FF_CDP_URL ?? "http://localhost:9222";

let connection: Connection;

beforeAll(async () => {
  connection = await connect({
    cdpUrl: CDP_URL,
    appUrl: APP_URL,
    bridgeUrl: "http://localhost:7331",
  });
});

afterAll(async () => {
  await connection?.close();
});

describe("frontman-flow identity extraction on Vite + React (integration)", () => {
  it("extracts the user component identity for the picked element", async () => {
    const sel = await connection.page.evaluate<SelectionFound>(
      "window.__frontmanFlowExtractSelection(document.querySelector('#hero-heading'))",
    );
    expect(sel.componentName).toBe("Hero");
    expect(sel.ancestry).toEqual(["Hero", "App"]);
    expect(sel.tagName).toBe("H1");
    expect(typeof sel.selector).toBe("string");
  });

  it("captures a viewport-relative clip as PNG bytes", async () => {
    const png = await connection.page.screenshotClip({ x: 12, y: 12, width: 140, height: 50 });
    expect(png.length).toBeGreaterThan(100);
  });
});
