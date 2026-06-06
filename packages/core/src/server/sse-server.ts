import { createServer, type Server } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { ToolDeps } from "../tools/deps.js";
import { registerTools } from "./register-tools.js";

export function startSseServer(port: number, deps: ToolDeps): Server {
  const mcp = new McpServer({ name: "frontman-flow", version: "0.0.0" });
  registerTools(mcp, deps);

  const transports = new Map<string, SSEServerTransport>();

  const http = createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/sse") {
      const t = new SSEServerTransport("/messages", res);
      transports.set(t.sessionId, t);
      res.on("close", () => transports.delete(t.sessionId));
      await mcp.connect(t);
      return;
    }
    if (req.method === "POST" && req.url?.startsWith("/messages")) {
      const sessionId =
        new URL(req.url, "http://localhost").searchParams.get("sessionId") ??
        "";
      const t = transports.get(sessionId);
      if (!t) {
        res.writeHead(400).end("unknown sessionId");
        return;
      }
      await t.handlePostMessage(req, res);
      return;
    }
    res.writeHead(404).end("not found");
  });

  http.listen(port);
  return http;
}
