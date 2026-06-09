import type { Kind } from "../state/types.js";

export function Badge({
  n,
  kind,
  onToggle,
  onPressStart,
  nodeRef,
}: {
  n: number;
  kind: Kind;
  onToggle: () => void;
  onPressStart: () => void;
  nodeRef: (el: HTMLDivElement | null) => void;
}) {
  const bg = kind === "screenshot" ? "#a855f7" : "#22c55e";
  const style = `position:absolute;pointer-events:auto;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:9px;background:${bg};color:#06210f;font:bold 11px system-ui`;

  return (
    <div
      class="pp-badge"
      style={style}
      ref={nodeRef}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onPointerDown={() => {
        onPressStart();
      }}
    >
      {n}
    </div>
  );
}
