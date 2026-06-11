import { useEffect, useRef, useState } from "preact/hooks";
import { ICON, Icon } from "../icons.js";
import type { Item } from "../state/types.js";
import { ConfirmRow } from "./ConfirmRow.js";

const Z = 2147483640;

export function Card({
  item,
  n,
  confirming,
  pressingBadgeRef,
  onComment,
  onToggleScreenshot,
  onMinimize,
  onDelete,
  onSetConfirming,
  onDragDelta,
  nodeRef,
  hbRef,
}: {
  item: Item;
  n: number;
  confirming: boolean;
  /** Live ref: focus-out guard checks if THIS item's badge is being pressed. */
  pressingBadgeRef: { current: string | null };
  onComment: (value: string) => void;
  onToggleScreenshot: () => void;
  onMinimize: () => void;
  onDelete: () => void;
  onSetConfirming: (b: boolean) => void;
  onDragDelta: (dx: number, dy: number) => void;
  nodeRef: (el: HTMLDivElement | null) => void;
  hbRef: (el: HTMLSpanElement | null) => void;
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [visible, setVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Animate in on mount
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setVisible(true);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Focus textarea on mount, caret at end
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    try {
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(ta.value.length, ta.value.length);
    } catch (_) {}
  }, []);

  const color = item.kind === "screenshot" ? "#a855f7" : "#22c55e";

  const cardStyle =
    `position:absolute;pointer-events:auto;width:208px;background:#1b1b1b;border:1px solid #2a6;border-radius:8px;padding:8px;box-shadow:0 6px 20px rgba(0,0,0,.4);z-index:${Z + 6};left:0;top:0;` +
    (visible ? "opacity:1;transform:none" : "opacity:0;transform:scale(.85)");

  const headerStyle =
    "display:flex;align-items:center;gap:6px;color:#fff;font:600 12px system-ui;margin-bottom:6px;cursor:grab";

  const badgeStyle = `display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:16px;height:16px;border-radius:8px;background:${color};color:#06210f;font:bold 10px system-ui`;

  const labelStyle = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";

  const iconBtnStyle = "width:24px;height:24px;border-radius:6px";

  const taStyle =
    "width:100%;box-sizing:border-box;background:#0e0e0e;color:#fff;border:1px solid #333;border-radius:4px;font:12px system-ui;resize:vertical";

  function handleHeaderPointerDown(e: PointerEvent) {
    const target = e.target as Element;
    if (target.closest && target.closest("button")) return;
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX;
    const sy = e.clientY;

    function mv(ev: PointerEvent) {
      onDragDelta(ev.clientX - sx, ev.clientY - sy);
    }
    function up() {
      document.removeEventListener("pointermove", mv, true);
      document.removeEventListener("pointerup", up, true);
    }
    document.addEventListener("pointermove", mv, true);
    document.addEventListener("pointerup", up, true);
  }

  function handleDeleteClick(e: MouseEvent) {
    e.stopPropagation();
    if (showConfirm) return;
    onSetConfirming(true);
    setShowConfirm(true);
  }

  function handleConfirmYes() {
    onSetConfirming(false);
    onDelete();
  }

  function handleConfirmNo() {
    onSetConfirming(false);
    setShowConfirm(false);
    try {
      taRef.current?.focus({ preventScroll: true });
    } catch (_) {}
  }

  function handleFocusOut(e: FocusEvent) {
    // Read pressingBadgeRef LIVE — this fires synchronously with no re-render
    // between badge pointerdown and the card's focusout (TASK-18 #3 / CRITICAL #1).
    if (showConfirm || pressingBadgeRef.current === item.id) return;
    if (confirming) return;
    const card = cardRef.current;
    if (!card) return;
    if (!card.contains(e.relatedTarget as Node | null)) {
      onMinimize();
    }
  }

  return (
    <div
      class="pp-card"
      style={cardStyle}
      ref={(el) => {
        cardRef.current = el;
        nodeRef(el);
      }}
      onFocusOut={handleFocusOut}
    >
      {/* Header */}
      <div style={headerStyle} onPointerDown={handleHeaderPointerDown}>
        <span ref={hbRef} style={badgeStyle}>
          {n}
        </span>
        <span style={labelStyle}>{item.selected[0]?.react?.componentName || item.selected[0]?.tagName || "screenshot"}</span>

        {/* Camera button — element kind ONLY (TASK-18 #4) */}
        {item.kind === "element" && (
          <button
            type="button"
            class={"pp-icon" + (item.wantScreenshot ? " pp-active" : "")}
            title="include a screenshot of this"
            style={iconBtnStyle}
            onClick={(e) => {
              e.stopPropagation();
              onToggleScreenshot();
            }}
          >
            <Icon svg={ICON.camera} />
          </button>
        )}

        {/* Minimize button */}
        <button
          type="button"
          class="pp-icon"
          title="minimize"
          style={iconBtnStyle}
          onClick={(e) => {
            e.stopPropagation();
            onMinimize();
          }}
        >
          <Icon svg={ICON.min} />
        </button>

        {/* Delete button */}
        <button
          type="button"
          class="pp-icon"
          title="delete annotation"
          style={iconBtnStyle}
          onClick={handleDeleteClick}
        >
          <Icon svg={ICON.trash} />
        </button>
      </div>

      {/* Textarea */}
      <textarea
        ref={taRef}
        rows={2}
        value={item.comment}
        placeholder="What should change?  (Shift+Enter to minimize)"
        style={taStyle}
        onInput={(e) => onComment((e.target as HTMLTextAreaElement).value)}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.shiftKey) {
            e.preventDefault();
            onMinimize();
          }
        }}
      />

      {/* Delete confirm overlay */}
      {showConfirm && (
        <div
          class="pp-confirm"
          style="position:absolute;inset:0;background:rgba(18,18,18,.97);border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:10px;z-index:3"
        >
          <div style="font:600 12px system-ui;color:#fff">Delete this annotation?</div>
          <ConfirmRow yesLabel="Delete" onYes={handleConfirmYes} onNo={handleConfirmNo} />
        </div>
      )}
    </div>
  );
}
