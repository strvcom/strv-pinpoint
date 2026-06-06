import { type Browser, chromium, type Page } from "playwright";
import { OVERLAY_SOURCE } from "./overlay-script.js";
import { PlaywrightPage } from "./playwright-page.js";

export interface ConnectOptions {
  cdpUrl: string;
  appUrl: string;
}

export interface Connection {
  browser: Browser;
  page: PlaywrightPage;
  close(): Promise<void>;
}

export async function connect(opts: ConnectOptions): Promise<Connection> {
  const browser = await chromium.connectOverCDP(opts.cdpUrl);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const existing: Page | undefined = context.pages().find((p) => p.url().startsWith(opts.appUrl));
  const page = existing ?? (await context.newPage());
  if (!existing) await page.goto(opts.appUrl);
  const bridgePage = new PlaywrightPage(page);
  await bridgePage.injectBootstrap(OVERLAY_SOURCE);
  return {
    browser,
    page: bridgePage,
    close: async () => {
      await browser.close();
    },
  };
}
