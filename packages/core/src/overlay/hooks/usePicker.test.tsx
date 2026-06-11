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

function mountPicker(mode: Mode, onHover: (r: unknown) => void) {
  container = document.createElement("div");
  document.body.appendChild(container);
  function Probe({ mode }: { mode: Mode }) {
    usePicker({ mode, hostEl: null, onHover, onPick: () => {} });
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
