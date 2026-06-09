// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { renderSendButton } from "./send-button.js";

it("shows Copy when not ready", () => {
  const b = document.createElement("button");
  renderSendButton(b, { ready: false });
  expect(b.textContent).toBe("Copy");
});

it("shows Copied ✓ when ready", () => {
  const b = document.createElement("button");
  renderSendButton(b, { ready: true });
  expect(b.textContent).toBe("Copied ✓");
});
