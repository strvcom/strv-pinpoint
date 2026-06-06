import { EXTRACT_SELECTION_FN, SELECTION_GLOBAL } from "./selection-probe.js";

export const REGION_GLOBAL = "__frontmanFlowRegion";
export const REGION_PROBE = `window.${REGION_GLOBAL} ?? null`;
export const ANNOTATIONS_GLOBAL = "__frontmanFlowAnnotations";
export const ANNOTATIONS_PROBE = `window.${ANNOTATIONS_GLOBAL} ?? null`;

/**
 * Injected overlay (v2). Pick appends an annotation per click; a fixed panel shows a card per
 * annotation (comment textarea + 📷 toggle + ✕). "Send to Claude" marks the batch ready. State on
 * window.__frontmanFlowAnnotations = { batchId, ready, items }. window.__frontmanFlowSelection keeps
 * the most-recent pick (get_selection unchanged); window.__frontmanFlowRegion keeps the drag region.
 * DOM glue — verified by integration/manual, not unit tests.
 */
export const OVERLAY_SOURCE = `
${EXTRACT_SELECTION_FN}
(() => {
  if (window.__frontmanFlowOverlayInstalled) return;
  window.__frontmanFlowOverlayInstalled = true;
  var Z = 2147483640;
  var state = { mode: null, items: [], ready: false, batchId: 0, nextId: 1 };
  var sendBtn = null;

  var hover = document.createElement('div');
  var marquee = document.createElement('div');
  [hover, marquee].forEach(function (d) { d.style.cssText = 'position:fixed;pointer-events:none;z-index:' + Z + ';border:2px solid #4f8cff;background:rgba(79,140,255,.12);display:none'; document.documentElement.appendChild(d); });
  marquee.style.borderStyle = 'dashed';
  var place = function (d, r) { d.style.left = r.x + 'px'; d.style.top = r.y + 'px'; d.style.width = r.width + 'px'; d.style.height = r.height + 'px'; };
  var show = function (d, r) { d.style.display = 'block'; place(d, r); };

  var marks = document.createElement('div');
  marks.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:' + Z + ';display:block';
  document.documentElement.appendChild(marks);

  var panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;top:12px;right:12px;width:260px;max-height:80vh;overflow:auto;z-index:' + (Z + 2) + ';font:12px system-ui;color:#fff;display:none';
  document.documentElement.appendChild(panel);

  var bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:' + (Z + 3) + ';display:flex;gap:6px;font:12px system-ui';
  var btn = function (label, fn) { var b = document.createElement('button'); b.textContent = label; b.style.cssText = 'padding:4px 8px;border-radius:6px;border:1px solid #555;background:#1b1b1b;color:#fff;cursor:pointer'; b.onclick = function (e) { e.stopPropagation(); fn(); }; return b; };
  bar.appendChild(btn('Pick', function () { setMode('pick'); }));
  bar.appendChild(btn('Region', function () { setMode('region'); }));
  bar.appendChild(btn('Off', function () { setMode(null); }));
  document.documentElement.appendChild(bar);

  function setMode(m) { state.mode = m; hover.style.display = 'none'; if (m !== 'region') marquee.style.display = 'none'; document.body.style.cursor = m ? 'crosshair' : ''; }

  function serialize() {
    return { batchId: state.batchId, ready: state.ready, items: state.items.map(function (it, i) {
      return { id: it.id, badge: i + 1, componentName: it.componentName, ancestry: it.ancestry, selector: it.selector, tagName: it.tagName, text: it.text, rect: it.rect, comment: it.comment, wantScreenshot: it.wantScreenshot };
    }) };
  }
  function sync() {
    var snap = serialize();
    window['${ANNOTATIONS_GLOBAL}'] = snap;
    window['${SELECTION_GLOBAL}'] = snap.items.length ? snap.items[snap.items.length - 1] : null;
  }
  function setDirty() { if (state.ready) { state.ready = false; if (sendBtn) { sendBtn.textContent = 'Send to Claude'; sendBtn.style.background = '#1b1b1b'; } } sync(); }

  function renderMarks() {
    marks.innerHTML = '';
    state.items.forEach(function (it, i) {
      var o = document.createElement('div'); o.style.cssText = 'position:absolute;border:2px solid #22c55e;background:rgba(34,197,94,.10)'; place(o, it.rect); marks.appendChild(o);
      var b = document.createElement('div'); b.textContent = String(i + 1); b.style.cssText = 'position:absolute;background:#22c55e;color:#06210f;font:bold 11px system-ui;min-width:16px;height:16px;line-height:16px;border-radius:8px;text-align:center;left:' + it.rect.x + 'px;top:' + Math.max(0, it.rect.y - 16) + 'px'; marks.appendChild(b);
    });
  }
  function renderPanel() {
    panel.innerHTML = ''; sendBtn = null;
    panel.style.display = state.items.length ? 'block' : 'none';
    state.items.forEach(function (it, i) {
      var card = document.createElement('div'); card.style.cssText = 'background:#1b1b1b;border:1px solid #333;border-radius:8px;padding:8px;margin-bottom:8px';
      var head = document.createElement('div'); head.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px';
      var badge = document.createElement('span'); badge.textContent = String(i + 1); badge.style.cssText = 'background:#22c55e;color:#06210f;font:bold 11px system-ui;min-width:16px;height:16px;line-height:16px;border-radius:8px;text-align:center';
      var label = document.createElement('span'); label.textContent = it.componentName || it.tagName; label.style.cssText = 'flex:1;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      var cam = document.createElement('button'); cam.textContent = '📷'; cam.title = 'include screenshot'; cam.style.cssText = 'cursor:pointer;border:1px solid #555;border-radius:4px;background:' + (it.wantScreenshot ? '#335' : '#1b1b1b');
      cam.onclick = function (e) { e.stopPropagation(); it.wantScreenshot = !it.wantScreenshot; cam.style.background = it.wantScreenshot ? '#335' : '#1b1b1b'; setDirty(); };
      var rm = document.createElement('button'); rm.textContent = '✕'; rm.style.cssText = 'cursor:pointer;border:1px solid #555;border-radius:4px;background:#1b1b1b;color:#fff';
      rm.onclick = function (e) { e.stopPropagation(); state.items.splice(i, 1); renderAll(); setDirty(); };
      head.appendChild(badge); head.appendChild(label); head.appendChild(cam); head.appendChild(rm);
      var ta = document.createElement('textarea'); ta.value = it.comment; ta.placeholder = 'What should change?'; ta.rows = 2;
      ta.style.cssText = 'width:100%;box-sizing:border-box;background:#0e0e0e;color:#fff;border:1px solid #333;border-radius:4px;font:12px system-ui;resize:vertical';
      ta.oninput = function () { it.comment = ta.value; setDirty(); };
      ta.onmousedown = function (e) { e.stopPropagation(); };
      card.appendChild(head); card.appendChild(ta); panel.appendChild(card);
    });
    if (state.items.length) {
      var actions = document.createElement('div'); actions.style.cssText = 'display:flex;gap:6px';
      sendBtn = document.createElement('button'); sendBtn.textContent = state.ready ? 'Sent ✓' : 'Send to Claude';
      sendBtn.style.cssText = 'flex:1;padding:6px;border-radius:6px;border:1px solid #2a6;color:#fff;cursor:pointer;background:' + (state.ready ? '#143' : '#1b1b1b');
      sendBtn.onclick = function (e) { e.stopPropagation(); state.ready = true; state.batchId++; sync(); sendBtn.textContent = 'Sent ✓'; sendBtn.style.background = '#143'; };
      var clr = document.createElement('button'); clr.textContent = 'Clear'; clr.style.cssText = 'padding:6px;border-radius:6px;border:1px solid #555;background:#1b1b1b;color:#fff;cursor:pointer';
      clr.onclick = function (e) { e.stopPropagation(); state.items = []; state.ready = false; renderAll(); sync(); };
      actions.appendChild(sendBtn); actions.appendChild(clr); panel.appendChild(actions);
    }
  }
  function renderAll() { renderMarks(); renderPanel(); }

  document.addEventListener('mousemove', function (e) { if (state.mode !== 'pick') return; var el = document.elementFromPoint(e.clientX, e.clientY); if (!el || panel.contains(el) || bar.contains(el)) return; show(hover, el.getBoundingClientRect()); }, true);
  document.addEventListener('click', function (e) { if (state.mode !== 'pick') return; if (panel.contains(e.target) || bar.contains(e.target)) return; e.preventDefault(); e.stopPropagation(); var el = document.elementFromPoint(e.clientX, e.clientY); if (!el) return; var data = window.__frontmanFlowExtractSelection(el); data.id = 'a' + (state.nextId++); data.comment = ''; data.wantScreenshot = false; state.items.push(data); state.ready = false; renderAll(); sync(); }, true);

  var drag = null;
  var rectOf = function (a, e) { return { x: Math.min(a.x, e.clientX), y: Math.min(a.y, e.clientY), width: Math.abs(e.clientX - a.x), height: Math.abs(e.clientY - a.y) }; };
  document.addEventListener('mousedown', function (e) { if (state.mode !== 'region' || panel.contains(e.target) || bar.contains(e.target)) return; e.preventDefault(); drag = { x: e.clientX, y: e.clientY }; }, true);
  document.addEventListener('mousemove', function (e) { if (state.mode !== 'region' || !drag) return; show(marquee, rectOf(drag, e)); }, true);
  document.addEventListener('mouseup', function (e) { if (state.mode !== 'region' || !drag) return; var r = rectOf(drag, e); drag = null; if (r.width > 4 && r.height > 4) window['${REGION_GLOBAL}'] = r; }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMode(null); }, true);

  sync();
})();
`;
