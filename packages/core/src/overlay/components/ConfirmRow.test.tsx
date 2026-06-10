// @vitest-environment happy-dom
import { render } from "preact";
import { afterEach, expect, it, vi } from "vitest";
import { ConfirmRow } from "./ConfirmRow.js";

let container: HTMLDivElement;

afterEach(() => {
  if (container) {
    render(null, container);
    container.remove();
  }
});

function setup(yesLabel: string, onYes: () => void, onNo: () => void) {
  container = document.createElement("div");
  document.body.appendChild(container);
  render(<ConfirmRow yesLabel={yesLabel} onYes={onYes} onNo={onNo} />, container);
  return container;
}

it("clicking Cancel calls onNo and not onYes", () => {
  const onYes = vi.fn();
  const onNo = vi.fn();
  const c = setup("Delete", onYes, onNo);

  const cancelBtn = Array.from(c.querySelectorAll("button")).find(
    (b) => b.textContent === "Cancel",
  )!;
  cancelBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

  expect(onNo).toHaveBeenCalledOnce();
  expect(onYes).not.toHaveBeenCalled();
});

it("clicking the yes button calls onYes and not onNo", () => {
  const onYes = vi.fn();
  const onNo = vi.fn();
  const c = setup("Delete", onYes, onNo);

  const yesBtn = Array.from(c.querySelectorAll("button")).find((b) => b.textContent === "Delete")!;
  yesBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

  expect(onYes).toHaveBeenCalledOnce();
  expect(onNo).not.toHaveBeenCalled();
});
