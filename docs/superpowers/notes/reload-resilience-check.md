# Overlay page-reload resilience — manual verification

Confirms the injected overlay survives a full page reload in the dev flow (TASK-25).
The overlay re-injects via `Page.addScriptToEvaluateOnNewDocument` (registered in
`CdpPage.injectBootstrap`, re-registered on each `reinject`), which Chrome re-runs on
every new document — including reloads. This was the unverified claim from TASK-22;
it is verified below.

## Why this isn't a unit test
The behavior lives entirely in Chrome's CDP runtime (does an on-new-document script
fire on a real navigation?), so it can only be proven against a live browser — the
same reason the loop test is a gated integration test, not a unit test.

## The check (headless, ~5s, no human gesture)
A standalone CDP probe that drives the **real bridge code** and reloads via the
bridge's own connection. The discriminator is a `__sentinel` global set *after*
inject: a real reload wipes it, so `sentinel:false` proves a genuine new document
(not a stale execution context being read back).

```js
// reload-check.mjs — run with: node reload-check.mjs   (needs Node 22 global WebSocket/fetch)
import { spawn } from "node:child_process";
const CORE = "<repo>/packages/core/dist";              // after `pnpm --filter @pinpoint/core build`
const { createCdpDriver, pinpointPreamble } = await import(`${CORE}/driver/cdp-driver.js`);
const { startOverlayWatch } = await import(`${CORE}/dev/overlay-watch.js`);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9338, APP = "http://localhost:5181/";     // a running Vite dev server
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const child = spawn(CHROME, [`--remote-debugging-port=${PORT}`, "--user-data-dir=/tmp/pp-reload-check",
  "--headless=new", "--no-first-run", "--no-default-browser-check", APP], { stdio: "ignore" });
for (let i = 0; i < 120; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch {} await sleep(150); }
await sleep(1200);
const driver = createCdpDriver({ cdpUrl: `http://localhost:${PORT}`, profileDir: "/tmp/pp-reload-check" });
const s = await driver.connect({ appUrl: APP, bridgeUrl: "http://localhost:7332" });
startOverlayWatch({ page: s.page, filePath: `${CORE}/overlay.iife.js`,
  preamble: pinpointPreamble("http://localhost:7332", s.sessionId) });
const CHECK = "JSON.stringify({cfg:!!window.__pinpointConfig,host:!!document.querySelector('[data-pinpoint]'),sentinel:window.__sentinel??false})";
await s.page.evaluate("window.__sentinel=true;0");
console.log("before reload:", await s.page.evaluate(CHECK));
await s.page.evaluate("location.reload();0").catch(()=>{});
await sleep(1800);
console.log("after  reload:", await s.page.evaluate(CHECK));   // EXPECT cfg:true, host:true, sentinel:false
await s.close(); child.kill();
```

PASS = `after reload: {"cfg":true,"host":true,"sentinel":false}`
(overlay re-injected on a confirmed-fresh document).

## Headful / human variant
Run the normal `pinpoint:start` dev loop against a headful Chrome, press Cmd+R, and
confirm the bottom-right orb reappears with no file edit. (Equivalent to the script
above; verified manually for TASK-25.)
