import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import { buildClipboardJson } from "../annotations/clipboard-payload.js";
import { saveScreenshots } from "../annotations/save-screenshots.js";
import type { BridgePage } from "../cdp/page.js";
import type { ClipboardWriter } from "../clipboard/write.js";
import type { Annotation } from "../types.js";
import type { SessionRegistry } from "./sessions.js";

export interface BridgeServerDeps {
  page: BridgePage;
  sessions: SessionRegistry;
  writeClipboard: ClipboardWriter;
  bridgeUrl: string;
  /** root tmp dir for screenshots, e.g. join(process.cwd(), ".frontman-flow"). */
  tmpRoot: string;
  /** The dev-app URL the bridge connected to (reported by /health). */
  appUrl: string;
  /** The session id injected into the overlay (reported by /health). */
  sessionId: string;
}

function cors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return (chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}) as T;
}

export function startBridgeServer(port: number, deps: BridgeServerDeps): Server {
  const http = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    cors(res);
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      res
        .writeHead(200, { "Content-Type": "application/json" })
        .end(JSON.stringify({ ok: true, appUrl: deps.appUrl, sessionId: deps.sessionId }));
      return;
    }

    const m = url.pathname.match(/^\/session\/([^/]+)\/(events|send|ack)$/);
    if (m) {
      const sessionId = decodeURIComponent(m[1]);
      const action = m[2];

      if (action === "events" && req.method === "GET") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        res.write(": connected\n\n");
        deps.sessions.register(sessionId, res);
        req.on("close", () => deps.sessions.deregister(sessionId));
        return;
      }

      if (action === "send" && req.method === "POST") {
        const body = await readJson<{ items?: Annotation[] }>(req);
        const items = body.items ?? [];
        const promptId = randomUUID();
        const dir = join(deps.tmpRoot, sessionId, promptId);
        const screenshotPaths = await saveScreenshots(deps.page, items, dir);
        const json = buildClipboardJson({
          bridgeUrl: deps.bridgeUrl,
          sessionId,
          promptId,
          items,
          screenshotPaths,
        });
        let ok = true;
        let error: string | undefined;
        try {
          await deps.writeClipboard(json);
        } catch (e) {
          ok = false;
          error = (e as Error).message;
        }
        const imageCount = Object.values(screenshotPaths).filter(Boolean).length;
        res
          .writeHead(200, { "Content-Type": "application/json" })
          .end(JSON.stringify({ ok, promptId, imageCount, error }));
        return;
      }

      if (action === "ack" && req.method === "POST") {
        const body = await readJson<{ promptId?: string; status?: string }>(req);
        const delivered = deps.sessions.pushEvent(sessionId, {
          type: "status",
          promptId: body.promptId,
          status: body.status,
        });
        res
          .writeHead(delivered ? 200 : 404, { "Content-Type": "application/json" })
          .end(JSON.stringify({ delivered }));
        return;
      }
    }

    res.writeHead(404).end("not found");
  });

  http.listen(port, "127.0.0.1");
  return http;
}
