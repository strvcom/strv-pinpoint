// @vitest-environment happy-dom
import { render } from "preact";
import { afterEach, expect, it, vi } from "vitest";
import { CopyButton } from "./CopyButton.js";

let container: HTMLDivElement;

afterEach(() => {
  if (container) {
    render(null, container);
    container.remove();
  }
});

function setup(itemCount: number, copied: boolean, onCopy: () => void) {
  container = document.createElement("div");
  document.body.appendChild(container);
  render(<CopyButton itemCount={itemCount} copied={copied} onCopy={onCopy} />, container);
  return container.querySelector("button")!;
}

it("itemCount 0 → button is disabled with text Copy", () => {
  const btn = setup(0, false, vi.fn());
  expect(btn.disabled).toBe(true);
  expect(btn.textContent).toBe("Copy");
});

it("itemCount 2, copied false → not disabled, text Copy, bg includes #0a7d34", () => {
  const btn = setup(2, false, vi.fn());
  expect(btn.disabled).toBe(false);
  expect(btn.textContent).toBe("Copy");
  expect(btn.style.cssText).toContain("#0a7d34");
});

it("itemCount 2, copied true → text 'Copied ✓', bg includes #0a4", () => {
  const btn = setup(2, true, vi.fn());
  expect(btn.disabled).toBe(false);
  expect(btn.textContent).toBe("Copied ✓");
  expect(btn.style.cssText).toContain("#0a4");
});

it("click enabled → onCopy called once", () => {
  const onCopy = vi.fn();
  const btn = setup(2, false, onCopy);
  btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(onCopy).toHaveBeenCalledOnce();
});

it("click when itemCount 0 → onCopy NOT called", () => {
  const onCopy = vi.fn();
  const btn = setup(0, false, onCopy);
  // disabled buttons don't fire click events, but guard is also in onClick
  btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(onCopy).not.toHaveBeenCalled();
});
