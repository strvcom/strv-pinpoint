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
    version: 1,
    bridgeUrl: args.bridgeUrl,
    sessionId: args.sessionId,
    promptId: args.promptId,
    items: args.items.map((it) => ({
      badge: it.badge,
      componentName: it.componentName,
      ancestry: it.ancestry,
      selector: it.selector,
      tagName: it.tagName,
      text: it.text,
      comment: it.comment,
      screenshot: args.screenshotPaths[it.badge] ?? null,
    })),
  };
  return JSON.stringify(payload, null, 2);
}
