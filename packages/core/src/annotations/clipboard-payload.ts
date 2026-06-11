import type { Annotation } from "../types.js";

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
      selected: it.selected,
      comment: it.comment,
      screenshot: args.screenshotPaths[it.badge] ?? null,
    })),
  };
  return JSON.stringify(payload, null, 2);
}
