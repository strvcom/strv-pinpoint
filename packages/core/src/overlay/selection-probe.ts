// Attaches window.__pinpointExtractSelection — ported verbatim from the old
// EXTRACT_SELECTION_FN String.raw block (cdp/selection-probe.ts).
export function installSelectionProbe(): () => void {
  (window as any).__pinpointExtractSelection = function (el: Element) {
    // Framework component names to drop so the user's component surfaces.
    var FRAMEWORK =
      /^(ClientPageRoot|SegmentViewNode|Outer?LayoutRouter|InnerLayoutRouter|LayoutRouterContext|GlobalLayoutRouterContext|RedirectErrorBoundary|RedirectBoundary|HTTPAccessFallback\w*|DevRootHTTPAccessFallbackBoundary|AppDevOverlay\w*|LoadingBoundary|ErrorBoundary|InnerScrollAndFocusHandler\w*|ScrollAndMaybeFocusHandler|RenderFromTemplateContext|TemplateContext|SegmentStateProvider|NavigationPromisesContext|MetadataBoundary|ViewportBoundary|OutletBoundary|SearchParamsContext|PathnameContext|RootLayout|ServerRoot|AppRouter|HotReload|Router|Head|Fragment|Suspense|__next\w*|_\w*)$/;
    var nameOf = function (t: any) {
      if (!t || typeof t === "string") return null;
      return (
        t.displayName || t.name || (t.render && (t.render.displayName || t.render.name)) || null
      );
    };
    var fiberKey = Object.keys(el).find(function (k) {
      return k.indexOf("__reactFiber$") === 0;
    });
    var f = fiberKey ? (el as any)[fiberKey] : null;

    // 1) Client-component path: walk the fiber .return chain.
    var ancestry: string[] = [];
    var node = f,
      hops = 0;
    while (node && hops < 80) {
      var nm = nameOf(node.type) || nameOf(node.elementType);
      if (nm && !FRAMEWORK.test(nm) && ancestry[ancestry.length - 1] !== nm) ancestry.push(nm);
      node = node.return;
      hops++;
    }

    // 2) Server-component path: parse _debugStack frames for "at Name (".
    if (!ancestry.length && f) {
      var stacks: string[] = [];
      var n2 = f,
        h2 = 0;
      while (n2 && h2 < 12) {
        if (n2._debugStack && n2._debugStack.stack) stacks.push(n2._debugStack.stack);
        n2 = n2._debugOwner || n2.return;
        h2++;
      }
      var seen: Record<string, number> = {};
      stacks
        .join("\n")
        .split("\n")
        .forEach(function (line) {
          var m = line.match(/^\s*at\s+([A-Za-z0-9_$]+)\s*\(/);
          if (m && !FRAMEWORK.test(m[1]) && !seen[m[1]]) {
            seen[m[1]] = 1;
            ancestry.push(m[1]);
          }
        });
    }

    // CSS selector: prefer #id, else a short nth-of-type path.
    var selectorFor = function (node: Element) {
      if (node.id) return "#" + CSS.escape(node.id);
      var parts: string[] = [],
        cur: Element | null = node,
        depth = 0;
      while (cur && cur.nodeType === 1 && depth < 5) {
        var seg = cur.tagName.toLowerCase();
        if (cur.id) {
          parts.unshift("#" + CSS.escape(cur.id));
          break;
        }
        var parent: Element | null = cur.parentElement;
        if (parent) {
          var sibs = Array.prototype.filter.call(parent.children, function (c: Element) {
            return c.tagName === cur!.tagName;
          });
          if (sibs.length > 1) seg += ":nth-of-type(" + (sibs.indexOf(cur) + 1) + ")";
        }
        parts.unshift(seg);
        cur = parent;
        depth++;
      }
      return parts.join(" > ");
    };

    var r = el.getBoundingClientRect();
    var react =
      ancestry.length > 0
        ? { componentName: ancestry[0], ancestry: ancestry.slice(0, 8) }
        : null;
    return {
      selector: selectorFor(el),
      tagName: el.tagName,
      text: ((el as any).innerText || el.textContent || "").trim().slice(0, 120),
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      react: react,
    };
  };
  return function disposeSelectionProbe() {
    delete (window as any).__pinpointExtractSelection;
  };
}
