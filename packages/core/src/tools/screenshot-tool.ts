import type { ScreenshotTarget } from "../types.js";
import type { ToolDeps, ToolResult } from "./deps.js";
import { capture } from "../screenshot/capture.js";
import { readSelection } from "../selection/read-selection.js";
import { readRegion } from "../selection/read-region.js";

export interface ScreenshotArgs {
  target: string;
}

function parseTarget(target: string): ScreenshotTarget {
  if (target === "viewport") return { kind: "viewport" };
  if (target === "region") return { kind: "region" };
  if (target === "selection") return { kind: "selection" };
  return { kind: "selector", selector: target };
}

export async function screenshotTool(deps: ToolDeps, args: ScreenshotArgs): Promise<ToolResult> {
  const { page } = deps;
  const screenshotTarget = parseTarget(args.target);

  const captureDeps = {
    rectOfSelection: async () => {
      const s = await readSelection(page);
      return s.status === "selected" ? s.rect : null;
    },
    rectOfRegion: () => readRegion(page),
  };

  const image = await capture(page, screenshotTarget, captureDeps);

  if (image) {
    return {
      content: [{ type: "image", data: image.base64, mimeType: image.mimeType }],
    };
  }

  // Null result — return a clear error message based on target kind
  let message: string;
  switch (screenshotTarget.kind) {
    case "region":
      message = "No region captured — drag a region in the overlay first.";
      break;
    case "selection":
      message = "No element selected — use Pick first.";
      break;
    case "selector":
      message = "No element matched the selector.";
      break;
    default:
      message = "Screenshot failed.";
  }

  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}
