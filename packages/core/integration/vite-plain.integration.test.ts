import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCdpDriver } from "../src/driver/cdp-driver.js";
import type { DriverSession } from "../src/driver/driver.js";
import type { Rect, Selection } from "../src/types.js";

/**
 * Proves the identity extractor degrades gracefully on a NON-React page: no fiber → empty React
 * identity, but DOM fields still populate. The extractor runs in-page
 * (window.__pinpointExtractSelection), injected by the CDP driver's connect().
 * Requires examples/vite-plain running + Chrome on 9222.
 *
 *   pnpm --dir examples/vite-plain exec vite --port 5174 --strictPort &
 *   <chrome> --headless=new --remote-debugging-port=9222 about:blank &
 *   pnpm --filter @pinpoint/core exec vitest run --config vitest.integration.config.ts vite-plain
 */
const APP_URL = process.env.PIN_VITE_PLAIN_URL ?? "http://localhost:5174";
const CDP_URL = process.env.PIN_CDP_URL ?? "http://localhost:9222";

let connection: DriverSession;

beforeAll(async () => {
  const driver = createCdpDriver({ cdpUrl: CDP_URL, profileDir: "/tmp/pp-chrome" });
  connection = await driver.connect({ appUrl: APP_URL, bridgeUrl: "http://localhost:7331" });
});

afterAll(async () => {
  await connection?.close();
});

describe("pinpoint identity extraction on plain HTML/CSS (no framework, integration)", () => {
  it("returns DOM identity with null React field for a non-React element", async () => {
    const sel = await connection.page.evaluate<Selection & { rect: Rect }>(
      `window.__pinpointExtractSelection(document.querySelector('[data-testid="primary-action"]'))`,
    );
    expect(sel.react).toBeNull();
    expect(sel.tagName).toBe("BUTTON");
    expect(sel.selector.length).toBeGreaterThan(0);
    expect(typeof sel.text).toBe("string");
    expect(sel.rect.width).toBeGreaterThan(0);
  });

  it("still resolves a stable selector for a deeply-nested element", async () => {
    const sel = await connection.page.evaluate<Selection & { rect: Rect }>(
      `window.__pinpointExtractSelection(document.querySelector('[data-testid="buy"]'))`,
    );
    expect(sel.react).toBeNull();
    expect(sel.tagName).toBe("BUTTON");
    expect(sel.selector).toContain(">"); // nested path, not a bare tag
  });
});
