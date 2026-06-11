// @vitest-environment happy-dom
import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, expect, it, vi } from "vitest";
import type { Mode } from "../state/types.js";
import { usePicker } from "./usePicker.js";

let container: HTMLDivElement;

afterEach(() => {
  if (container) {
    render(null, container);
    container.remove();
  }
});

function mountPicker(mode: Mode, onHover: (r: unknown) => void, hostEl: HTMLElement | null = null) {
  container = document.createElement("div");
  document.body.appendChild(container);
  function Probe({ mode }: { mode: Mode }) {
    usePicker({ mode, hostEl, onHover, onPick: () => {} });
    return <div />;
  }
  const rerender = (m: Mode) =>
    act(() => {
      render(<Probe mode={m} />, container);
    });
  rerender(mode);
  return rerender;
}

it("clears the hover highlight when the tool leaves pick mode (TASK-29)", () => {
  const onHover = vi.fn();
  const rerender = mountPicker("pick", onHover);
  onHover.mockClear();
  rerender(null); // deselect Pick / close the toolbar
  expect(onHover).toHaveBeenCalledWith(null);
});

it("clears the hover highlight when the pointer leaves the window while picking (TASK-29)", () => {
  const onHover = vi.fn();
  mountPicker("pick", onHover);
  onHover.mockClear();
  act(() => {
    // mouseout with no relatedTarget == pointer left the document/window
    document.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: null }));
  });
  expect(onHover).toHaveBeenCalledWith(null);
});

it("clears the hover highlight when the cursor moves over the overlay UI (TASK-29)", () => {
  const onHover = vi.fn();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const orig = document.elementFromPoint;
  document.elementFromPoint = () => host; // cursor is over the overlay host
  try {
    mountPicker("pick", onHover, host);
    onHover.mockClear();
    act(() => {
      document.dispatchEvent(
        new MouseEvent("mousemove", { bubbles: true, clientX: 10, clientY: 10 }),
      );
    });
    expect(onHover).toHaveBeenCalledWith(null);
  } finally {
    document.elementFromPoint = orig;
    host.remove();
  }
});
