import type { Item } from "../state/types.js";
import { Badge } from "./Badge.js";
import { Card } from "./Card.js";

const Z = 2147483640;

export interface MarksLayerProps {
  items: Item[];
  open: Record<string, boolean>;
  fabOpen: boolean;
  confirming: boolean;
  /** Live ref used by Card's focus-out guard (CRITICAL #1 / TASK-18 #3). */
  pressingBadgeRef: { current: string | null };
  registerNode: (id: string, part: "box" | "badge" | "card" | "hb", el: HTMLElement | null) => void;
  onBadgeToggle: (id: string) => void;
  onBadgePressStart: (id: string) => void;
  onComment: (id: string, v: string) => void;
  onToggleScreenshot: (id: string) => void;
  onMinimize: (id: string) => void;
  onDelete: (id: string) => void;
  onSave: (id: string) => void;
  onSetConfirming: (b: boolean) => void;
  onDragDelta: (id: string, dx: number, dy: number) => void;
}

export function MarksLayer({
  items,
  open,
  fabOpen,
  confirming,
  pressingBadgeRef,
  registerNode,
  onBadgeToggle,
  onBadgePressStart,
  onComment,
  onToggleScreenshot,
  onMinimize,
  onDelete,
  onSave,
  onSetConfirming,
  onDragDelta,
}: MarksLayerProps) {
  const rootStyle =
    `position:fixed;inset:0;pointer-events:none;z-index:${Z};` +
    (fabOpen ? "display:block" : "display:none");

  return (
    <div style={rootStyle}>
      {items.map((item, i) => {
        const color = item.kind === "screenshot" ? "#a855f7" : "#22c55e";
        const boxStyle = `position:absolute;border:2px solid ${color};background:rgba(34,197,94,.10);left:0;top:0;width:0;height:0`;

        return (
          <div key={item.id}>
            {/* Outline box — positioned by the positioning hook later */}
            <div
              style={boxStyle}
              ref={(el) => registerNode(item.id, "box", el as HTMLElement | null)}
            />

            {/* Badge */}
            <Badge
              n={i + 1}
              kind={item.kind}
              onToggle={() => onBadgeToggle(item.id)}
              onPressStart={() => onBadgePressStart(item.id)}
              nodeRef={(el) => registerNode(item.id, "badge", el as HTMLElement | null)}
            />

            {/* Card — only when open */}
            {open[item.id] && (
              <Card
                item={item}
                n={i + 1}
                confirming={confirming}
                pressingBadgeRef={pressingBadgeRef}
                onComment={(v) => onComment(item.id, v)}
                onToggleScreenshot={() => onToggleScreenshot(item.id)}
                onMinimize={() => onMinimize(item.id)}
                onDelete={() => onDelete(item.id)}
                onSave={() => onSave(item.id)}
                onSetConfirming={onSetConfirming}
                onDragDelta={(dx, dy) => onDragDelta(item.id, dx, dy)}
                nodeRef={(el) => registerNode(item.id, "card", el as HTMLElement | null)}
                hbRef={(el) => registerNode(item.id, "hb", el as HTMLElement | null)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
