import { expect, it } from "vitest";
import { badgeClickAction } from "./card-toggle.js";
import { createOverlayState } from "./state.js";

it("opens a closed card", () => {
  const s = createOverlayState();
  expect(badgeClickAction(s, "a1")).toBe("open");
});

it("closes an open card", () => {
  const s = createOverlayState();
  s.open.a1 = true;
  expect(badgeClickAction(s, "a1")).toBe("close");
});
