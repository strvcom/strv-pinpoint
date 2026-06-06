import { EXTRACT_SELECTION_FN, SELECTION_GLOBAL } from "./selection-probe.js";

/** Window global holding the last drag-selected region rect ({x,y,width,height}). */
export const REGION_GLOBAL = "__frontmanFlowRegion";

/** Expression evaluated in the page to read the current region (or null). */
export const REGION_PROBE = `window.${REGION_GLOBAL} ?? null`;

/**
 * Source for the injected overlay. Injected via BridgePage.injectBootstrap so it
 * runs on the current page and every future navigation. Provides two gestures:
 *  - Pick:   hover highlight + click -> run the fiber-identity extractor, store on
 *            window[SELECTION_GLOBAL], draw a persistent outline + component badge.
 *  - Region: click-drag marquee -> store the arbitrary viewport rect on window[REGION_GLOBAL].
 * A tiny fixed toolbar toggles Pick / Region / Off; Escape exits. Dependency-free.
 *
 * DOM/in-page glue — verified by the integration test, not unit tests.
 */
export const OVERLAY_SOURCE = `
${EXTRACT_SELECTION_FN}
(() => {
  if (window.__frontmanFlowOverlayInstalled) return;
  window.__frontmanFlowOverlayInstalled = true;
  var Z = 2147483640;
  var mode = null; // 'pick' | 'region' | null
  var hi = document.createElement('div');
  var sel = document.createElement('div');
  var marquee = document.createElement('div');
  var badge = document.createElement('div');
  [hi, sel, marquee].forEach(function (d) {
    d.style.cssText = 'position:fixed;pointer-events:none;z-index:' + Z + ';border:2px solid #4f8cff;background:rgba(79,140,255,.12);display:none';
    document.documentElement.appendChild(d);
  });
  sel.style.borderColor = '#22c55e'; sel.style.background = 'rgba(34,197,94,.10)';
  marquee.style.borderStyle = 'dashed';
  badge.style.cssText = 'position:fixed;z-index:' + (Z + 1) + ';background:#111;color:#fff;font:12px/1.4 system-ui;padding:2px 6px;border-radius:4px;display:none;pointer-events:none';
  document.documentElement.appendChild(badge);
  var box = function (d, r) { d.style.display = 'block'; d.style.left = r.x + 'px'; d.style.top = r.y + 'px'; d.style.width = r.width + 'px'; d.style.height = r.height + 'px'; };

  var bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:' + (Z + 2) + ';display:flex;gap:6px;font:12px system-ui';
  var mk = function (label, m) {
    var b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'padding:4px 8px;border-radius:6px;border:1px solid #555;background:#1b1b1b;color:#fff;cursor:pointer';
    b.onclick = function (e) { e.stopPropagation(); setMode(m); };
    return b;
  };
  bar.appendChild(mk('Pick', 'pick'));
  bar.appendChild(mk('Region', 'region'));
  bar.appendChild(mk('Off', null));
  document.documentElement.appendChild(bar);

  function setMode(m) {
    mode = m;
    hi.style.display = 'none';
    if (m !== 'region') marquee.style.display = 'none';
    document.body.style.cursor = m ? 'crosshair' : '';
  }

  document.addEventListener('mousemove', function (e) {
    if (mode !== 'pick') return;
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || bar.contains(el)) return;
    box(hi, el.getBoundingClientRect());
  }, true);

  document.addEventListener('click', function (e) {
    if (mode !== 'pick') return;
    if (bar.contains(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return;
    var data = window.__frontmanFlowExtractSelection(el);
    window['${SELECTION_GLOBAL}'] = data;
    box(sel, data.rect);
    badge.style.display = 'block';
    badge.style.left = data.rect.x + 'px';
    badge.style.top = Math.max(0, data.rect.y - 20) + 'px';
    badge.textContent = data.componentName || data.tagName;
  }, true);

  var drag = null;
  var rectOf = function (a, e) { return { x: Math.min(a.x, e.clientX), y: Math.min(a.y, e.clientY), width: Math.abs(e.clientX - a.x), height: Math.abs(e.clientY - a.y) }; };
  document.addEventListener('mousedown', function (e) {
    if (mode !== 'region' || bar.contains(e.target)) return;
    e.preventDefault();
    drag = { x: e.clientX, y: e.clientY };
  }, true);
  document.addEventListener('mousemove', function (e) {
    if (mode !== 'region' || !drag) return;
    box(marquee, rectOf(drag, e));
  }, true);
  document.addEventListener('mouseup', function (e) {
    if (mode !== 'region' || !drag) return;
    var r = rectOf(drag, e);
    drag = null;
    if (r.width > 4 && r.height > 4) window['${REGION_GLOBAL}'] = r;
  }, true);

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMode(null); }, true);
})();
`;
