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

it("returns react:null for plain DOM element with no React fiber", () => {
  installSelectionProbe();
  const el = document.createElement("div");
  document.body.appendChild(el);
  const r = (window as any).__pinpointExtractSelection(el);
  expect(r.react).toBeNull();
  expect(typeof r.selector).toBe("string");
  expect(typeof r.tagName).toBe("string");
  expect(typeof r.text).toBe("string");
  document.body.removeChild(el);
});

it("returns react:{componentName, ancestry} when a React fiber chain is present", () => {
  installSelectionProbe();
  const el = document.createElement("div");
  document.body.appendChild(el);

  // Stub a fiber chain: MyButton → MyCard → App
  const fiberKey = "__reactFiber$test";
  (el as any)[fiberKey] = {
    type: { name: "MyButton" },
    elementType: null,
    return: {
      type: { name: "MyCard" },
      elementType: null,
      return: {
        type: { name: "App" },
        elementType: null,
        return: null,
      },
    },
  };

  const r = (window as any).__pinpointExtractSelection(el);
  expect(r.react).toEqual({
    componentName: "MyButton",
    ancestry: ["MyButton", "MyCard", "App"],
  });
  // flat fields should NOT exist
  expect(r.componentName).toBeUndefined();
  expect(r.ancestry).toBeUndefined();

  document.body.removeChild(el);
});
