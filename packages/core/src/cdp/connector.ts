import { randomUUID } from "node:crypto";
import { CdpConnection } from "./cdp-connection.js";
import { CdpPage } from "./cdp-page.js";
import {
  discoverPageTarget,
  findChrome,
  isCdpUp,
  launchChrome,
  waitForCdp,
} from "./launch-chrome.js";
import { OVERLAY_SOURCE } from "./overlay-script.js";

export interface ConnectOptions {
  cdpUrl: string;
  appUrl: string;
  /** Base URL of this bridge's HTTP server, injected into the overlay so it can call back. */
  bridgeUrl: string;
  /** Path to the Chrome binary; auto-detected when omitted. */
  chromePath?: string;
  /** Chrome user-data-dir when this process launches Chrome. */
  profileDir?: string;
}

export interface Connection {
  page: CdpPage;
  /** The session id injected into the overlay; the overlay uses it for SSE + /send. */
  sessionId: string;
  close(): Promise<void>;
}

export async function connect(opts: ConnectOptions): Promise<Connection> {
  const base = opts.cdpUrl;
  let kill: (() => void) | undefined;

  // Attach to an already-running debug Chrome if present; otherwise launch one.
  if (!(await isCdpUp(base))) {
    const chromePath = opts.chromePath ?? findChrome();
    const port = Number(new URL(base).port || 9222);
    const profileDir = opts.profileDir ?? "/tmp/ff-chrome";
    const child = launchChrome({ chromePath, port, profileDir, appUrl: opts.appUrl });
    kill = () => child.kill();
    // A bad binary path emits an async 'error' (ENOENT); surface it as a clear
    // rejection instead of crashing the process with an unhandled event.
    const launchFailed = new Promise<never>((_, reject) => {
      child.once("error", (e) =>
        reject(new Error(`Failed to launch Chrome (${chromePath}): ${(e as Error).message}`)),
      );
    });
    await Promise.race([waitForCdp(base), launchFailed]);
  }

  const wsUrl = await discoverPageTarget(base, opts.appUrl);
  const cdp = await CdpConnection.attach(wsUrl);
  await cdp.send("Page.enable");
  const page = new CdpPage(cdp);

  const sessionId = randomUUID();
  const preamble = `window.__frontmanFlowConfig = ${JSON.stringify({ bridgeUrl: opts.bridgeUrl, sessionId })};`;
  await page.injectBootstrap(`${preamble}\n${OVERLAY_SOURCE}`);

  return {
    page,
    sessionId,
    close: async () => {
      cdp.close();
      kill?.();
    },
  };
}
