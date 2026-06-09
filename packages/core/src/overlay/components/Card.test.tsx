// @vitest-environment happy-dom
import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Item } from "../state/types.js";
import { Card } from "./Card.js";

let container: HTMLDivElement;

afterEach(() => {
  if (container) {
    render(null, container);
    container.remove();
  }
});

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: "i1",
    kind: "element",
    componentName: "MyButton",
    ancestry: [],
    selector: "button",
    tagName: "BUTTON",
    text: "Click me",
    rect: { x: 0, y: 0, width: 100, height: 40 },
    comment: "initial comment",
    wantScreenshot: false,
    ...overrides,
  };
}

function setup(item: Item, overrides: Partial<Parameters<typeof Card>[0]> = {}) {
  container = document.createElement("div");
  document.body.appendChild(container);

  const props = {
    item,
    n: 1,
    confirming: false,
    pressingBadgeRef: { current: null as string | null },
    onComment: vi.fn(),
    onToggleScreenshot: vi.fn(),
    onMinimize: vi.fn(),
    onDelete: vi.fn(),
    onSetConfirming: vi.fn(),
    onDragDelta: vi.fn(),
    nodeRef: vi.fn(),
    hbRef: vi.fn(),
    ...overrides,
  };

  render(<Card {...props} />, container);

  const card = container.querySelector(".pp-card") as HTMLDivElement;
  return { container, card, props };
}

// ─── Camera button ───────────────────────────────────────────────────────────

describe("camera button — element kind", () => {
  it("renders a camera button for kind=element", () => {
    const { card } = setup(makeItem({ kind: "element" }));
    const cam = card.querySelector<HTMLButtonElement>(
      'button[title="include a screenshot of this"]',
    );
    expect(cam).not.toBeNull();
  });

  it("camera button has pp-active class when wantScreenshot=true", () => {
    const { card } = setup(makeItem({ kind: "element", wantScreenshot: true }));
    const cam = card.querySelector<HTMLButtonElement>(
      'button[title="include a screenshot of this"]',
    )!;
    expect(cam.classList.contains("pp-active")).toBe(true);
  });

  it("camera button does NOT have pp-active when wantScreenshot=false", () => {
    const { card } = setup(makeItem({ kind: "element", wantScreenshot: false }));
    const cam = card.querySelector<HTMLButtonElement>(
      'button[title="include a screenshot of this"]',
    )!;
    expect(cam.classList.contains("pp-active")).toBe(false);
  });

  it("clicking camera calls onToggleScreenshot", () => {
    const onToggleScreenshot = vi.fn();
    const { card } = setup(makeItem({ kind: "element" }), { onToggleScreenshot });
    const cam = card.querySelector<HTMLButtonElement>(
      'button[title="include a screenshot of this"]',
    )!;
    cam.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onToggleScreenshot).toHaveBeenCalledOnce();
  });
});

// TASK-18 #4: screenshot kind gets NO camera button
describe("camera button — screenshot kind", () => {
  it("does NOT render a camera button for kind=screenshot", () => {
    const { card } = setup(makeItem({ kind: "screenshot" }));
    const cam = card.querySelector<HTMLButtonElement>(
      'button[title="include a screenshot of this"]',
    );
    expect(cam).toBeNull();
  });
});

// ─── Textarea ────────────────────────────────────────────────────────────────

describe("textarea", () => {
  it("typing in the textarea calls onComment with the new value", () => {
    const onComment = vi.fn();
    const { card } = setup(makeItem(), { onComment });
    const ta = card.querySelector("textarea")!;
    // Simulate input event
    Object.defineProperty(ta, "value", { value: "new text", writable: true });
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    expect(onComment).toHaveBeenCalledWith("new text");
  });

  it("Shift+Enter calls onMinimize", () => {
    const onMinimize = vi.fn();
    const { card } = setup(makeItem(), { onMinimize });
    const ta = card.querySelector("textarea")!;
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true }));
    expect(onMinimize).toHaveBeenCalledOnce();
  });

  it("plain Enter does NOT call onMinimize", () => {
    const onMinimize = vi.fn();
    const { card } = setup(makeItem(), { onMinimize });
    const ta = card.querySelector("textarea")!;
    ta.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", shiftKey: false, bubbles: true }),
    );
    expect(onMinimize).not.toHaveBeenCalled();
  });
});

// ─── Minimize button ──────────────────────────────────────────────────────────

describe("minimize button", () => {
  it("clicking the minimize button calls onMinimize", () => {
    const onMinimize = vi.fn();
    const { card } = setup(makeItem(), { onMinimize });
    const minBtn = card.querySelector<HTMLButtonElement>('button[title="minimize"]')!;
    minBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onMinimize).toHaveBeenCalledOnce();
  });
});

// ─── Delete confirm flow ──────────────────────────────────────────────────────

describe("delete confirm overlay", () => {
  it("clicking delete shows the confirm overlay with Delete this annotation?", () => {
    const { card } = setup(makeItem());
    const delBtn = card.querySelector<HTMLButtonElement>('button[title="delete annotation"]')!;
    act(() => {
      delBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const confirm = card.querySelector(".pp-confirm");
    expect(confirm).not.toBeNull();
    expect(confirm!.textContent).toContain("Delete this annotation?");
  });

  it("clicking delete calls onSetConfirming(true)", () => {
    const onSetConfirming = vi.fn();
    const { card } = setup(makeItem(), { onSetConfirming });
    const delBtn = card.querySelector<HTMLButtonElement>('button[title="delete annotation"]')!;
    act(() => {
      delBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSetConfirming).toHaveBeenCalledWith(true);
  });

  it("clicking Delete in confirm overlay calls onSetConfirming(false) then onDelete", () => {
    const onSetConfirming = vi.fn();
    const onDelete = vi.fn();
    const { card } = setup(makeItem(), { onSetConfirming, onDelete });

    // Open the confirm overlay
    const delBtn = card.querySelector<HTMLButtonElement>('button[title="delete annotation"]')!;
    act(() => {
      delBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Click the "Delete" confirm button
    const confirmOverlay = card.querySelector(".pp-confirm")!;
    const confirmDeleteBtn = Array.from(confirmOverlay.querySelectorAll("button")).find(
      (b) => b.textContent === "Delete",
    )!;
    act(() => {
      confirmDeleteBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onSetConfirming).toHaveBeenCalledWith(false);
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("clicking Cancel in confirm overlay calls onSetConfirming(false) and hides confirm without calling onDelete", () => {
    const onSetConfirming = vi.fn();
    const onDelete = vi.fn();
    const { card } = setup(makeItem(), { onSetConfirming, onDelete });

    // Open the confirm overlay
    const delBtn = card.querySelector<HTMLButtonElement>('button[title="delete annotation"]')!;
    act(() => {
      delBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Click "Cancel"
    const confirmOverlay = card.querySelector(".pp-confirm")!;
    const cancelBtn = Array.from(confirmOverlay.querySelectorAll("button")).find(
      (b) => b.textContent === "Cancel",
    )!;
    act(() => {
      cancelBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onSetConfirming).toHaveBeenCalledWith(false);
    expect(onDelete).not.toHaveBeenCalled();
    // Confirm overlay should be gone
    expect(card.querySelector(".pp-confirm")).toBeNull();
  });

  it("clicking delete twice does NOT open a second confirm overlay", () => {
    const onSetConfirming = vi.fn();
    const { card } = setup(makeItem(), { onSetConfirming });
    const delBtn = card.querySelector<HTMLButtonElement>('button[title="delete annotation"]')!;
    act(() => {
      delBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    act(() => {
      delBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const overlays = card.querySelectorAll(".pp-confirm");
    expect(overlays.length).toBe(1);
  });
});

// ─── Focus-out guard (TASK-18 #3) ────────────────────────────────────────────

describe("focus-out guard", () => {
  // Note: happy-dom focus events have known limitations with relatedTarget.
  // We test the guard logic by directly dispatching focusout on the card root.
  // The guard checks: if confirming || pressingBadge → skip; else if relatedTarget outside → onMinimize().

  it("focusout to an element outside the card calls onMinimize when not confirming and not pressingBadge", () => {
    const onMinimize = vi.fn();
    const { card } = setup(makeItem(), {
      onMinimize,
      confirming: false,
      pressingBadgeRef: { current: null },
    });

    const outside = document.createElement("button");
    document.body.appendChild(outside);

    card.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: outside }));

    expect(onMinimize).toHaveBeenCalledOnce();
    outside.remove();
  });

  it("focusout is suppressed when confirming=true (TASK-18 #3)", () => {
    const onMinimize = vi.fn();
    const { card } = setup(makeItem(), {
      onMinimize,
      confirming: true,
      pressingBadgeRef: { current: null },
    });

    const outside = document.createElement("button");
    document.body.appendChild(outside);

    card.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: outside }));

    expect(onMinimize).not.toHaveBeenCalled();
    outside.remove();
  });

  it("focusout is suppressed when pressingBadgeRef.current === item.id (TASK-18 #3 CRITICAL #1)", () => {
    const onMinimize = vi.fn();
    const item = makeItem(); // id = "i1"
    const { card } = setup(item, {
      onMinimize,
      confirming: false,
      pressingBadgeRef: { current: "i1" }, // matches item.id — simulates live badge press
    });

    const outside = document.createElement("button");
    document.body.appendChild(outside);

    card.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: outside }));

    expect(onMinimize).not.toHaveBeenCalled();
    outside.remove();
  });

  it("focusout fires when pressingBadgeRef.current is a DIFFERENT item id", () => {
    const onMinimize = vi.fn();
    const item = makeItem(); // id = "i1"
    const { card } = setup(item, {
      onMinimize,
      confirming: false,
      pressingBadgeRef: { current: "i2" }, // different id — should NOT suppress
    });

    const outside = document.createElement("button");
    document.body.appendChild(outside);

    card.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: outside }));

    expect(onMinimize).toHaveBeenCalledOnce();
    outside.remove();
  });

  it("focusout to an element inside the card does NOT call onMinimize", () => {
    const onMinimize = vi.fn();
    const { card } = setup(makeItem(), { onMinimize, confirming: false, pressingBadge: false });

    // The textarea is inside the card
    const ta = card.querySelector("textarea")!;
    card.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: ta }));

    expect(onMinimize).not.toHaveBeenCalled();
  });
});

// ─── Header number badge ──────────────────────────────────────────────────────

describe("header badge", () => {
  it("renders the badge number", () => {
    const { card } = setup(makeItem(), { n: 4 });
    // hbRef is called on the span; find it by content in the header
    const header = card.querySelector<HTMLDivElement>("div > div")!;
    const spans = header.querySelectorAll("span");
    // First span is the number badge (hbRef target)
    expect(spans[0].textContent).toBe("4");
  });

  it("badge background is #22c55e for element kind", () => {
    const { card } = setup(makeItem({ kind: "element" }));
    const header = card.querySelector<HTMLDivElement>("div > div")!;
    const badge = header.querySelectorAll("span")[0];
    expect(badge.style.cssText).toContain("#22c55e");
  });

  it("badge background is #a855f7 for screenshot kind", () => {
    const { card } = setup(makeItem({ kind: "screenshot" }));
    const header = card.querySelector<HTMLDivElement>("div > div")!;
    const badge = header.querySelectorAll("span")[0];
    expect(badge.style.cssText).toContain("#a855f7");
  });
});

// ─── Label ────────────────────────────────────────────────────────────────────

describe("label", () => {
  it("shows componentName when available", () => {
    const { card } = setup(makeItem({ componentName: "FancyBtn" }));
    expect(card.textContent).toContain("FancyBtn");
  });

  it("falls back to tagName when componentName is null", () => {
    const { card } = setup(makeItem({ componentName: null, tagName: "SECTION" }));
    expect(card.textContent).toContain("SECTION");
  });

  it("falls back to screenshot when both are null/empty", () => {
    const { card } = setup(makeItem({ componentName: null, tagName: "", kind: "screenshot" }));
    expect(card.textContent).toContain("screenshot");
  });
});
