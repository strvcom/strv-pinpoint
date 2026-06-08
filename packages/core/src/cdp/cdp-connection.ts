type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

interface MinimalWebSocket {
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  send(data: string): void;
  close(): void;
}
type WebSocketCtor = new (url: string) => MinimalWebSocket;

/** A tiny JSON-RPC-over-WebSocket client for the Chrome DevTools Protocol. */
export class CdpConnection {
  private id = 0;
  private readonly pending = new Map<number, Pending>();

  private constructor(private readonly ws: MinimalWebSocket) {
    ws.onmessage = (e) => this.onMessage(e);
  }

  static attach(
    wsUrl: string,
    opts: { WebSocketImpl?: WebSocketCtor } = {},
  ): Promise<CdpConnection> {
    const Impl = opts.WebSocketImpl ?? (globalThis.WebSocket as unknown as WebSocketCtor);
    return new Promise((resolve, reject) => {
      const ws = new Impl(wsUrl);
      ws.onopen = () => resolve(new CdpConnection(ws));
      ws.onerror = () => reject(new Error(`CDP WebSocket failed to connect: ${wsUrl}`));
    });
  }

  send<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = ++this.id;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close(): void {
    this.ws.close();
  }

  private onMessage(e: { data: unknown }): void {
    const raw = typeof e.data === "string" ? e.data : String(e.data);
    const msg = JSON.parse(raw) as { id?: number; result?: unknown; error?: { message: string } };
    if (typeof msg.id !== "number") return; // event, not a response
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error.message));
    else p.resolve(msg.result);
  }
}
