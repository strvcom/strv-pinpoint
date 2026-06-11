// @vitest-environment happy-dom
import { render } from "preact";
import { afterEach, expect, it, vi } from "vitest";
import type { Item } from "../state/types.js";
import type { MarksLayerProps } from "./MarksLayer.js";
import { MarksLayer } from "./MarksLayer.js";

let container: HTMLDivElement;

afterEach(() => {
  if (container) {
    render(null, container);
    container.remove();
  }
});

function makeItem(id: string, kind: Item["kind"] = "element"): Item {
  return {
    id,
    kind,
    selected: [{ selector: "div", tagName: "DIV", text: "", react: { componentName: "Comp", ancestry: [] } }],
    rect: { x: 10, y: 10, width: 80, height: 30 },
    comment: "",
    wantScreenshot: false,
    saved: true, // TASK-30: saved cards (full controls) for these layout tests
  };
}

function setup(overrides: Partial<MarksLayerProps> = {}) {
  container = document.createElement("div");
  document.body.appendChild(container);

  const props: MarksLayerProps = {
    items: [],
    open: {},
    fabOpen: true,
    confirming: false,
    pressingBadgeRef: { current: null },
    registerNode: vi.fn(),
    onBadgeToggle: vi.fn(),
    onBadgePressStart: vi.fn(),
    onComment: vi.fn(),
    onToggleScreenshot: vi.fn(),
    onMinimize: vi.fn(),
    onDelete: vi.fn(),
    onSave: vi.fn(),
    onSetConfirming: vi.fn(),
    onDragDelta: vi.fn(),
    ...overrides,
  };

  render(<MarksLayer {...props} />, container);
  return { container, props };
}

it("hidden when fabOpen=false", () => {
  const { container } = setup({ fabOpen: false });
  const root = container.firstElementChild as HTMLElement;
  expect(root.style.display).toBe("none");
});

it("visible when fabOpen=true", () => {
  const { container } = setup({ fabOpen: true });
  const root = container.firstElementChild as HTMLElement;
  expect(root.style.display).toBe("block");
});

it("renders a badge per item", () => {
  const items = [makeItem("a"), makeItem("b")];
  const { container } = setup({ items });
  const badges = container.querySelectorAll(".pp-badge");
  expect(badges.length).toBe(2);
});

it("no cards rendered when none are open", () => {
  const items = [makeItem("a"), makeItem("b")];
  const { container } = setup({ items, open: {} });
  const cards = container.querySelectorAll(".pp-card");
  expect(cards.length).toBe(0);
});

it("renders a card only for open items", () => {
  const items = [makeItem("a"), makeItem("b"), makeItem("c")];
  const { container } = setup({ items, open: { b: true } });
  const cards = container.querySelectorAll(".pp-card");
  expect(cards.length).toBe(1);
});

it("does NOT set left/top positions on boxes (positioning hook responsibility)", () => {
  const items = [makeItem("a")];
  const { container } = setup({ items });
  // Find the outline box div: it has a border with the element color and starts at 0
  // The box style includes position:absolute and width:0;height:0 (not positioned by this component)
  const allDivs = Array.from(container.querySelectorAll<HTMLElement>("div"));
  // The box div has width:0 and height:0 (not the root or wrapper divs which have inset:0)
  const boxDiv = allDivs.find(
    (d) => d.style.width === "0px" && d.style.height === "0px" && d.style.position === "absolute",
  );
  expect(boxDiv).not.toBeUndefined();
  // position stays 0 — NOT set to item rect
  expect(boxDiv!.style.left).toBe("0px");
  expect(boxDiv!.style.top).toBe("0px");
});

it("registerNode is called for box and badge", () => {
  const items = [makeItem("a")];
  const registerNode = vi.fn();
  setup({ items, registerNode });
  const calls = (registerNode as ReturnType<typeof vi.fn>).mock.calls;
  const parts = calls.map((c: unknown[]) => c[1]);
  expect(parts).toContain("box");
  expect(parts).toContain("badge");
});

it("registerNode is called for card and hb when item is open", () => {
  const items = [makeItem("a")];
  const registerNode = vi.fn();
  setup({ items, open: { a: true }, registerNode });
  const calls = (registerNode as ReturnType<typeof vi.fn>).mock.calls;
  const parts = calls.map((c: unknown[]) => c[1]);
  expect(parts).toContain("card");
  expect(parts).toContain("hb");
});
