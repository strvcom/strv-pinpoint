// @vitest-environment happy-dom
import { render } from "preact";
import { useState } from "preact/hooks";
import { act } from "preact/test-utils";
import { afterEach, expect, it, vi } from "vitest";
import type { Rect } from "../state/types.js";
import { useScreenshotRegion } from "./useScreenshotRegion.js";

let container: HTMLDivElement;

afterEach(() => {
  if (container) {
    render(null, container);
    container.remove();
  }
});

// Mirror OverlayRoot: the parent re-renders on every marquee update (setMarqueeRect), and passes
// an INLINE onCapture (new identity each render). This is the exact scenario that used to reset the
// drag's `sdrag` mid-drag and stop the region from growing.
function mountRegion(onCapture: (r: Rect) => void) {
  container = document.createElement("div");
  document.body.appendChild(container);
  function Probe() {
    const [, setMarquee] = useState<Rect | null>(null);
    useScreenshotRegion({
      mode: "screenshot",
      hostEl: null,
      onMarquee: setMarquee,
      onCapture,
    });
    return <div />;
  }
  act(() => {
    render(<Probe />, container);
  }); // flush the listener effect
}

const md = (x: number, y: number) =>
  document.dispatchEvent(new MouseEvent("mousedown", { clientX: x, clientY: y, bubbles: true }));
const mm = (x: number, y: number) =>
  document.dispatchEvent(new MouseEvent("mousemove", { clientX: x, clientY: y, bubbles: true }));
const mu = (x: number, y: number) =>
  document.dispatchEvent(new MouseEvent("mouseup", { clientX: x, clientY: y, bubbles: true }));

it("captures the dragged region even though the parent re-renders on each marquee update", () => {
  const onCapture = vi.fn();
  mountRegion(onCapture);
  act(() => {
    md(100, 100);
    mm(120, 120); // marquee update -> parent re-render
    mm(160, 150); // must still be tracked (sdrag survived the re-render)
    mu(160, 150);
  });
  expect(onCapture).toHaveBeenCalledTimes(1);
  expect(onCapture).toHaveBeenCalledWith({ x: 100, y: 100, width: 60, height: 50 });
});

it("does not capture a region smaller than 6x6 (a click, not a drag)", () => {
  const onCapture = vi.fn();
  mountRegion(onCapture);
  act(() => {
    md(100, 100);
    mm(103, 102);
    mu(103, 102);
  });
  expect(onCapture).not.toHaveBeenCalled();
});
