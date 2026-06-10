// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { installOverlayApp } from "./index.js";

afterEach(() => {
  (window as any).__pinpointTeardown?.();
  delete (window as any).__pinpointOverlayInstalled;
  delete (window as any).__pinpointTeardown;
  for (const h of [...document.querySelectorAll("[data-pinpoint]")]) h.remove();
  vi.restoreAllMocks();
});

it("mounts exactly one host and installs a teardown", () => {
  installOverlayApp();
  expect(document.querySelectorAll("[data-pinpoint]").length).toBe(1);
  expect(typeof (window as any).__pinpointTeardown).toBe("function");
  expect((window as any).__pinpointOverlayInstalled).toBe(true);
});

it("teardown removes the host, clears the guard, and balances document listeners", () => {
  const add = vi.spyOn(document, "addEventListener");
  const remove = vi.spyOn(document, "removeEventListener");

  installOverlayApp();
  (window as any).__pinpointTeardown();

  expect(document.querySelectorAll("[data-pinpoint]").length).toBe(0);
  expect((window as any).__pinpointOverlayInstalled).toBeUndefined();
  expect((window as any).__pinpointTeardown).toBeUndefined();
  expect(remove.mock.calls.length).toBeGreaterThanOrEqual(add.mock.calls.length);
});

it("re-injecting after teardown mounts exactly one overlay (no stacking)", () => {
  installOverlayApp();
  (window as any).__pinpointTeardown();
  installOverlayApp();
  expect(document.querySelectorAll("[data-pinpoint]").length).toBe(1);
});
