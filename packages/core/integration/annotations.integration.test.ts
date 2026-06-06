import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Connection, connect } from "../src/cdp/connector.js";
import { getAnnotationsTool } from "../src/tools/get-annotations.js";

/**
 * Proves get_annotations against a real batch on a live page (TASK-5). Requires
 * examples/vite-react on 5180 + Chrome on 9222.
 *
 *   pnpm --dir examples/vite-react exec vite --port 5180 --strictPort &
 *   <chrome> --headless=new --remote-debugging-port=9222 about:blank &
 *   pnpm --filter @frontman-flow/core exec vitest run --config vitest.integration.config.ts annotations
 */
const APP_URL = process.env.FF_VITE_URL ?? "http://localhost:5180";
const CDP_URL = process.env.FF_CDP_URL ?? "http://localhost:9222";
let connection: Connection;

beforeAll(async () => {
  connection = await connect({ cdpUrl: CDP_URL, appUrl: APP_URL });
  await connection.page.evaluate<unknown>(`(() => {
    var mk = function (sel, comment, shot) {
      var d = window.__frontmanFlowExtractSelection(document.querySelector(sel));
      d.comment = comment; d.wantScreenshot = shot; return d;
    };
    window.__frontmanFlowAnnotations = {
      batchId: 1, ready: true,
      items: [ mk('#hero-heading', 'make it bigger', true), mk('#hero-btn', 'rename to Save', false) ],
    };
  })()`);
});

afterAll(async () => {
  await connection?.close();
});

describe("get_annotations on a live page (integration)", () => {
  it("returns a text block per item with component identity + one screenshot", async () => {
    const r = await getAnnotationsTool({ page: connection.page });
    const text = r.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { text: string }).text)
      .join("\n");
    expect(text).toMatch(/2 annotation/);
    expect(text).toMatch(/Hero/);
    expect(text).toMatch(/make it bigger/);
    expect(text).toMatch(/rename to Save/);
    const imgs = r.content.filter((c) => c.type === "image");
    expect(imgs).toHaveLength(1);
    expect(Buffer.from((imgs[0] as { data: string }).data, "base64").length).toBeGreaterThan(100);
  });
});
