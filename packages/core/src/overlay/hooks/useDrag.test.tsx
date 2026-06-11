// @vitest-environment happy-dom
import { render } from "preact";
import { afterEach, expect, it, vi } from "vitest";
import { type DragHandlers, useDrag } from "./useDrag.js";

let container: HTMLDivElement;

afterEach(() => {
  if (container) {
    render(null, container);
    container.remove();
  }
});

function mountDrag(handlers: DragHandlers): HTMLElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  function Probe() {
    const onPointerDown = useDrag(handlers);
    return <div data-testid="t" onPointerDown={onPointerDown} />;
  }
  render(<Probe />, container);
  return container.querySelector<HTMLElement>('[data-testid="t"]')!;
}

const pd = (el: HTMLElement, x: number, y: number) =>
  el.dispatchEvent(new PointerEvent("pointerdown", { clientX: x, clientY: y, bubbles: true }));
const pm = (x: number, y: number) =>
  document.dispatchEvent(
    new PointerEvent("pointermove", { clientX: x, clientY: y, bubbles: true }),
  );
const pu = () => document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));

it("ignores sub-threshold jitter: onMove never fires and a clean click reports moved=false", () => {
  const onMove = vi.fn();
  const onEnd = vi.fn();
  const el = mountDrag({ onMove, onEnd });
  pd(el, 100, 100);
  pm(102, 101); // 3px travel — inside the deadzone
  pu();
  expect(onMove).not.toHaveBeenCalled();
  expect(onEnd).toHaveBeenCalledWith(false);
});

it("fires onMove once the pointer crosses the deadzone and reports moved=true", () => {
  const onMove = vi.fn();
  const onEnd = vi.fn();
  const el = mountDrag({ onMove, onEnd });
  pd(el, 100, 100);
  pm(102, 101); // sub-threshold — ignored
  pm(110, 100); // 10px — crosses the deadzone
  pu();
  expect(onMove).toHaveBeenCalledWith(10, 0);
  expect(onEnd).toHaveBeenCalledWith(true);
});
