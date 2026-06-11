# vite-plain — pinpoint non-React example

A pure HTML/CSS page (no framework, no JavaScript) served by Vite, used to test pinpoint where
there is **no React fiber** to walk. Picked elements return DOM-only identity: `componentName` is
`null` and `ancestry` is `[]`, while `selector` / `tagName` / `text` / `rect` still populate.

## Run

```bash
pnpm --dir examples/vite-plain dev   # http://localhost:5174 (strictPort)
```

Then, from the pinpoint repo:

```bash
PIN_APP_URL=http://localhost:5174 pinpoint   # or /pinpoint:start (auto-detects Vite on 5174)
```

Pick an element, add a comment, Send — the pasted JSON shows empty React identity with a populated
DOM selector/text/tag. `strictPort` means it fails loudly if 5174 is taken (rather than hopping
ports and breaking URL detection).
