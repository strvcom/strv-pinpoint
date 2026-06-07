import type { ServerResponse } from "node:http";

export interface SseEvent {
  type: string;
  [key: string]: unknown;
}

export class SessionRegistry {
  private readonly sessions = new Map<string, ServerResponse>();

  register(id: string, res: ServerResponse): void {
    this.sessions.set(id, res);
  }
  deregister(id: string): void {
    this.sessions.delete(id);
  }
  has(id: string): boolean {
    return this.sessions.has(id);
  }
  pushEvent(id: string, event: SseEvent): boolean {
    const res = this.sessions.get(id);
    if (!res) return false;
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    return true;
  }
}
