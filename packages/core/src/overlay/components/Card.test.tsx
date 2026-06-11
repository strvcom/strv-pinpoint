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
    selected: [
      {
        selector: "button",
        tagName: "BUTTON",
        text: "Click me",
        react: { componentName: "MyButton", ancestry: [] },
      },
    ],
    rect: { x: 0, y: 0, width: 100, height: 40 },
    comment: "initial comment",
    wantScreenshot: false,
    saved: true, // TASK-30: default to a saved card so existing tests see the full control set
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
    onSave: vi.fn(),
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
    const { card } = setup(
      makeItem({
        selected: [
          {
            selector: "button",
            tagName: "BUTTON",
            text: "",
            react: { componentName: "FancyBtn", ancestry: [] },
          },
        ],
      }),
    );
    expect(card.textContent).toContain("FancyBtn");
  });

  it("falls back to tagName when react is null", () => {
    const { card } = setup(
      makeItem({
        selected: [{ selector: "section", tagName: "SECTION", text: "", react: null }],
      }),
    );
    expect(card.textContent).toContain("SECTION");
  });

  it("falls back to screenshot when selected is empty", () => {
    const { card } = setup(makeItem({ selected: [], kind: "screenshot" }));
    expect(card.textContent).toContain("screenshot");
  });
});

// ─── Draft vs saved (TASK-30) ──────────────────────────────────────────────────

describe("draft vs saved card (TASK-30)", () => {
  it("draft card shows a Save button and no minimize button", () => {
    const { card } = setup(makeItem({ saved: false }));
    expect(card.querySelector('button[title="save annotation"]')).not.toBeNull();
    expect(card.querySelector('button[title="minimize"]')).toBeNull();
  });

  it("Shift+Enter on a draft saves", () => {
    const { card, props } = setup(makeItem({ saved: false }));
    const ta = card.querySelector("textarea")!;
    act(() => {
      ta.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true }),
      );
    });
    expect(props.onSave).toHaveBeenCalled();
  });

  it("clicking Save on a draft calls onSave", () => {
    const { card, props } = setup(makeItem({ saved: false }));
    const save = card.querySelector<HTMLButtonElement>('button[title="save annotation"]')!;
    act(() => {
      save.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(props.onSave).toHaveBeenCalled();
  });

  it("saved card shows minimize and no Save button", () => {
    const { card } = setup(makeItem({ saved: true }));
    expect(card.querySelector('button[title="minimize"]')).not.toBeNull();
    expect(card.querySelector('button[title="save annotation"]')).toBeNull();
  });

  it("draft trash discards immediately (no confirm)", () => {
    const { card, props } = setup(makeItem({ saved: false }));
    const trash = card.querySelector<HTMLButtonElement>('button[title="discard draft"]')!;
    act(() => {
      trash.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(props.onDelete).toHaveBeenCalled();
    expect(card.querySelector(".pp-confirm")).toBeNull();
  });
});

// ─── Escape behavior (TASK-31 logic, on the textarea) ──────────────────────────

const pressEscape = (card: HTMLElement) => {
  const ta = card.querySelector("textarea")!;
  act(() => {
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
};
const discardOverlay = (card: HTMLElement) =>
  Array.from(card.querySelectorAll(".pp-confirm")).find((o) =>
    o.textContent?.includes("Discard changes?"),
  ) as HTMLElement | undefined;

describe("escape behavior", () => {
  it("empty draft: Escape deletes immediately (no prompt)", () => {
    const onDelete = vi.fn();
    const { card } = setup(makeItem({ saved: false, comment: "" }), { onDelete });
    pressEscape(card);
    expect(onDelete).toHaveBeenCalledOnce();
    expect(discardOverlay(card)).toBeUndefined();
  });

  it("draft with content: Escape opens the discard prompt instead of deleting", () => {
    const onDelete = vi.fn();
    const { card } = setup(makeItem({ saved: false, comment: "draft text" }), { onDelete });
    pressEscape(card);
    expect(onDelete).not.toHaveBeenCalled();
    expect(discardOverlay(card)).toBeDefined();
  });

  it("draft discard prompt → Discard deletes the draft", () => {
    const onDelete = vi.fn();
    const { card } = setup(makeItem({ saved: false, comment: "draft text" }), { onDelete });
    pressEscape(card);
    const discardBtn = Array.from(discardOverlay(card)!.querySelectorAll("button")).find(
      (b) => b.textContent === "Discard",
    )!;
    act(() => discardBtn.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("saved card with no changes: Escape just minimizes", () => {
    const onMinimize = vi.fn();
    const { card } = setup(makeItem({ saved: true, comment: "kept" }), { onMinimize });
    pressEscape(card);
    expect(onMinimize).toHaveBeenCalledOnce();
    expect(discardOverlay(card)).toBeUndefined();
  });

  it("saved card with edits: Escape opens the discard prompt; Discard reverts then minimizes", () => {
    // The textarea is controlled by item.comment, so an "edit" = the parent re-rendering the Card
    // with a new item.comment. initialComment was captured at first mount ("kept"), so this is dirty.
    const onComment = vi.fn();
    const onMinimize = vi.fn();
    const cont = document.createElement("div");
    document.body.appendChild(cont);
    const base = {
      n: 1,
      confirming: false,
      pressingBadgeRef: { current: null as string | null },
      onComment,
      onToggleScreenshot: vi.fn(),
      onMinimize,
      onDelete: vi.fn(),
      onSave: vi.fn(),
      onSetConfirming: vi.fn(),
      onDragDelta: vi.fn(),
      nodeRef: vi.fn(),
      hbRef: vi.fn(),
    };
    const item = makeItem({ saved: true, comment: "kept" });
    render(<Card {...base} item={item} />, cont);
    render(<Card {...base} item={{ ...item, comment: "kept + edits" }} />, cont); // simulate edit
    const card = cont.querySelector(".pp-card") as HTMLDivElement;

    pressEscape(card);
    expect(onMinimize).not.toHaveBeenCalled();
    expect(discardOverlay(card)).toBeDefined();

    const discardBtn = Array.from(discardOverlay(card)!.querySelectorAll("button")).find(
      (b) => b.textContent === "Discard",
    )!;
    act(() => discardBtn.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onComment).toHaveBeenLastCalledWith("kept"); // reverted to last-saved text
    expect(onMinimize).toHaveBeenCalledOnce();

    render(null, cont);
    cont.remove();
  });

  it("discard prompt → Cancel hides it without deleting or minimizing", () => {
    const onDelete = vi.fn();
    const onMinimize = vi.fn();
    const { card } = setup(makeItem({ saved: false, comment: "draft text" }), {
      onDelete,
      onMinimize,
    });
    pressEscape(card);
    const cancelBtn = Array.from(discardOverlay(card)!.querySelectorAll("button")).find(
      (b) => b.textContent === "Cancel",
    )!;
    act(() => cancelBtn.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onDelete).not.toHaveBeenCalled();
    expect(onMinimize).not.toHaveBeenCalled();
    expect(discardOverlay(card)).toBeUndefined();
  });
});
