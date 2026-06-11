import { useEffect, useRef } from "preact/hooks";
import { ICON, Icon } from "../icons.js";
import type { Mode } from "../state/types.js";
import { CopyButton } from "./CopyButton.js";

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

// Tool-toggle geometry (px). The two tool buttons are fixed, equal width so the sliding
// indicator's position is derived from constants — no layout measurement (happy-dom has none).
const TOOL_W = 34;
const TOOL_GAP = 4;

function IconButton({
  svg,
  title,
  active,
  width,
  onClick,
}: {
  svg: string;
  title: string;
  active?: boolean;
  /** Fixed width for tool toggles; renders above the sliding indicator (z-index:1). */
  width?: number;
  onClick: (e: MouseEvent) => void;
}) {
  const style =
    width != null
      ? `width:${width}px;height:26px;padding:0;border-radius:14px;position:relative;z-index:1;font:12px system-ui`
      : "min-width:30px;height:26px;padding:0 8px;border-radius:14px;font:12px system-ui";
  return (
    <button
      type="button"
      class={"pp-icon" + (active ? " pp-active" : "")}
      title={title}
      style={style}
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

  // Sliding tool indicator: position follows the last *selected* tool so deselecting
  // floats the pill out in place (rather than snapping back to the Pick slot).
  const lastToolRef = useRef<Mode>(mode);
  if (mode) lastToolRef.current = mode;
  const indicatorX = lastToolRef.current === "screenshot" ? TOOL_W + TOOL_GAP : 0;
  const toolSelected = mode !== null;
  const indicatorStyle =
    `position:absolute;left:0;top:0;width:${TOOL_W}px;height:26px;border-radius:14px;` +
    `background:#2962ff;z-index:0;pointer-events:none;` +
    `transform:translateX(${indicatorX}px) scale(${toolSelected ? 1 : 0.6});` +
    `opacity:${toolSelected ? 1 : 0}`;

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

  // position:relative — the Toolbar wrapper owns the fixed bottom-right anchor + z-index.
  const containerStyle = `position:relative;display:flex;align-items:center;gap:6px;font:12px system-ui;color:#fff`;

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

        {/* Tool toggles (Pick / Screenshot) with the sliding indicator behind them */}
        <div class="pp-tools" style={`position:relative;display:flex;gap:${TOOL_GAP}px`}>
          <div class="pp-tool-indicator" style={indicatorStyle} />

          {/* Pick button */}
          <IconButton
            svg={ICON.pick}
            title="Pick an element"
            active={mode === "pick"}
            width={TOOL_W}
            onClick={() => onSetMode("pick")}
          />

          {/* Screenshot button */}
          <IconButton
            svg={ICON.shot}
            title="Drag a region to screenshot"
            active={mode === "screenshot"}
            width={TOOL_W}
            onClick={() => onSetMode("screenshot")}
          />
        </div>

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
