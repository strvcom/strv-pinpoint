# Phase 0: frontman Next.js middleware + endpoint contract

Extracted from `.reference/frontman` (Apache-2.0 libs only).
All values are copied verbatim from the cited source files.

---

## 1. Package name + install command

**Published npm package name:** `@frontman-ai/nextjs`
**Version (at time of recon):** `0.6.5`

Source: `.reference/frontman/libs/frontman-nextjs/package.json` → `"name"` + `"version"` fields.

**CLI install (recommended):**
```bash
npx @frontman-ai/nextjs install
# or with custom server host:
npx @frontman-ai/nextjs install --server frontman.company.com
```

**Manual install:**
```bash
npm install @frontman-ai/nextjs
```

Source: `.reference/frontman/libs/frontman-nextjs/README.md` §Installation.

**CLI binary names** (from `"bin"` in package.json):
- `frontman-nextjs` → `dist/cli.js`
- `nextjs` → `dist/cli.js`

---

## 2. Middleware install snippet for `examples/nextjs`

The README documents two variants depending on Next.js version.

### Next.js 15 — `middleware.ts` (project root)

```typescript
import { createMiddleware } from '@frontman-ai/nextjs';
import { NextRequest, NextResponse } from 'next/server';

const frontman = createMiddleware({
  host: 'api.frontman.sh', // or 'frontman.local:4000' for local development
});

export async function middleware(req: NextRequest) {
  const response = await frontman(req);
  if (response) return response;
  return NextResponse.next();
}

export const config = {
  matcher: ['/frontman', '/frontman/:path*'],
};
```

Source: `.reference/frontman/libs/frontman-nextjs/README.md` §Manual Setup > Next.js 15.

### Next.js 16+ — `proxy.ts` (project root)

```typescript
import { createMiddleware } from '@frontman-ai/nextjs';
import { NextRequest, NextResponse } from 'next/server';

const frontman = createMiddleware({
  host: 'api.frontman.sh', // or 'frontman.local:4000' for local development
});

export function proxy(req: NextRequest): NextResponse | Promise<NextResponse> {
  if (req.nextUrl.pathname === '/frontman' || req.nextUrl.pathname.startsWith('/frontman/')) {
    return frontman(req) || NextResponse.next();
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/frontman', '/frontman/:path*'],
};
```

Source: `.reference/frontman/libs/frontman-nextjs/README.md` §Manual Setup > Next.js 16+.

### `host` option — local vs cloud

| Value | Meaning |
|---|---|
| `api.frontman.sh` | Cloud/production Frontman server (default) |
| `frontman.local:4000` | Local Frontman Elixir server (self-hosted) |

The `host` option is passed to the **client JS bundle** via a `?host=` query param so the browser UI can open a WebSocket (`wss://<host>/socket`). The middleware itself does not connect to the Frontman server.

For pinpoint, the middleware does NOT need to point at any Frontman server — it intercepts `/frontman/*` requests locally. The `host` option in the original package is irrelevant to pinpoint's use case; pinpoint replaces the cloud-side role.

**Note:** The `host` field is required by the original `createMiddleware` API (no default in the TypeScript shape — the default kicks in only if the field is absent from the JS object, via ReScript's optional field handling). The `FRONTMAN_HOST` env var overrides it at runtime.

Sources:
- `.reference/frontman/libs/frontman-nextjs/README.md` §Understanding the `host` Option
- `.reference/frontman/libs/frontman-nextjs/src/FrontmanNextjs__Config.res` — `defaultHost` logic + `normalizeHost`
- `.reference/frontman/libs/frontman-core/src/FrontmanCore__Hosts.res` — canonical host constants

---

## 3. The four route paths

All routes are prefixed by `basePath` (default: `"frontman"`).

| Route | Method | Handler | Notes |
|---|---|---|---|
| `/frontman/tools` | GET | `handleGetTools` | Returns JSON list of available MCP tools |
| `/frontman/tools/call` | POST | `handleToolCall` | Executes a tool; response is SSE stream |
| `/frontman/resolve-source-location` | POST | `handleResolveSourceLocation` | Maps a DOM element to source file + location |
| `/frontman` (any suffix path ending in `/frontman`) | GET | `UIShell.serveWithEntrypoint` | Serves the Frontman overlay UI as HTML |

Source: `.reference/frontman/libs/frontman-core/src/FrontmanCore__Middleware.res` — route match arms in `createMiddleware` (lines 168–184):

```rescript
let toolsPath = basePath ++ "/tools"
let toolsCallPath = basePath ++ "/tools/call"
let resolveSourceLocationPath = basePath ++ "/resolve-source-location"
```

The UI route is a **suffix match** — any path ending in `/frontman` (e.g. `/products/123/frontman`) serves the UI with the page underneath as the "preview". GET only; other methods fall through.

CORS preflight (`OPTIONS`) is handled for all frontman routes (line 165).

---

## 4. `resolve-source-location` request and response shapes

Defined as Sury `@schema` types in
`.reference/frontman/libs/frontman-core/src/FrontmanCore__RequestHandlers.res` (lines 25–39).

### Request — `POST /frontman/resolve-source-location`

```typescript
// JSON body
{
  componentName: string,  // React component name (e.g. "Button")
  file: string,           // Source-mapped file path
  line: int,              // 1-based line number
  column: int,            // 0-based column number
}
```

ReScript source (verbatim):
```rescript
@schema
type resolveSourceLocationRequest = {
  componentName: string,
  file: string,
  line: int,
  column: int,
}
```

### Response (success 200)

```typescript
// JSON body
{
  componentName: string,  // React component name (resolved)
  file: string,           // Relative path from sourceRoot (project/monorepo root)
  line: int,              // Resolved line number
  column: int,            // Resolved column number
}
```

ReScript source (verbatim):
```rescript
@schema
type resolveSourceLocationResponse = {
  componentName: string,
  file: string,
  line: int,
  column: int,
}
```

**Important:** The `file` field in the response is converted to a **relative path** from `sourceRoot` (via `PathContext.toRelativePath`) — NOT an absolute filesystem path. This is so an AI agent can use the path directly with MCP file tools.

Source: `.reference/frontman/libs/frontman-core/src/FrontmanCore__RequestHandlers.res` lines 175–191.

### Error response (400 / 500)

```typescript
{
  error: string,
  details?: string,  // optional, present on 500
}
```

ReScript source (verbatim):
```rescript
@schema
type errorResponse = {
  error: string,
  @s.matches(S.option(S.string))
  details: option<string>,
}
```

---

## 5. Additional notes for Task 1.4 (HTTP client)

- `GET /frontman/tools` → `Content-Type: application/json`; response schema is `Relay.toolsResponseSchema` (MCP tool list format). Source: RequestHandlers.res line 59.
- `POST /frontman/tools/call` → SSE stream (`CoreSSE.headers()`). The stream emits either a `result` event or an `error` event, then closes. Source: RequestHandlers.res lines 108–137.
- All frontman API routes have CORS headers applied via `CORS.withCors`. Source: FrontmanCore__Middleware.res lines 169–180.
- `basePath` defaults to `"frontman"`. Configurable via `createMiddleware({ basePath: "..." })`. Source: FrontmanNextjs__Config.res line 82.
- `projectRoot` defaults to `process.cwd()` (via `PROJECT_ROOT` or `PWD` env var fallback). `sourceRoot` defaults to `projectRoot`. Source: FrontmanNextjs__Config.res lines 86–96.
