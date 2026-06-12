// @vitest-environment happy-dom
import { render } from "preact";
import { afterEach, expect, it, vi } from "vitest";
import type { Kind } from "../state/types.js";
import { Badge } from "./Badge.js";

let container: HTMLDivElement;

afterEach(() => {
  if (container) {
    render(null, container);
    container.remove();
  }
});

function setup(n: number, kind: Kind, onToggle: () => void, onPressStart: () => void) {
  container = document.createElement("div");
  document.body.appendChild(container);
  render(
    <Badge n={n} kind={kind} onToggle={onToggle} onPressStart={onPressStart} nodeRef={() => {}} />,
    container,
  );
  return container.querySelector(".pp-badge") as HTMLDivElement;
}

it("renders the number", () => {
  const el = setup(3, "element", vi.fn(), vi.fn());
  expect(el.textContent).toBe("3");
});

it("element kind → bg #22c55e", () => {
  const el = setup(1, "element", vi.fn(), vi.fn());
  expect(el.style.cssText).toContain("#22c55e");
});

it("screenshot kind → bg #a855f7", () => {
  const el = setup(2, "screenshot", vi.fn(), vi.fn());
  expect(el.style.cssText).toContain("#a855f7");
});

it("click → onToggle called once", () => {
  const onToggle = vi.fn();
  const el = setup(1, "element", onToggle, vi.fn());
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(onToggle).toHaveBeenCalledOnce();
});

it("pointerdown → onPressStart called", () => {
  const onPressStart = vi.fn();
  const el = setup(1, "element", vi.fn(), onPressStart);
  el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  expect(onPressStart).toHaveBeenCalledOnce();
});
