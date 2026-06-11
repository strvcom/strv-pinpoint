---
name: pinpoint-paste
description: Use when the user's message contains a JSON block with "source": "pinpoint" (pasted from the pinpoint browser overlay after clicking Send). Acks the bridge so the browser clears, then applies each annotation's comment to its component.
---

# pinpoint paste handler

The user clicked **Send** in the pinpoint overlay and pasted the resulting JSON. It looks like:

```json
{ "source": "pinpoint", "version": 2, "bridgeUrl": "http://localhost:7331",
  "sessionId": "…", "promptId": "…",
  "items": [{ "badge": 1, "kind": "element",
    "selected": [{ "selector": "#hero-heading", "tagName": "H1", "text": "…",
      "identifiers": { "id": "hero-heading" },
      "react": { "componentName": "Hero", "ancestry": ["Hero","App"],
        "source": { "file": "/src/App.tsx", "line": 7 } } }],
    "comment": "make it bigger", "screenshot": "/abs/path/anno-1.png" }] }
```

## Steps

1. **Parse** the JSON block from the message (ignore any prose the user added around it).
2. **Ack immediately** — this clears the browser the moment you start working. Run:
   ```bash
   curl -fsS -X POST "<bridgeUrl>/session/<sessionId>/ack" \
     -H 'content-type: application/json' \
     -d '{"promptId":"<promptId>","status":"running"}'
   ```
   (substitute `bridgeUrl`, `sessionId`, `promptId` from the JSON.)
3. **For each item**, apply its `comment` using its `selected[]` entries:
   - If `screenshot` is a path, **`Read`** it for visual context.
   - For each entry in `selected`, locate the source — cheapest signal first:
     - **`react.source` (`{ file, line }`)** when present → open that `file` at `line` directly; it's the element's exact source location.
     - else **`identifiers`** (`id`, `testId`/`data-testid`, `aria-label`, `role`, `name`) → grep these; they pin source fastest.
     - else grep **`react.componentName`** (`function <name>`, `const <name> =`, `export default function <name>`), disambiguating with `react.ancestry` (nearest-first).
     - else fall back to the entry's visible `text` + the CSS `selector`.
   - A `kind: "element"` item has exactly one selection (the picked element). A `kind: "screenshot"` item's `selected[]` holds the outermost container(s) plus the innermost leaf elements the region covered (any number of entries) — use them together to find the right component(s).
   - Make the edit; let the dev server hot-reload.
4. **Summarize** the per-item edits back to the user.

## Notes
- The `comment` is the instruction. An empty comment → ask the user what they want for that item.
- Prose the user typed around the JSON is extra context — honor it.
- This flow is fully decoupled: the ack is a plain HTTP call (no MCP needed). If `curl` fails
  (bridge not running), proceed with the edits and tell the user the browser won't auto-clear.
- A screenshot item may have an empty `selected: []` (region dragged over blank space) — in that case rely on the `screenshot` image (and any prose the user added) to locate the change.
- A future version may also send a final `status:"done"` ack.
