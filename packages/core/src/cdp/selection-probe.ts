/**
 * Phase 0 (Task 0.3) deliverable — VALIDATED against Next 16 / React 19.
 * See docs/superpowers/notes/phase0-spike-findings.md.
 *
 * pinpoint does NOT source-map a clicked element to a file. Instead it
 * extracts React-DevTools-style *identity* — the user component name, its
 * ancestry, the CSS selector, tag, visible text, and bounding rect — and lets
 * Claude grep the repo (e.g. `function ClientTest`) to locate the source. This
 * is stack-agnostic and works where fiber→source maps do not (Next Turbopack/RSC).
 *
 * In Phase 1, an injected click-to-select script (built on EXTRACT_SELECTION_FN)
 * stores the latest RawSelection on `window[SELECTION_GLOBAL]`; the bridge reads
 * it via SELECTION_PROBE through CDP.
 */

export interface RawSelection {
  /** A CSS selector that uniquely targets the clicked element. */
  selector: string;
  /** Uppercase tag name, e.g. "H1". */
  tagName: string;
  /** Trimmed visible text (truncated). */
  text: string;
  /** Viewport-relative bounding box. */
  rect: { x: number; y: number; width: number; height: number };
  /** Best-guess user component name to grep for (framework names filtered out), or null. */
  componentName: string | null;
  /** User-ish component ancestry (nearest first), framework components filtered out. */
  ancestry: string[];
}

export const SELECTION_GLOBAL = "__pinpointSelection";

/** Expression evaluated in the page to read the current selection (or null). */
export const SELECTION_PROBE = `window.${SELECTION_GLOBAL} ?? null`;

/**
 * Source of the in-page extractor, as a string for CDP injection. It defines
 * `window.__pinpointExtractSelection(el) -> RawSelection`. Kept as a string
 * (not an imported function) because it must run in the page's React context.
 *
 * Validated: client-component elements expose the user component at the top of
 * the fiber `.return` chain; server components expose it via `_debugStack` frames.
 */
export const EXTRACT_SELECTION_FN = String.raw`
window.__pinpointExtractSelection = function (el) {
  // Framework component names to drop so the user's component surfaces.
  var FRAMEWORK = /^(ClientPageRoot|SegmentViewNode|Outer?LayoutRouter|InnerLayoutRouter|LayoutRouterContext|GlobalLayoutRouterContext|RedirectErrorBoundary|RedirectBoundary|HTTPAccessFallback\w*|DevRootHTTPAccessFallbackBoundary|AppDevOverlay\w*|LoadingBoundary|ErrorBoundary|InnerScrollAndFocusHandler\w*|ScrollAndMaybeFocusHandler|RenderFromTemplateContext|TemplateContext|SegmentStateProvider|NavigationPromisesContext|MetadataBoundary|ViewportBoundary|OutletBoundary|SearchParamsContext|PathnameContext|RootLayout|ServerRoot|AppRouter|HotReload|Router|Head|Fragment|Suspense|__next\w*|_\w*)$/;
  var nameOf = function (t) {
    if (!t || typeof t === 'string') return null;
    return t.displayName || t.name || (t.render && (t.render.displayName || t.render.name)) || null;
  };
  var fiberKey = Object.keys(el).find(function (k) { return k.indexOf('__reactFiber$') === 0; });
  var f = fiberKey ? el[fiberKey] : null;

  // 1) Client-component path: walk the fiber .return chain.
  var ancestry = [];
  var node = f, hops = 0;
  while (node && hops < 80) {
    var nm = nameOf(node.type) || nameOf(node.elementType);
    if (nm && !FRAMEWORK.test(nm) && ancestry[ancestry.length - 1] !== nm) ancestry.push(nm);
    node = node.return; hops++;
  }

  // 2) Server-component path: parse _debugStack frames for "at Name (".
  if (!ancestry.length && f) {
    var stacks = [];
    var n2 = f, h2 = 0;
    while (n2 && h2 < 12) {
      if (n2._debugStack && n2._debugStack.stack) stacks.push(n2._debugStack.stack);
      n2 = n2._debugOwner || n2.return; h2++;
    }
    var seen = {};
    stacks.join('\n').split('\n').forEach(function (line) {
      var m = line.match(/^\s*at\s+([A-Za-z0-9_$]+)\s*\(/);
      if (m && !FRAMEWORK.test(m[1]) && !seen[m[1]]) { seen[m[1]] = 1; ancestry.push(m[1]); }
    });
  }

  // CSS selector: prefer #id, else a short nth-of-type path.
  var selectorFor = function (node) {
    if (node.id) return '#' + CSS.escape(node.id);
    var parts = [], cur = node, depth = 0;
    while (cur && cur.nodeType === 1 && depth < 5) {
      var seg = cur.tagName.toLowerCase();
      if (cur.id) { parts.unshift('#' + CSS.escape(cur.id)); break; }
      var parent = cur.parentElement;
      if (parent) {
        var sibs = Array.prototype.filter.call(parent.children, function (c) { return c.tagName === cur.tagName; });
        if (sibs.length > 1) seg += ':nth-of-type(' + (sibs.indexOf(cur) + 1) + ')';
      }
      parts.unshift(seg); cur = parent; depth++;
    }
    return parts.join(' > ');
  };

  var r = el.getBoundingClientRect();
  return {
    selector: selectorFor(el),
    tagName: el.tagName,
    text: (el.innerText || el.textContent || '').trim().slice(0, 120),
    rect: { x: r.x, y: r.y, width: r.width, height: r.height },
    componentName: ancestry[0] || null,
    ancestry: ancestry.slice(0, 8),
  };
};
`;
