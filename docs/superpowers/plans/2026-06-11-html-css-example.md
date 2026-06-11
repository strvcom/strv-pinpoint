# Plain HTML/CSS Example Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a framework-free `examples/html-css` (pure HTML/CSS served by Vite) plus a gated integration test proving pinpoint's identity extractor degrades gracefully on a non-React page.

**Architecture:** A new pnpm workspace package under `examples/` with a plain `index.html` + `styles.css` (zero JS), served by `vite` on a distinct port (5174, strictPort). A new gated integration test connects over CDP to the running example and asserts the extractor returns `componentName: null` / `ancestry: []` with `selector`/`tagName`/`text`/`rect` populated. No core code changes.

**Tech Stack:** Vite (dev server only, no framework), Vitest (gated integration test), raw CDP via the existing `createCdpDriver`.

**Spec:** `docs/superpowers/specs/2026-06-11-html-css-example-design.md`

**Toolchain note:** the user's `node` may not be on PATH. If any command fails with exit 127, prepend the nvm bin: `export PATH="$(ls -d "$HOME"/.nvm/versions/node/*/bin | tail -1):$PATH"`. Run all commands from the repo root unless stated.

---

## File structure

| File | Responsibility |
|---|---|
| `examples/html-css/package.json` (create) | workspace package; `dev`/`build`/`preview` scripts; single devDep `vite` |
| `examples/html-css/vite.config.ts` (create) | pin `server.port=5174`, `strictPort=true` |
| `examples/html-css/index.html` (create) | the pure-HTML page (variety + deep nesting + identifiers) |
| `examples/html-css/styles.css` (create) | basic layout/typography |
| `examples/html-css/README.md` (create) | what it is, how to run, non-React purpose |
| `packages/core/integration/html-css.integration.test.ts` (create) | gated test asserting non-React extraction |
| `docs/decisions.md` (modify) | one-line decision row |

---

### Task 1: Scaffold the html-css example package

**Files:**
- Create: `examples/html-css/package.json`
- Create: `examples/html-css/vite.config.ts`
- Create: `examples/html-css/index.html`
- Create: `examples/html-css/styles.css`
- Create: `examples/html-css/README.md`

- [ ] **Step 1: Create `examples/html-css/package.json`**

```json
{
  "name": "html-css",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --port 5174 --strictPort",
    "build": "vite build",
    "preview": "vite preview"
  },
  "devDependencies": {
    "vite": "^8.0.12"
  }
}
```

- [ ] **Step 2: Create `examples/html-css/vite.config.ts`**

```ts
import { defineConfig } from "vite";

// Pure HTML/CSS example (no framework). Distinct port so it never collides with
// examples/vite-react (5173); strictPort makes /pinpoint:start URL detection deterministic.
export default defineConfig({
  server: { port: 5174, strictPort: true },
});
```

- [ ] **Step 3: Create `examples/html-css/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="/styles.css" />
    <title>html-css — pinpoint non-React example</title>
  </head>
  <body>
    <header class="site-header">
      <nav aria-label="Primary">
        <a href="#intro">Home</a>
        <a href="#signup">Sign up</a>
        <a href="#gallery">Gallery</a>
      </nav>
    </header>

    <main>
      <section id="intro">
        <h1 id="page-title">Plain HTML &amp; CSS</h1>
        <p>A framework-free page for testing pinpoint where there is no React fiber to walk.</p>
        <button type="button" data-testid="primary-action" aria-label="Get started">
          Get started
        </button>
      </section>

      <section id="signup">
        <h2>Subscribe</h2>
        <form action="#" method="post">
          <label for="email">Email</label>
          <input id="email" name="email" type="email" placeholder="you@example.com" />
          <button type="submit" data-testid="subscribe">Subscribe</button>
        </form>
      </section>

      <section id="gallery">
        <h2>Gallery</h2>
        <img src="/sample.svg" alt="A sample placeholder graphic" width="120" height="80" />
        <ul>
          <li>First item</li>
          <li>Second item</li>
          <li>Third item</li>
        </ul>
      </section>

      <!-- Deep nesting: outermost div.card, innermost button (for screenshot top/bottom tests). -->
      <div class="card">
        <section>
          <article>
            <h2>Pro plan</h2>
            <button type="button" role="button" data-testid="buy" aria-label="Buy pro plan">
              Buy now
            </button>
          </article>
        </section>
      </div>
    </main>

    <footer class="site-footer">
      <p>Built with plain HTML/CSS — <a href="#page-title">back to top</a>.</p>
    </footer>
  </body>
</html>
```

- [ ] **Step 4: Create `examples/html-css/styles.css`**

```css
:root {
  color-scheme: light dark;
  font-family: system-ui, sans-serif;
}

body {
  margin: 0;
  line-height: 1.5;
  color: #1a1a1a;
  background: #fff;
}

.site-header,
.site-footer {
  padding: 12px 24px;
  background: #f3f4f6;
}

nav a {
  margin-right: 16px;
  color: #2962ff;
  text-decoration: none;
}

main {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px;
  display: grid;
  gap: 32px;
}

button {
  padding: 8px 14px;
  border: 0;
  border-radius: 8px;
  background: #2962ff;
  color: #fff;
  font: inherit;
  cursor: pointer;
}

form {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

input {
  padding: 8px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font: inherit;
}

.card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px;
}
```

- [ ] **Step 5: Create `examples/html-css/README.md`**

```markdown
# html-css — pinpoint non-React example

A pure HTML/CSS page (no framework, no JavaScript) served by Vite, used to test pinpoint where
there is **no React fiber** to walk. Picked elements return DOM-only identity: `componentName` is
`null` and `ancestry` is `[]`, while `selector` / `tagName` / `text` / `rect` still populate.

## Run

```bash
pnpm --dir examples/html-css dev   # http://localhost:5174 (strictPort)
```

Then, from the pinpoint repo:

```bash
PIN_APP_URL=http://localhost:5174 pinpoint   # or /pinpoint:start (auto-detects Vite on 5174)
```

Pick an element, add a comment, Send — the pasted JSON shows empty React identity with a populated
DOM selector/text/tag. `strictPort` means it fails loudly if 5174 is taken (rather than hopping
ports and breaking URL detection).
```

- [ ] **Step 6: Add a placeholder image so the `<img>` resolves**

Create `examples/html-css/public/sample.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80">
  <rect width="120" height="80" rx="8" fill="#2962ff" opacity="0.15" />
  <text x="60" y="44" text-anchor="middle" font-family="system-ui" font-size="12" fill="#2962ff">sample</text>
</svg>
```

- [ ] **Step 7: Install + verify the dev server serves on 5174**

Run:
```bash
pnpm install
pnpm --dir examples/html-css dev &
sleep 3
curl -fsS -o /dev/null -m 3 http://localhost:5174 && echo UP
curl -fsS -m 3 http://localhost:5174 | grep -q 'data-testid="primary-action"' && echo "page served"
kill %1 2>/dev/null
```
Expected: `UP` then `page served`. (`pnpm install` may print a lefthook `prepare` warning in a worktree — harmless; the dev server is what matters.)

- [ ] **Step 8: Lint the new non-HTML files (biome covers CSS/TS/JSON, not HTML)**

Run: `pnpm exec biome check --write examples/html-css/styles.css examples/html-css/vite.config.ts examples/html-css/package.json`
Expected: `Checked N files` with fixes applied if any; no errors afterward.

- [ ] **Step 9: Commit**

```bash
git add examples/html-css
git commit -m "feat(examples): plain HTML/CSS example (no framework) on :5174 (TASK-26)"
```

---

### Task 2: Gated integration test — non-React extraction

**Files:**
- Create: `packages/core/integration/html-css.integration.test.ts`

- [ ] **Step 1: Write the test**

Create `packages/core/integration/html-css.integration.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCdpDriver } from "../src/driver/cdp-driver.js";
import type { DriverSession } from "../src/driver/driver.js";
import type { SelectionFound } from "../src/types.js";

/**
 * Proves the identity extractor degrades gracefully on a NON-React page: no fiber → empty React
 * identity, but DOM fields still populate. The extractor runs in-page
 * (window.__pinpointExtractSelection), injected by the CDP driver's connect().
 * Requires examples/html-css running + Chrome on 9222.
 *
 *   pnpm --dir examples/html-css exec vite --port 5174 --strictPort &
 *   <chrome> --headless=new --remote-debugging-port=9222 about:blank &
 *   pnpm --filter @pinpoint/core exec vitest run --config vitest.integration.config.ts html-css
 */
const APP_URL = process.env.PIN_HTMLCSS_URL ?? "http://localhost:5174";
const CDP_URL = process.env.PIN_CDP_URL ?? "http://localhost:9222";

let connection: DriverSession;

beforeAll(async () => {
  const driver = createCdpDriver({ cdpUrl: CDP_URL, profileDir: "/tmp/pp-chrome" });
  connection = await driver.connect({ appUrl: APP_URL, bridgeUrl: "http://localhost:7331" });
});

afterAll(async () => {
  await connection?.close();
});

describe("pinpoint identity extraction on plain HTML/CSS (no framework, integration)", () => {
  it("returns DOM identity with empty React fields for a non-React element", async () => {
    const sel = await connection.page.evaluate<SelectionFound>(
      `window.__pinpointExtractSelection(document.querySelector('[data-testid="primary-action"]'))`,
    );
    expect(sel.componentName).toBeNull();
    expect(sel.ancestry).toEqual([]);
    expect(sel.tagName).toBe("BUTTON");
    expect(sel.selector.length).toBeGreaterThan(0);
    expect(typeof sel.text).toBe("string");
    expect(sel.rect.width).toBeGreaterThan(0);
  });

  it("still resolves a stable selector for a deeply-nested element", async () => {
    const sel = await connection.page.evaluate<SelectionFound>(
      `window.__pinpointExtractSelection(document.querySelector('[data-testid="buy"]'))`,
    );
    expect(sel.componentName).toBeNull();
    expect(sel.ancestry).toEqual([]);
    expect(sel.tagName).toBe("BUTTON");
    expect(sel.selector).toContain(">"); // nested path, not a bare tag
  });
});
```

- [ ] **Step 2: Run it against the live example + Chrome (gated — not in the default suite)**

Run (each in turn; keep the example + Chrome up for the test):
```bash
export PATH="$(ls -d "$HOME"/.nvm/versions/node/*/bin | tail -1):$PATH"
pnpm --dir examples/html-css exec vite --port 5174 --strictPort > /tmp/htmlcss.log 2>&1 &
curl --retry 40 --retry-delay 1 --retry-connrefused -fsS -o /dev/null http://localhost:5174 && echo UP
# launch headless Chrome on 9222 (use the same Chrome path /pinpoint uses, or PIN_CHROME_PATH)
"${PIN_CHROME_PATH:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}" \
  --headless=new --remote-debugging-port=9222 --user-data-dir=/tmp/pp-chrome about:blank > /tmp/chrome.log 2>&1 &
curl --retry 40 --retry-delay 1 --retry-connrefused -fsS -o /dev/null http://localhost:9222/json/version && echo "CDP UP"
pnpm --filter @pinpoint/core exec vitest run --config vitest.integration.config.ts html-css
```
Expected: both tests PASS (2 passed). Then stop the background processes:
```bash
kill %1 %2 2>/dev/null
```
If Chrome isn't at the default macOS path, set `PIN_CHROME_PATH` first.

- [ ] **Step 3: Confirm the default test suite is unaffected (integration stays gated)**

Run: `pnpm test`
Expected: the existing suite passes and does NOT include the integration test (it matches the `**/*.integration.test.ts` exclude in `vitest.config.ts`).

- [ ] **Step 4: Commit**

```bash
git add packages/core/integration/html-css.integration.test.ts
git commit -m "test(integration): non-React extraction on the html-css example (TASK-26)"
```

---

### Task 3: Full validation + manual loop check + decisions row

**Files:**
- Modify: `docs/decisions.md`

- [ ] **Step 1: Run the full gate**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all pass. `pnpm build` runs `vite build` for the new example too (it has a `build` script) — it should produce `examples/html-css/dist` (gitignored) without error.

- [ ] **Step 2: Manual loop verification**

Start the example and the bridge, then exercise the loop:
```bash
pnpm --dir examples/html-css dev &                    # http://localhost:5174
PIN_APP_URL=http://localhost:5174 pinpoint &          # bridge launches Chrome + injects overlay
curl --retry 30 --retry-delay 1 --retry-connrefused -fsS http://localhost:7331/health
```
In the opened Chrome: Pick the "Get started" button, add a comment, click Send. Confirm the
clipboard JSON has the item with `selector`/`tagName: "BUTTON"`/`text: "Get started"` populated and
`componentName: null` / `ancestry: []`. Stop the background processes when done.

- [ ] **Step 3: Record the decision**

Append one row to `docs/decisions.md` (match the existing table format):

> `2026-06-11` — Added `examples/html-css` (TASK-26): a pure HTML/CSS page (no framework, no JS) served by Vite on `:5174` (`strictPort`) to exercise pinpoint's non-React path. No core change — the extractor already returns `componentName:null`/`ancestry:[]` with DOM `selector`/`tagName`/`text`/`rect` when no fiber is present; a gated `html-css.integration.test.ts` proves and guards it. Doubles as a fixture for TASK-27/28 (deep nesting + `data-testid`/`aria-label`/`role` present).

- [ ] **Step 4: Commit**

```bash
git add docs/decisions.md
git commit -m "docs(decisions): record html-css non-React example (TASK-26)"
```

---

## Self-review notes

- **Spec coverage:** package + Vite-on-5174 + strictPort (Task 1); pure HTML/CSS page with variety, deep nesting, and identifiers (Task 1, index.html); gated integration test asserting non-React extraction (Task 2); manual-verification + docs (Task 3). No core changes (spec non-goal honored). Not added to default `vitest run` (Task 2 Step 3 confirms the exclude holds).
- **Type consistency:** the test casts `evaluate<SelectionFound>` and reads `componentName`/`ancestry`/`selector`/`tagName`/`text`/`rect` — exactly the fields the extractor returns and `SelectionFound` declares.
- **No placeholders:** every file's full contents are inlined; every run step has explicit commands + expected output.
