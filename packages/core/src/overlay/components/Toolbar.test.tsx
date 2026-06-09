// @vitest-environment happy-dom
import { render } from "preact";
import { afterEach, expect, it, vi } from "vitest";
import type { ToolbarProps } from "./Toolbar.js";
import { Toolbar } from "./Toolbar.js";

let container: HTMLDivElement;

afterEach(() => {
  if (container) {
    render(null, container);
    container.remove();
  }
});

function setup(overrides: Partial<ToolbarProps> = {}) {
  container = document.createElement("div");
  document.body.appendChild(container);

  const props: ToolbarProps = {
    fab: { right: 16, bottom: 16 },
    fabOpen: false,
    mode: null,
    itemCount: 0,
    copied: false,
    clearOpen: false,
    onOrbClick: vi.fn(),
    onSetMode: vi.fn(),
    onClear: vi.fn(),
    onCopy: vi.fn(),
    onOrbPointerDown: vi.fn(),
    onHandlePointerDown: vi.fn(),
    onConfirmClear: vi.fn(),
    onCancelClear: vi.fn(),
    ...overrides,
  };

  render(<Toolbar {...props} />, container);
  return { container, props };
}

it("always renders the orb button", () => {
  const { container } = setup();
  const orb = container.querySelector<HTMLButtonElement>(
    'button[title="pinpoint — click to open; drag to move"]',
  );
  expect(orb).not.toBeNull();
});

it("when fabOpen=true, pill is visible with Pick/Screenshot/Clear buttons and Copy", () => {
  const { container } = setup({ fabOpen: true, itemCount: 2 });
  const pill = container.querySelector(".pp-pill") as HTMLElement;
  expect(pill).not.toBeNull();
  // Pick button
  expect(container.querySelector('button[title="Pick an element"]')).not.toBeNull();
  // Screenshot button
  expect(container.querySelector('button[title="Drag a region to screenshot"]')).not.toBeNull();
  // Clear button
  expect(container.querySelector('button[title="Clear all annotations"]')).not.toBeNull();
  // Copy button
  expect(
    container.querySelector(
      'button[title="Copy annotations to clipboard (then Cmd+Shift+V into Claude)"]',
    ),
  ).not.toBeNull();
});

it("when clearOpen=true, confirm panel shows with item count and Clear all button", () => {
  const { container } = setup({ clearOpen: true, itemCount: 3, fabOpen: true });
  const panelText = container.textContent;
  expect(panelText).toContain("Clear all 3 annotations?");
  // The ConfirmRow renders a "Clear all" button
  const buttons = Array.from(container.querySelectorAll("button"));
  const clearAllBtn = buttons.find((b) => b.textContent === "Clear all");
  expect(clearAllBtn).not.toBeNull();
});

it("singular annotation text when itemCount=1", () => {
  const { container } = setup({ clearOpen: true, itemCount: 1, fabOpen: true });
  expect(container.textContent).toContain("Clear all 1 annotation?");
});

it("clearOpen=false → no confirm panel", () => {
  const { container } = setup({ clearOpen: false, itemCount: 3 });
  expect(container.textContent).not.toContain("Clear all");
});

it("onConfirmClear is called when Clear all confirm button is clicked", () => {
  const onConfirmClear = vi.fn();
  const { container } = setup({ clearOpen: true, itemCount: 2, fabOpen: true, onConfirmClear });
  const buttons = Array.from(container.querySelectorAll("button"));
  const clearAllBtn = buttons.find((b) => b.textContent === "Clear all")!;
  clearAllBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(onConfirmClear).toHaveBeenCalledOnce();
});

it("onCancelClear is called when Cancel button is clicked", () => {
  const onCancelClear = vi.fn();
  const { container } = setup({ clearOpen: true, itemCount: 2, fabOpen: true, onCancelClear });
  const buttons = Array.from(container.querySelectorAll("button"));
  const cancelBtn = buttons.find((b) => b.textContent === "Cancel")!;
  cancelBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(onCancelClear).toHaveBeenCalledOnce();
});
