import { readAnnotations } from "../annotations/read-annotations.js";
import type { Annotation } from "../types.js";
import type { ToolDeps, ToolResult } from "./deps.js";

const NONE =
  "No submitted annotations — pick elements in the overlay, add a comment to each, then click Send to Claude.";

export async function getAnnotationsTool(deps: ToolDeps): Promise<ToolResult> {
  const batch = await readAnnotations(deps.page);
  if (!batch) return { content: [{ type: "text", text: NONE }] };

  const content: ToolResult["content"] = [
    { type: "text", text: `${batch.items.length} annotation(s) submitted:` },
  ];
  for (const a of batch.items) {
    content.push({ type: "text", text: annotationText(a) });
    if (a.wantScreenshot) {
      const png =
        (await deps.page.screenshotElement(a.selector)) ?? (await deps.page.screenshotClip(a.rect));
      if (png) content.push({ type: "image", data: png.toString("base64"), mimeType: "image/png" });
    }
  }
  return { content };
}

function annotationText(a: Annotation): string {
  return JSON.stringify(
    {
      badge: a.badge,
      componentName: a.componentName,
      ancestry: a.ancestry,
      selector: a.selector,
      tagName: a.tagName,
      text: a.text,
      comment: a.comment,
    },
    null,
    2,
  );
}
