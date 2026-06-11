// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { installSelectionProbe } from "./selection-probe.js";

afterEach(() => {
  delete (window as any).__pinpointExtractSelection;
});

it("installs the extractor global and returns a disposer that removes it", () => {
  const dispose = installSelectionProbe();
  expect(typeof (window as any).__pinpointExtractSelection).toBe("function");
  dispose();
  expect((window as any).__pinpointExtractSelection).toBeUndefined();
});
