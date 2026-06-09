import type { Mode } from "../state/types.js";
import { ConfirmRow } from "./ConfirmRow.js";
import { Fab } from "./Fab.js";

export interface ToolbarProps {
  fab: { right: number; bottom: number };
  fabOpen: boolean;
  mode: Mode;
  itemCount: number;
  copied: boolean;
  clearOpen: boolean;
  onOrbClick: () => void;
  onSetMode: (m: Mode) => void;
  onClear: () => void;
  onCopy: () => void;
  onOrbPointerDown: (e: PointerEvent) => void;
  onHandlePointerDown: (e: PointerEvent) => void;
  onConfirmClear: () => void;
  onCancelClear: () => void;
}

export function Toolbar({
  fab,
  fabOpen,
  mode,
  itemCount,
  copied,
  clearOpen,
  onOrbClick,
  onSetMode,
  onClear,
  onCopy,
  onOrbPointerDown,
  onHandlePointerDown,
  onConfirmClear,
  onCancelClear,
}: ToolbarProps) {
  // Clamp right/bottom to >= 0 (upper bound requires offsetWidth which needs a ref + layout effect;
  // live verification will catch positioning — noted in task concern.)
  const right = Math.max(0, fab.right);
  const bottom = Math.max(0, fab.bottom);

  const s = itemCount === 1 ? "" : "s";
  const clearPanelStyle =
    "position:absolute;right:0;bottom:48px;background:#222;border:1px solid #555;border-radius:10px;padding:10px;box-shadow:0 10px 28px rgba(0,0,0,.55);font:12px system-ui;color:#fff;display:flex;flex-direction:column;gap:9px;white-space:nowrap";

  return (
    <div style={`position:relative;right:${right}px;bottom:${bottom}px;left:auto;top:auto`}>
      <Fab
        fabOpen={fabOpen}
        mode={mode}
        itemCount={itemCount}
        copied={copied}
        onOrbClick={onOrbClick}
        onSetMode={onSetMode}
        onClear={onClear}
        onCopy={onCopy}
        onOrbPointerDown={onOrbPointerDown}
        onHandlePointerDown={onHandlePointerDown}
      />

      {/* Clear-all confirm panel */}
      {clearOpen && (
        <div style={clearPanelStyle}>
          <div>{`Clear all ${itemCount} annotation${s}?`}</div>
          <ConfirmRow yesLabel="Clear all" onYes={onConfirmClear} onNo={onCancelClear} />
        </div>
      )}
    </div>
  );
}
