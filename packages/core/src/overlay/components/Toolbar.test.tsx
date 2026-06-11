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

// --- TASK-24: animated sliding indicator behind the tool toggles ---

const indicator = (c: HTMLElement) => c.querySelector<HTMLElement>(".pp-tool-indicator");
const translateX = (el: HTMLElement) =>
  /translateX\((-?\d+(?:\.\d+)?)px\)/.exec(el.style.transform)?.[1];

it("renders a single tool indicator inside the open pill", () => {
  const { container } = setup({ fabOpen: true, mode: "pick" });
  expect(container.querySelectorAll(".pp-tool-indicator").length).toBe(1);
});

it("indicator is hidden (opacity 0) when no tool is selected", () => {
  const { container } = setup({ fabOpen: true, mode: null });
  expect(indicator(container)!.style.opacity).toBe("0");
});

it("indicator floats in (opacity 1) at the Pick slot when mode=pick", () => {
  const { container } = setup({ fabOpen: true, mode: "pick" });
  const ind = indicator(container)!;
  expect(ind.style.opacity).toBe("1");
  expect(translateX(ind)).toBe("0");
});

it("indicator slides to the Screenshot slot (greater translateX) when mode=screenshot", () => {
  const pick = setup({ fabOpen: true, mode: "pick" });
  const pickX = Number(translateX(indicator(pick.container)!));
  pick.container.remove();

  const shot = setup({ fabOpen: true, mode: "screenshot" });
  const ind = indicator(shot.container)!;
  expect(ind.style.opacity).toBe("1");
  expect(Number(translateX(ind))).toBeGreaterThan(pickX);
});

it("deselecting a tool floats the indicator out in place (keeps last slot's translateX)", () => {
  // Re-render the SAME instance: screenshot -> null. The indicator stays at the
  // screenshot slot while fading out, rather than snapping back to the pick slot.
  container = document.createElement("div");
  document.body.appendChild(container);
  const base: ToolbarProps = {
    fab: { right: 16, bottom: 16 },
    fabOpen: true,
    mode: "screenshot",
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
  };
  render(<Toolbar {...base} />, container);
  const shotX = Number(translateX(indicator(container)!));

  render(<Toolbar {...base} mode={null} />, container);
  const ind = indicator(container)!;
  expect(ind.style.opacity).toBe("0");
  expect(Number(translateX(ind))).toBe(shotX);
});

it("active tool button keeps pp-active for color but carries no inline blue background", () => {
  const { container } = setup({ fabOpen: true, mode: "pick" });
  const pick = container.querySelector<HTMLButtonElement>('button[title="Pick an element"]')!;
  expect(pick.className).toContain("pp-active");
  expect(pick.style.background).toBe("");
});
