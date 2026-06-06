import type { BridgePage } from "../cdp/page.js";

export interface ToolDeps {
  page: BridgePage;
}

export interface ToolResult {
  content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }>;
  isError?: boolean;
}
