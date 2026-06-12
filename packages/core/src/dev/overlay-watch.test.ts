import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FakePage } from "../driver/fake-page.js";
import { reinjectFromFile, startOverlayWatch } from "./overlay-watch.js";

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pp-watch-"));
  file = join(dir, "overlay.iife.js");
});
afterEach(() => {
  vi.useRealTimers();
});

it("reinjectFromFile reads the file and calls page.reinject with its contents", async () => {
  writeFileSync(file, "OVERLAY_BYTES");
  const page = new FakePage();
  await reinjectFromFile(page, file, "PREAMBLE");
  expect(page.reinjectCalls).toEqual([{ preamble: "PREAMBLE", source: "OVERLAY_BYTES" }]);
});

it("reinjectFromFile swallows a missing file (logs, does not throw)", async () => {
  const page = new FakePage();
  const log = vi.fn();
  await reinjectFromFile(page, join(dir, "nope.js"), "PRE", log);
  expect(page.reinjectCalls).toEqual([]);
  expect(log).toHaveBeenCalled();
});

it("startOverlayWatch debounces rapid changes into a single reinject", async () => {
  // Real timers here on purpose: the debounced callback runs reinjectFromFile, which awaits a
  // real fs readFile. vi.advanceTimersByTimeAsync does not flush real filesystem I/O completion,
  // so we use a short real debounce and wait past it for the async re-inject to settle.
  writeFileSync(file, "V1");
  const page = new FakePage();
  let fire: () => void = () => {};
  const handle = startOverlayWatch({
    page,
    filePath: file,
    preamble: "PRE",
    debounceMs: 20,
    subscribe: (cb) => {
      fire = cb;
      return () => {};
    },
  });
  fire();
  fire();
  fire();
  await new Promise((r) => setTimeout(r, 80)); // > debounceMs; lets the async re-inject complete
  expect(page.reinjectCalls.length).toBe(1);
  handle.stop();
});
