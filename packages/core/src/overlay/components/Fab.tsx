import { useEffect, useRef } from "preact/hooks";
import { ICON, Icon } from "../icons.js";
import type { Mode } from "../state/types.js";
import { CopyButton } from "./CopyButton.js";

const Z = 2147483640;

export interface FabProps {
  fabOpen: boolean;
  mode: Mode;
  itemCount: number;
  copied: boolean;
  onOrbClick: () => void;
  onSetMode: (m: Mode) => void;
  onClear: () => void;
  onCopy: () => void;
  onOrbPointerDown: (e: PointerEvent) => void;
  onHandlePointerDown: (e: PointerEvent) => void;
}

function IconButton({
  svg,
  title,
  active,
  onClick,
}: {
  svg: string;
  title: string;
  active?: boolean;
  onClick: (e: MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      class={"pp-icon" + (active ? " pp-active" : "")}
      title={title}
      style="min-width:30px;height:26px;padding:0 8px;border-radius:14px;font:12px system-ui"
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        onClick(e);
      }}
    >
      <Icon svg={svg} />
    </button>
  );
}

export function Fab({
  fabOpen,
  mode,
  itemCount,
  copied,
  onOrbClick,
  onSetMode,
  onClear,
  onCopy,
  onOrbPointerDown,
  onHandlePointerDown,
}: FabProps) {
  const pillRef = useRef<HTMLDivElement | null>(null);
  // Track whether pill is in "display:none" state (after animation out)
  const hiddenRef = useRef(!fabOpen);

  // Animate pill open/close
  useEffect(() => {
    const pill = pillRef.current;
    if (!pill) return;

    if (fabOpen) {
      // Show and animate in
      hiddenRef.current = false;
      pill.style.display = "flex";
      pill.style.opacity = "0";
      pill.style.transform = "scale(.85) translateX(14px)";
      requestAnimationFrame(() => {
        pill.style.opacity = "1";
        pill.style.transform = "none";
      });
    } else {
      // Animate out then hide
      pill.style.opacity = "0";
      pill.style.transform = "scale(.85) translateX(14px)";
      const tid = setTimeout(() => {
        if (pillRef.current && !fabOpen) {
          pillRef.current.style.display = "none";
          hiddenRef.current = true;
        }
      }, 180);
      return () => clearTimeout(tid);
    }
  }, [fabOpen]);

  const containerStyle = `position:fixed;z-index:${Z + 3};display:flex;align-items:center;gap:6px;font:12px system-ui;color:#fff`;

  const pillStyle =
    "align-items:center;gap:4px;background:#1b1b1b;border:1px solid #444;border-radius:22px;padding:5px 8px";

  return (
    <div style={containerStyle}>
      {/* Pill */}
      <div
        class="pp-pill"
        style={pillStyle + (fabOpen ? ";display:flex" : ";display:none")}
        ref={pillRef}
      >
        {/* Grip handle */}
        <span
          class="pp-icon"
          style="cursor:grab;user-select:none"
          onPointerDown={(e: PointerEvent) => onHandlePointerDown(e)}
        >
          <Icon svg={ICON.grip} />
        </span>

        {/* Pick button */}
        <IconButton
          svg={ICON.pick}
          title="Pick an element"
          active={mode === "pick"}
          onClick={() => onSetMode("pick")}
        />

        {/* Screenshot button */}
        <IconButton
          svg={ICON.shot}
          title="Drag a region to screenshot"
          active={mode === "screenshot"}
          onClick={() => onSetMode("screenshot")}
        />

        {/* Clear button */}
        <IconButton svg={ICON.trash} title="Clear all annotations" onClick={() => onClear()} />

        {/* Copy button */}
        <CopyButton itemCount={itemCount} copied={copied} onCopy={onCopy} />
      </div>

      {/* Orb */}
      <button
        type="button"
        style="width:40px;height:40px;border-radius:20px;border:0;background:#2962ff;color:#fff;font:18px system-ui;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.5)"
        title="pinpoint — click to open; drag to move"
        onClick={(e: MouseEvent) => {
          e.stopPropagation();
          onOrbClick();
        }}
        onPointerDown={(e: PointerEvent) => onOrbPointerDown(e)}
      >
        ✦
      </button>
    </div>
  );
}
