// @vitest-environment happy-dom
import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, expect, it } from "vitest";
import { useUnloadGuard } from "./useUnloadGuard.js";

let container: HTMLDivElement;

afterEach(() => {
  if (container) {
    render(null, container);
    container.remove();
  }
});

function mount(active: boolean) {
  container = document.createElement("div");
  document.body.appendChild(container);
  function Probe({ active }: { active: boolean }) {
    useUnloadGuard(active);
    return <div />;
  }
  const rerender = (a: boolean) =>
    act(() => {
      render(<Probe active={a} />, container);
    });
  rerender(active);
  return rerender;
}

function fireBeforeUnload(): Event {
  const e = new Event("beforeunload", { cancelable: true });
  act(() => {
    window.dispatchEvent(e);
  });
  return e;
}

it("prevents unload when active (annotations present)", () => {
  mount(true);
  expect(fireBeforeUnload().defaultPrevented).toBe(true);
});

it("does not prevent unload when inactive (no annotations)", () => {
  mount(false);
  expect(fireBeforeUnload().defaultPrevented).toBe(false);
});

it("removes the guard when active flips to false", () => {
  const rerender = mount(true);
  rerender(false);
  expect(fireBeforeUnload().defaultPrevented).toBe(false);
});
