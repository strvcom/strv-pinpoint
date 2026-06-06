import { readSelection } from "../selection/read-selection.js";
import type { ToolDeps, ToolResult } from "./deps.js";

export async function getSelectionTool(deps: ToolDeps): Promise<ToolResult> {
  const selection = await readSelection(deps.page);
  return {
    content: [{ type: "text", text: JSON.stringify(selection, null, 2) }],
  };
}
