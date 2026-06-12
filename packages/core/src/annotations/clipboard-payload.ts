import type { Annotation, Selection } from "../types.js";

/**
 * Drop `rect` from a selection. The overlay's selection probe attaches a runtime bounding `rect`
 * to each selection (kept internally for positioning/screenshots) that the Selection type doesn't
 * even declare; the pasted JSON doesn't need pixel coordinates — Claude greps source by identity.
 */
function stripRect(sel: Selection): Selection {
  const { rect: _rect, ...rest } = sel as Selection & { rect?: unknown };
  return rest as Selection;
}

export interface ClipboardPayloadArgs {
  bridgeUrl: string;
  sessionId: string;
  promptId: string;
  items: Annotation[];
  /** badge -> saved screenshot path (or null). */
  screenshotPaths: Record<number, string | null>;
}

export function buildClipboardJson(args: ClipboardPayloadArgs): string {
  const payload = {
    source: "pinpoint",
    version: 2,
    bridgeUrl: args.bridgeUrl,
    sessionId: args.sessionId,
    promptId: args.promptId,
    items: args.items.map((it) => ({
      badge: it.badge,
      kind: it.kind,
      selected: it.selected.map(stripRect),
      comment: it.comment,
      screenshot: args.screenshotPaths[it.badge] ?? null,
    })),
  };
  return JSON.stringify(payload, null, 2);
}
