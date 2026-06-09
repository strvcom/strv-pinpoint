// @vitest-environment happy-dom
import { beforeEach, expect, it } from "vitest";
import { installOverlay } from "./install.js";

beforeEach(() => {
  document.body.innerHTML = "";
  (window as any).__pinpointOverlayInstalled = false;
});

it("installs the overlay FAB into the document", () => {
  installOverlay();
  const orb = [...document.querySelectorAll("button")].find((b) => b.textContent === "✦");
  expect(orb).toBeTruthy();
  expect(document.querySelector("[data-pinpoint]")).toBeTruthy();
});
