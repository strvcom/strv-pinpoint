import { createMiddleware } from '@frontman-ai/nextjs';
import { NextRequest, NextResponse } from 'next/server';

// host only builds the browser client's connect URL; the middleware itself does
// not connect to it. frontman-flow drives the browser via CDP and never uses the
// frontman WebSocket, so this host need not be reachable.
const frontman = createMiddleware({
  host: 'frontman.local:4000', // local-dev placeholder; intentionally not running
});

export function proxy(req: NextRequest): NextResponse | Promise<NextResponse> {
  if (
    req.nextUrl.pathname === '/frontman' ||
    req.nextUrl.pathname.startsWith('/frontman/')
  ) {
    return (frontman(req) as Promise<NextResponse>) || NextResponse.next();
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/frontman', '/frontman/:path*'],
};
