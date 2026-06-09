import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";

const KNOWN_CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

export function findChrome(
  deps: { env?: Record<string, string | undefined>; exists?: (p: string) => boolean } = {},
): string {
  const env = deps.env ?? process.env;
  const exists = deps.exists ?? existsSync;
  if (env.PIN_CHROME_PATH) return env.PIN_CHROME_PATH;
  const found = KNOWN_CHROME_PATHS.find((p) => exists(p));
  if (!found)
    throw new Error("Chrome not found. Set PIN_CHROME_PATH to the Chrome/Chromium binary.");
  return found;
}

export function launchChrome(opts: {
  chromePath: string;
  port: number;
  profileDir: string;
  appUrl: string;
}): ChildProcess {
  return spawn(
    opts.chromePath,
    [
      `--remote-debugging-port=${opts.port}`,
      `--user-data-dir=${opts.profileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      opts.appUrl,
    ],
    { stdio: "ignore", detached: false },
  );
}

export async function isCdpUp(
  baseUrl: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<boolean> {
  try {
    const r = await fetchImpl(`${baseUrl}/json/version`);
    return r.ok;
  } catch {
    return false;
  }
}

export async function waitForCdp(
  baseUrl: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? 15000;
  const intervalMs = opts.intervalMs ?? 150;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isCdpUp(baseUrl, fetchImpl)) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Chrome CDP did not become ready at ${baseUrl} within ${timeoutMs}ms`);
}

interface CdpTarget {
  type: string;
  url?: string;
  webSocketDebuggerUrl?: string;
}

export async function discoverPageTarget(
  baseUrl: string,
  appUrl: string,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<string> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const res = await fetchImpl(`${baseUrl}/json`);
  const targets = (await res.json()) as CdpTarget[];
  const pages = targets.filter((t) => t.type === "page");
  const match = pages.find((t) => t.url?.startsWith(appUrl)) ?? pages[0];
  if (!match?.webSocketDebuggerUrl) throw new Error(`No page target found at ${baseUrl}/json`);
  return match.webSocketDebuggerUrl;
}
