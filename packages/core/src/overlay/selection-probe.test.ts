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

it("identifiers: maps id, data-testid, aria-label, role, name when present", () => {
  installSelectionProbe();
  const el = document.createElement("button");
  el.id = "save-btn";
  el.setAttribute("data-testid", "save");
  el.setAttribute("aria-label", "Save");
  el.setAttribute("role", "button");
  el.setAttribute("name", "saveField");
  document.body.appendChild(el);
  const r = (window as any).__pinpointExtractSelection(el);
  expect(r.identifiers).toEqual({ id: "save-btn", testId: "save", ariaLabel: "Save", role: "button", name: "saveField" });
});

it("identifiers: data-test is used when data-testid absent; empty object when none", () => {
  installSelectionProbe();
  const a = document.createElement("div");
  a.setAttribute("data-test", "legacy");
  document.body.appendChild(a);
  expect((window as any).__pinpointExtractSelection(a).identifiers).toEqual({ testId: "legacy" });
  const b = document.createElement("span");
  document.body.appendChild(b);
  expect((window as any).__pinpointExtractSelection(b).identifiers).toEqual({});
});

it("react.source: parses first app-source frame from the fiber _debugStack (skips node_modules/.vite)", () => {
  installSelectionProbe();
  const el = document.createElement("h1");
  const stack = [
    "Error: react-stack-top-frame",
    "    at exports.jsxDEV (http://localhost:5184/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=abc:192:83)",
    "    at Hero (http://localhost:5184/src/App.tsx:7:20)",
    "    at react_stack_bottom_frame (http://localhost:5184/node_modules/.vite/deps/react-dom_client.js?v=def:12867:12)",
  ].join("\n");
  (el as any).__reactFiber$test = { type: { name: "Hero" }, return: null, _debugStack: { stack } };
  document.body.appendChild(el);
  const r = (window as any).__pinpointExtractSelection(el);
  expect(r.react).not.toBeNull();
  expect(r.react.source).toEqual({ file: "/src/App.tsx", line: 7 });
});

it("react.source: omitted when no _debugStack; react null for fiber-less DOM (identifiers still present)", () => {
  installSelectionProbe();
  const noStack = document.createElement("div");
  (noStack as any).__reactFiber$test = { type: { name: "Comp" }, return: null };
  document.body.appendChild(noStack);
  const r1 = (window as any).__pinpointExtractSelection(noStack);
  expect(r1.react).not.toBeNull();
  expect(r1.react.source).toBeUndefined();
  const plain = document.createElement("div");
  plain.id = "plain";
  document.body.appendChild(plain);
  const r2 = (window as any).__pinpointExtractSelection(plain);
  expect(r2.react).toBeNull();
  expect(r2.identifiers).toEqual({ id: "plain" });
});
