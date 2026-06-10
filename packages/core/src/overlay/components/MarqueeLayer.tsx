import type { Rect } from "../state/types.js";

const Z = 2147483640;

export function MarqueeLayer({ rect }: { rect: Rect | null }) {
  const baseStyle = `position:fixed;pointer-events:none;z-index:${Z};border:2px dashed #4f8cff;background:rgba(79,140,255,.12);`;
  const posStyle = rect
    ? `display:block;left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px`
    : "display:none";

  return <div style={baseStyle + posStyle} />;
}
