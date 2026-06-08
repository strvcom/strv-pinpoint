---
name: frontman-flow-paste
description: Use when the user's message contains a JSON block with "source": "frontman-flow" (pasted from the frontman-flow browser overlay after clicking Send). Acks the bridge so the browser clears, then applies each annotation's comment to its component.
---

# frontman-flow paste handler

The user clicked **Send** in the frontman-flow overlay and pasted the resulting JSON. It looks like:

```json
{ "source": "frontman-flow", "version": 1, "bridgeUrl": "http://localhost:7331",
  "sessionId": "…", "promptId": "…",
  "items": [{ "badge": 1, "componentName": "Hero", "ancestry": ["Hero","App"],
    "selector": "#hero-heading", "tagName": "H1", "text": "…", "comment": "make it bigger",
    "screenshot": "/abs/path/anno-1.png" }] }
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
3. **For each item**, apply its `comment`:
   - If `screenshot` is a path, **`Read`** it for visual context.
   - Locate the source: grep the `componentName` (`function <name>`, `const <name> =`,
     `export default function <name>`); use `ancestry` (nearest-first) to disambiguate; if
     `componentName` is `null`, fall back to the visible `text` + the CSS `selector`.
   - Make the edit; let the dev server hot-reload.
4. **Summarize** the per-item edits back to the user.

## Notes
- The `comment` is the instruction. An empty comment → ask the user what they want for that item.
- Prose the user typed around the JSON is extra context — honor it.
- This flow is fully decoupled: the ack is a plain HTTP call (no MCP needed). If `curl` fails
  (bridge not running), proceed with the edits and tell the user the browser won't auto-clear.
- A future version may also send a final `status:"done"` ack.
