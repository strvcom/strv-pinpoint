import { watch } from "node:fs";
import { readFile } from "node:fs/promises";
import type { BridgePage } from "../cdp/page.js";

type Log = (msg: string) => void;

/** Read the built overlay IIFE and re-inject it. Errors (missing/locked file, eval failure)
 *  are logged, never thrown — a dev watch loop must survive a bad build. */
export async function reinjectFromFile(
  page: BridgePage,
  filePath: string,
  preamble: string,
  log: Log = (m) => console.error(m),
): Promise<void> {
  let source: string;
  try {
    source = await readFile(filePath, "utf8");
  } catch (e) {
    log(`pinpoint dev: cannot read overlay bundle ${filePath}: ${(e as Error).message}`);
    return;
  }
  try {
    await page.reinject(preamble, source);
    log("pinpoint dev: overlay re-injected");
  } catch (e) {
    log(`pinpoint dev: re-inject failed: ${(e as Error).message}`);
  }
}

export interface OverlayWatchOptions {
  page: BridgePage;
  filePath: string;
  preamble: string;
  debounceMs?: number;
  log?: Log;
  /** Seam for tests: register a change callback, return an unsubscribe. Defaults to fs.watch. */
  subscribe?: (onChange: () => void) => () => void;
}

/** Watch the built overlay bundle and re-inject (debounced) on every change. Dev-only. */
export function startOverlayWatch(opts: OverlayWatchOptions): { stop: () => void } {
  const { page, filePath, preamble } = opts;
  const debounceMs = opts.debounceMs ?? 80;
  const log = opts.log ?? ((m) => console.error(m));
  const subscribe =
    opts.subscribe ??
    ((onChange) => {
      const w = watch(filePath, { persistent: false }, () => onChange());
      return () => w.close();
    });

  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsubscribe = subscribe(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void reinjectFromFile(page, filePath, preamble, log);
    }, debounceMs);
  });

  log(`pinpoint dev: watching ${filePath} for overlay changes`);
  return {
    stop: () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    },
  };
}
