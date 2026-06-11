// @vitest-environment happy-dom
import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Item } from "../state/types.js";
import { Card } from "./Card.js";

// ProseMirror needs a real contenteditable/selection (not in happy-dom) — mock the editor module
// at the boundary so the Card mounts; assert wiring via the captured options (TASK-31).
vi.mock("../markdown/editor.js", () => ({
  createMarkdownEditor: vi.fn(() => ({ destroy: vi.fn(), focus: vi.fn() })),
}));

import { createMarkdownEditor } from "../markdown/editor.js";

type EditorOpts = {
  value: string;
  onChange: (md: string) => void;
  onSave: () => void;
  onEscape: () => void;
};
const lastEditorOpts = (): EditorOpts => {
  const calls = (createMarkdownEditor as unknown as { mock: { calls: unknown[][] } }).mock.calls;
  return calls[calls.length - 1][1] as EditorOpts;
};

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

  act(() => {
    render(<Card {...props} />, container);
  }); // flush effects (animate-in + editor mount)

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

// ─── Markdown comment editor (TASK-31) ─────────────────────────────────────────

describe("markdown comment editor", () => {
  it("renders a markdown editor host (.pp-md), not a textarea", () => {
    const { card } = setup(makeItem());
    expect(card.querySelector(".pp-md")).not.toBeNull();
    expect(card.querySelector("textarea")).toBeNull();
  });

  it("mounts the editor with the item's comment as initial value", () => {
    setup(makeItem({ comment: "- a\n- b" }));
    expect(lastEditorOpts().value).toBe("- a\n- b");
  });

  it("the editor's onChange forwards to onComment", () => {
    const onComment = vi.fn();
    setup(makeItem(), { onComment });
    lastEditorOpts().onChange("new md");
    expect(onComment).toHaveBeenCalledWith("new md");
  });

  it("saved card: editor onSave minimizes (Shift+Enter behavior)", () => {
    const onMinimize = vi.fn();
    setup(makeItem({ saved: true }), { onMinimize });
    lastEditorOpts().onSave();
    expect(onMinimize).toHaveBeenCalledOnce();
  });

  it("draft card: editor onSave saves", () => {
    const onSave = vi.fn();
    setup(makeItem({ saved: false }), { onSave });
    lastEditorOpts().onSave();
    expect(onSave).toHaveBeenCalledOnce();
  });
});

// ─── Escape behavior (TASK-31) ─────────────────────────────────────────────────

const discardOverlay = (card: HTMLElement) =>
  Array.from(card.querySelectorAll(".pp-confirm")).find((o) =>
    o.textContent?.includes("Discard changes?"),
  ) as HTMLElement | undefined;

describe("escape behavior", () => {
  it("empty draft: Escape deletes immediately (no prompt)", () => {
    const onDelete = vi.fn();
    const { card } = setup(makeItem({ saved: false, comment: "" }), { onDelete });
    act(() => lastEditorOpts().onEscape());
    expect(onDelete).toHaveBeenCalledOnce();
    expect(discardOverlay(card)).toBeUndefined();
  });

  it("draft with typed content: Escape opens the discard prompt instead of deleting", () => {
    const onDelete = vi.fn();
    const { card } = setup(makeItem({ saved: false, comment: "" }), { onDelete });
    act(() => lastEditorOpts().onChange("typed something"));
    act(() => lastEditorOpts().onEscape());
    expect(onDelete).not.toHaveBeenCalled();
    expect(discardOverlay(card)).toBeDefined();
  });

  it("draft discard prompt → Discard deletes the draft", () => {
    const onDelete = vi.fn();
    const { card } = setup(makeItem({ saved: false, comment: "draft text" }), { onDelete });
    act(() => lastEditorOpts().onEscape());
    const discardBtn = Array.from(discardOverlay(card)!.querySelectorAll("button")).find(
      (b) => b.textContent === "Discard",
    )!;
    act(() => discardBtn.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("saved card with no changes: Escape just minimizes", () => {
    const onMinimize = vi.fn();
    const { card } = setup(makeItem({ saved: true, comment: "kept" }), { onMinimize });
    act(() => lastEditorOpts().onEscape());
    expect(onMinimize).toHaveBeenCalledOnce();
    expect(discardOverlay(card)).toBeUndefined();
  });

  it("saved card with edits: Escape opens the discard prompt", () => {
    const onMinimize = vi.fn();
    const { card } = setup(makeItem({ saved: true, comment: "kept" }), { onMinimize });
    act(() => lastEditorOpts().onChange("kept + edits"));
    act(() => lastEditorOpts().onEscape());
    expect(onMinimize).not.toHaveBeenCalled();
    expect(discardOverlay(card)).toBeDefined();
  });

  it("saved discard prompt → Discard reverts to last-saved text then minimizes", () => {
    const onComment = vi.fn();
    const onMinimize = vi.fn();
    const { card } = setup(makeItem({ saved: true, comment: "kept" }), { onComment, onMinimize });
    act(() => lastEditorOpts().onChange("kept + edits"));
    act(() => lastEditorOpts().onEscape());
    const discardBtn = Array.from(discardOverlay(card)!.querySelectorAll("button")).find(
      (b) => b.textContent === "Discard",
    )!;
    act(() => discardBtn.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onComment).toHaveBeenLastCalledWith("kept"); // reverted
    expect(onMinimize).toHaveBeenCalledOnce();
  });

  it("discard prompt → Cancel hides it without deleting or minimizing", () => {
    const onDelete = vi.fn();
    const onMinimize = vi.fn();
    const { card } = setup(makeItem({ saved: true, comment: "kept" }), { onDelete, onMinimize });
    act(() => lastEditorOpts().onChange("kept + edits"));
    act(() => lastEditorOpts().onEscape());
    const cancelBtn = Array.from(discardOverlay(card)!.querySelectorAll("button")).find(
      (b) => b.textContent === "Cancel",
    )!;
    act(() => cancelBtn.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onDelete).not.toHaveBeenCalled();
    expect(onMinimize).not.toHaveBeenCalled();
    expect(discardOverlay(card)).toBeUndefined();
  });

  it("saved card: editing then saving (Shift+Enter) rebaselines so a later Escape is clean", () => {
    const onMinimize = vi.fn();
    const { card } = setup(makeItem({ saved: true, comment: "kept" }), { onMinimize });
    act(() => lastEditorOpts().onChange("edited"));
    act(() => lastEditorOpts().onSave()); // saved card: onSave minimizes + rebaselines
    expect(onMinimize).toHaveBeenCalledOnce();
    // reopen-less check: a subsequent Escape with current === new baseline is clean
    act(() => lastEditorOpts().onEscape());
    expect(discardOverlay(card)).toBeUndefined();
    expect(onMinimize).toHaveBeenCalledTimes(2);
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

    // An element inside the card (the markdown editor host)
    const inside = card.querySelector(".pp-md")!;
    card.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: inside }));

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
