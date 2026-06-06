import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolDeps } from "../tools/deps.js";
import { getSelectionTool } from "../tools/get-selection.js";
import { screenshotTool } from "../tools/screenshot-tool.js";

export function registerTools(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "get_selection",
    {
      description:
        "Return the element currently picked in the frontman-flow overlay: its React component name, ancestry, CSS selector, tag, visible text, and bounding rect. Grep the repo for the component name to find the source. Returns status 'none' if nothing is selected.",
      inputSchema: undefined,
    },
    async () => (await getSelectionTool(deps)) as never,
  );

  server.registerTool(
    "screenshot",
    {
      description:
        "Capture a PNG. target='viewport' (page), 'region' (the last drag-selected area), 'selection' (the picked element), or any CSS selector.",
      inputSchema: { target: z.string().default("viewport") },
    },
    async (args: { target?: string }) =>
      (await screenshotTool(deps, { target: args.target ?? "viewport" })) as never,
  );
}
