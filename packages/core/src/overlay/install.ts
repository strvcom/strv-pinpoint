import { badgeClickAction } from "./card-toggle.js";
import { ANNOTATIONS_GLOBAL, REGION_GLOBAL, SELECTION_GLOBAL } from "./globals.js";
import { renderSendButton } from "./send-button.js";
import { createOverlayState } from "./state.js";

// The overlay UI installer — ported verbatim from the inline IIFE that used to
// live in cdp/overlay-script.ts. No behavior change.
export function installOverlay(): void {
  if ((window as any).__pinpointOverlayInstalled || !document.body) return;
  (window as any).__pinpointOverlayInstalled = true;
  var Z = 2147483640;
  var ICON = {
    pick: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M5 3l15 7.4-6.1 1.8L11 19z"/></svg>',
    shot: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M7 3H4v3M17 3h3v3M7 21H4v-3M17 21h3v-3"/></svg>',
    trash:
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/></svg>',
    camera:
      '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 8h4l2-2h6l2 2h4v11H3z"/><circle cx="12" cy="13" r="3"/></svg>',
    min: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 18h12"/></svg>',
    grip: '<svg viewBox="0 0 24 24" width="12" height="16" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
  };
  var state = createOverlayState();
  var els: Record<string, any> = {}; // id -> { box, badge, card, closing }

  var style = document.createElement("style");
  style.setAttribute("data-pinpoint", "1");
  style.textContent =
    "[data-pinpoint] .pp-icon{background:transparent;border:0;color:#cfd3dc;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:color .15s ease,background .15s ease,transform .15s ease}[data-pinpoint] .pp-icon:hover{color:#fff;transform:scale(1.12)}[data-pinpoint] .pp-icon.pp-active{color:#fff;background:#2962ff}[data-pinpoint] .pp-pill{transform-origin:right center;transition:transform .18s ease,opacity .18s ease}[data-pinpoint] .pp-card{transform-origin:top left;transition:transform .15s ease,opacity .15s ease}[data-pinpoint] .pp-badge{transition:transform .16s ease,opacity .16s ease}";
  document.documentElement.appendChild(style);

  function mkLayer(border: string, bg: string) {
    var d = document.createElement("div");
    d.setAttribute("data-pinpoint", "1");
    d.style.cssText =
      "position:fixed;pointer-events:none;z-index:" +
      Z +
      ";border:" +
      border +
      ";background:" +
      bg +
      ";display:none";
    document.documentElement.appendChild(d);
    return d;
  }
  var hover = mkLayer("2px solid #4f8cff", "rgba(79,140,255,.12)");
  var marquee = mkLayer("2px dashed #4f8cff", "rgba(79,140,255,.12)");
  var marks = document.createElement("div");
  marks.setAttribute("data-pinpoint", "1");
  marks.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:" + Z + ";display:none";
  document.documentElement.appendChild(marks);
  function box(d: HTMLElement, r: { x: number; y: number; width: number; height: number }) {
    d.style.display = "block";
    d.style.left = r.x + "px";
    d.style.top = r.y + "px";
    d.style.width = r.width + "px";
    d.style.height = r.height + "px";
  }
  function insideMarks(el: any) {
    return marks.contains(el);
  }

  var fab = document.createElement("div");
  fab.setAttribute("data-pinpoint", "1");
  fab.style.cssText =
    "position:fixed;z-index:" +
    (Z + 3) +
    ";display:flex;align-items:center;gap:6px;font:12px system-ui;color:#fff";
  document.documentElement.appendChild(fab);
  var pill = document.createElement("div");
  pill.className = "pp-pill";
  pill.style.cssText =
    "display:none;align-items:center;gap:4px;background:#1b1b1b;border:1px solid #444;border-radius:22px;padding:5px 8px";
  var handle = document.createElement("span");
  handle.className = "pp-icon";
  handle.innerHTML = ICON.grip;
  handle.style.cssText = "cursor:grab;user-select:none";
  pill.appendChild(handle);
  function tbtn(html: string, title: string, fn: () => void) {
    var b = document.createElement("button");
    b.className = "pp-icon";
    b.innerHTML = html;
    b.title = title;
    b.style.cssText =
      "min-width:30px;height:26px;padding:0 8px;border-radius:14px;font:12px system-ui";
    b.onclick = function (e) {
      e.stopPropagation();
      fn();
    };
    return b;
  }
  var bPick = tbtn(ICON.pick, "Pick an element", function () {
    setMode("pick");
  });
  var bShot = tbtn(ICON.shot, "Drag a region to screenshot", function () {
    setMode("screenshot");
  });
  var bClear = tbtn(ICON.trash, "Clear all annotations", function () {
    clearAnnotations();
  });
  var bSend = document.createElement("button");
  bSend.title = "Copy annotations to clipboard (then Cmd+Shift+V into Claude)";
  bSend.style.cssText =
    "height:26px;padding:0 12px;border-radius:14px;border:0;background:#0a7d34;color:#fff;font:600 12px system-ui;cursor:pointer";
  renderSendButton(bSend, { ready: false });
  bSend.onclick = function (e) {
    e.stopPropagation();
    doSend();
  };
  [bPick, bShot, bClear, bSend].forEach(function (b) {
    pill.appendChild(b);
  });
  var orb = document.createElement("button");
  orb.textContent = "✦";
  orb.title = "pinpoint — click to open; drag to move";
  orb.style.cssText =
    "width:40px;height:40px;border-radius:20px;border:0;background:#2962ff;color:#fff;font:18px system-ui;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.5)";
  fab.appendChild(pill);
  fab.appendChild(orb);
  // Anchor by right/bottom so the orb stays put when the pill collapses.
  function setFabPos() {
    var w = fab.offsetWidth || 40,
      h = fab.offsetHeight || 40;
    var rr = Math.min(Math.max(0, state.fab.right), window.innerWidth - w);
    var bb = Math.min(Math.max(0, state.fab.bottom), window.innerHeight - h);
    fab.style.left = "auto";
    fab.style.top = "auto";
    fab.style.right = rr + "px";
    fab.style.bottom = bb + "px";
  }
  setFabPos();
  var dragMoved = false;
  orb.onclick = function (e) {
    e.stopPropagation();
    if (dragMoved) {
      dragMoved = false;
      return;
    }
    state.fabOpen = !state.fabOpen;
    if (state.fabOpen) {
      pill.style.display = "flex";
      pill.style.opacity = "0";
      pill.style.transform = "scale(.85) translateX(14px)";
      requestAnimationFrame(function () {
        pill.style.opacity = "1";
        pill.style.transform = "none";
      });
      setMode("pick");
    } else {
      pill.style.opacity = "0";
      pill.style.transform = "scale(.85) translateX(14px)";
      setMode(null);
      setTimeout(function () {
        if (!state.fabOpen) pill.style.display = "none";
      }, 180);
    }
    setFabPos();
    draw();
  };
  var fdrag: any = null;
  function startDrag(e: PointerEvent) {
    fdrag = { px: e.clientX, py: e.clientY, right: state.fab.right, bottom: state.fab.bottom };
    dragMoved = false;
    e.preventDefault();
  }
  handle.addEventListener("pointerdown", startDrag);
  orb.addEventListener("pointerdown", startDrag);
  document.addEventListener(
    "pointermove",
    function (e) {
      if (!fdrag) return;
      if (Math.abs(e.clientX - fdrag.px) + Math.abs(e.clientY - fdrag.py) > 3) dragMoved = true;
      state.fab.right = fdrag.right - (e.clientX - fdrag.px);
      state.fab.bottom = fdrag.bottom - (e.clientY - fdrag.py);
      setFabPos();
    },
    true,
  );
  document.addEventListener(
    "pointerup",
    function () {
      fdrag = null;
    },
    true,
  );
  function setMode(m: string | null) {
    state.mode = m;
    hover.style.display = "none";
    if (m !== "screenshot") marquee.style.display = "none";
    document.body.style.cursor = m ? "crosshair" : "";
    bPick.classList.toggle("pp-active", m === "pick");
    bShot.classList.toggle("pp-active", m === "screenshot");
  }

  function vrect(it: any) {
    if (it.kind === "screenshot") {
      return {
        x: it.pageX - window.scrollX,
        y: it.pageY - window.scrollY,
        width: it.rect.width,
        height: it.rect.height,
      };
    }
    var el = it.selector ? document.querySelector(it.selector) : null;
    if (el) return el.getBoundingClientRect();
    return it.rect;
  }
  function serialize() {
    return {
      batchId: state.batchId,
      ready: state.ready,
      items: state.items.map(function (it: any, i: number) {
        var r = vrect(it);
        return {
          id: it.id,
          badge: i + 1,
          componentName: it.componentName,
          ancestry: it.ancestry,
          selector: it.selector,
          tagName: it.tagName,
          text: it.text,
          rect: { x: r.x, y: r.y, width: r.width, height: r.height },
          comment: it.comment,
          wantScreenshot: it.wantScreenshot,
        };
      }),
    };
  }
  function sync() {
    var snap = serialize();
    (window as any)[ANNOTATIONS_GLOBAL] = snap;
    (window as any)[SELECTION_GLOBAL] = snap.items.length
      ? snap.items[snap.items.length - 1]
      : null;
  }
  function setDirty() {
    if (state.ready) {
      state.ready = false;
      renderSendButton(bSend, { ready: state.ready });
    }
    sync();
  }

  function removeNodes(refs: any) {
    if (!refs) return;
    [refs.card, refs.badge, refs.box].forEach(function (n: any) {
      if (n && n.parentNode) n.parentNode.removeChild(n);
    });
  }

  // Confirm row used by both the card-delete overlay and the clear panel.
  function confirmRow(yesLabel: string, onYes: () => void, onNo: () => void) {
    var row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;justify-content:flex-end";
    var no = document.createElement("button");
    no.textContent = "Cancel";
    no.style.cssText =
      "border:0;border-radius:6px;padding:5px 12px;background:#3a3a3a;color:#fff;cursor:pointer;font:12px system-ui";
    no.onclick = function (e) {
      e.stopPropagation();
      onNo();
    };
    var yes = document.createElement("button");
    yes.textContent = yesLabel;
    yes.style.cssText =
      "border:0;border-radius:6px;padding:5px 12px;background:#b91c1c;color:#fff;cursor:pointer;font:600 12px system-ui";
    yes.onclick = function (e) {
      e.stopPropagation();
      onYes();
    };
    row.appendChild(no);
    row.appendChild(yes);
    return row;
  }

  var clearPanel: HTMLElement | null = null;
  function clearAnnotations() {
    if (!state.items.length || clearPanel) return;
    var p = document.createElement("div");
    p.setAttribute("data-pinpoint", "1");
    p.style.cssText =
      "position:absolute;right:0;bottom:48px;background:#222;border:1px solid #555;border-radius:10px;padding:10px;box-shadow:0 10px 28px rgba(0,0,0,.55);font:12px system-ui;color:#fff;display:flex;flex-direction:column;gap:9px;white-space:nowrap";
    var msg = document.createElement("div");
    msg.textContent =
      "Clear all " + state.items.length + " annotation" + (state.items.length > 1 ? "s" : "") + "?";
    function close() {
      if (p.parentNode) p.parentNode.removeChild(p);
      clearPanel = null;
    }
    p.appendChild(msg);
    p.appendChild(
      confirmRow(
        "Clear all",
        function () {
          close();
          Object.keys(els).forEach(function (id) {
            removeNodes(els[id]);
          });
          els = {};
          state.items = [];
          state.open = {};
          state.ready = false;
          renderSendButton(bSend, { ready: false });
          draw();
          sync();
        },
        function () {
          close();
        },
      ),
    );
    fab.appendChild(p);
    clearPanel = p;
  }

  function closeCard(it: any) {
    var refs = els[it.id];
    state.open[it.id] = false;
    if (refs && refs.card && !refs.closing) {
      var card = refs.card;
      refs.closing = true;
      card.style.transformOrigin = "top left";
      card.style.transform = "scale(.3)";
      card.style.opacity = "0";
      setTimeout(function () {
        if (card.parentNode) card.parentNode.removeChild(card);
        refs.card = null;
        refs.closing = false;
      }, 160);
    }
  }

  function deleteAnnotation(it: any) {
    var refs = els[it.id];
    var idx = state.items.indexOf(it);
    if (idx >= 0) state.items.splice(idx, 1);
    delete state.open[it.id];
    delete els[it.id];
    if (refs) {
      [refs.card, refs.badge, refs.box].forEach(function (n: any) {
        if (n) {
          n.style.transition = "transform .16s ease,opacity .16s ease";
          n.style.opacity = "0";
          n.style.transform =
            n === refs.card ? "scale(.3)" : (n.style.transform || "") + " scale(.4)";
        }
      });
      setTimeout(function () {
        removeNodes(refs);
        positionAll();
      }, 160);
    }
    setDirty();
  }

  function createNodes(it: any) {
    var color = it.kind === "screenshot" ? "#a855f7" : "#22c55e";
    var bx = document.createElement("div");
    bx.setAttribute("data-pinpoint", "1");
    bx.style.cssText =
      "position:absolute;border:2px solid " +
      color +
      ";background:rgba(34,197,94,.10);left:0;top:0;width:0;height:0";
    marks.appendChild(bx);
    var badge = document.createElement("div");
    badge.setAttribute("data-pinpoint", "1");
    badge.className = "pp-badge";
    badge.style.cssText =
      "position:absolute;pointer-events:auto;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:9px;background:" +
      color +
      ";color:#06210f;font:bold 11px system-ui;left:0;top:0";
    badge.onclick = function (e) {
      e.stopPropagation();
      if (badgeClickAction(state, it.id) === "close") closeCard(it);
      else {
        state.open[it.id] = true;
        draw();
      }
    };
    marks.appendChild(badge);
    els[it.id] = { box: bx, badge: badge, card: null, closing: false };
  }

  function buildCard(it: any) {
    var refs = els[it.id];
    if (!refs) return;
    var color = it.kind === "screenshot" ? "#a855f7" : "#22c55e";
    var card: any = document.createElement("div");
    card.setAttribute("data-pinpoint", "1");
    card.className = "pp-card";
    card.style.cssText =
      "position:absolute;pointer-events:auto;width:208px;background:#1b1b1b;border:1px solid #2a6;border-radius:8px;padding:8px;box-shadow:0 6px 20px rgba(0,0,0,.4);z-index:" +
      (Z + 6) +
      ";left:0;top:0;opacity:0;transform:scale(.85)";
    var head = document.createElement("div");
    head.style.cssText =
      "display:flex;align-items:center;gap:6px;color:#fff;font:600 12px system-ui;margin-bottom:6px;cursor:grab";
    var hb = document.createElement("span");
    hb.style.cssText =
      "display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:16px;height:16px;border-radius:8px;background:" +
      color +
      ";color:#06210f;font:bold 10px system-ui";
    card.__hb = hb;
    var lbl = document.createElement("span");
    lbl.textContent = it.componentName || it.tagName || "screenshot";
    lbl.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
    var cam = document.createElement("button");
    cam.className = "pp-icon" + (it.wantScreenshot ? " pp-active" : "");
    cam.innerHTML = ICON.camera;
    cam.title = "include a screenshot of this";
    cam.style.cssText = "width:24px;height:24px;border-radius:6px";
    cam.onclick = function (e) {
      e.stopPropagation();
      it.wantScreenshot = !it.wantScreenshot;
      cam.classList.toggle("pp-active", it.wantScreenshot);
      setDirty();
    };
    var mini = document.createElement("button");
    mini.className = "pp-icon";
    mini.innerHTML = ICON.min;
    mini.title = "minimize";
    mini.style.cssText = "width:24px;height:24px;border-radius:6px";
    mini.onclick = function (e) {
      e.stopPropagation();
      closeCard(it);
    };
    var del = document.createElement("button");
    del.className = "pp-icon";
    del.innerHTML = ICON.trash;
    del.title = "delete annotation";
    del.style.cssText = "width:24px;height:24px;border-radius:6px";
    del.onclick = function (e) {
      e.stopPropagation();
      if (card.querySelector(".pp-confirm")) return;
      state.confirming = true;
      var ov = document.createElement("div");
      ov.className = "pp-confirm";
      ov.setAttribute("data-pinpoint", "1");
      ov.style.cssText =
        "position:absolute;inset:0;background:rgba(18,18,18,.97);border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:10px;z-index:3";
      var msg = document.createElement("div");
      msg.textContent = "Delete this annotation?";
      msg.style.cssText = "font:600 12px system-ui;color:#fff";
      ov.appendChild(msg);
      ov.appendChild(
        confirmRow(
          "Delete",
          function () {
            state.confirming = false;
            deleteAnnotation(it);
          },
          function () {
            state.confirming = false;
            if (ov.parentNode) ov.parentNode.removeChild(ov);
            try {
              ta.focus({ preventScroll: true });
            } catch (_) {}
          },
        ),
      );
      card.appendChild(ov);
    };
    head.appendChild(hb);
    head.appendChild(lbl);
    head.appendChild(cam);
    head.appendChild(mini);
    head.appendChild(del);
    head.addEventListener("pointerdown", function (e: PointerEvent) {
      if ((e.target as any).closest && (e.target as any).closest("button")) return;
      e.preventDefault();
      e.stopPropagation();
      var sx = e.clientX,
        sy = e.clientY;
      var base = it.cardOffset || { x: 0, y: 0 };
      var ox = base.x,
        oy = base.y;
      function mv(ev: PointerEvent) {
        it.cardOffset = { x: ox + (ev.clientX - sx), y: oy + (ev.clientY - sy) };
        positionAll();
      }
      function up() {
        document.removeEventListener("pointermove", mv, true);
        document.removeEventListener("pointerup", up, true);
      }
      document.addEventListener("pointermove", mv, true);
      document.addEventListener("pointerup", up, true);
    });
    var ta = document.createElement("textarea");
    ta.value = it.comment;
    ta.placeholder = "What should change?  (Shift+Enter to minimize)";
    ta.rows = 2;
    ta.style.cssText =
      "width:100%;box-sizing:border-box;background:#0e0e0e;color:#fff;border:1px solid #333;border-radius:4px;font:12px system-ui;resize:vertical";
    ta.oninput = function () {
      it.comment = ta.value;
      setDirty();
    };
    ta.onmousedown = function (e) {
      e.stopPropagation();
    };
    ta.onclick = function (e) {
      e.stopPropagation();
    };
    ta.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        closeCard(it);
      }
    });
    card.__ta = ta;
    card.addEventListener("focusout", function (e: FocusEvent) {
      if (state.confirming || refs.closing) return;
      if (!card.contains(e.relatedTarget)) closeCard(it);
    });
    card.appendChild(head);
    card.appendChild(ta);
    marks.appendChild(card);
    refs.card = card;
    requestAnimationFrame(function () {
      card.style.opacity = "1";
      card.style.transform = "none";
    });
    try {
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(ta.value.length, ta.value.length);
    } catch (_) {}
  }

  // Position all persistent nodes; cluster overlapping badges and fan them apart near the cursor.
  function positionAll() {
    if (!state.fabOpen) return;
    var anchors = state.items.map(function (it: any) {
      var r = vrect(it);
      return { it: it, r: r, x: r.x, y: Math.max(0, r.y - 18) };
    });
    var clusters: any[] = [];
    anchors.forEach(function (a: any) {
      var c = null;
      for (var i = 0; i < clusters.length; i++) {
        if (Math.abs(clusters[i].x - a.x) <= 18 && Math.abs(clusters[i].y - a.y) <= 18) {
          c = clusters[i];
          break;
        }
      }
      if (!c) {
        c = { x: a.x, y: a.y, members: [] };
        clusters.push(c);
      }
      c.members.push(a);
    });
    clusters.forEach(function (cl: any) {
      var multi = cl.members.length > 1;
      var anyOpen = cl.members.some(function (a: any) {
        return state.open[a.it.id];
      });
      var near =
        !!state.mouse && Math.abs(state.mouse.x - cl.x) < 90 && Math.abs(state.mouse.y - cl.y) < 90;
      var expanded = multi && (near || anyOpen);
      cl.members.forEach(function (a: any, k: number) {
        var refs = els[a.it.id];
        if (!refs) return;
        var r = a.r,
          n = state.items.indexOf(a.it) + 1;
        if (refs.box) {
          refs.box.style.left = r.x + "px";
          refs.box.style.top = r.y + "px";
          refs.box.style.width = r.width + "px";
          refs.box.style.height = r.height + "px";
        }
        var ox = 0,
          oy = 0;
        if (multi) {
          if (expanded) {
            oy = k * 24;
          } else {
            ox = k * 4;
            oy = k * 4;
          }
        }
        if (refs.badge) {
          refs.badge.textContent = String(n);
          refs.badge.style.left = cl.x + "px";
          refs.badge.style.top = cl.y + "px";
          refs.badge.style.transform = "translate(" + ox + "px," + oy + "px)";
          refs.badge.style.zIndex = String(Z + k + (expanded ? 6 : 0));
        }
        if (refs.card && !refs.closing) {
          var off = a.it.cardOffset || { x: 0, y: 0 };
          refs.card.style.left = cl.x + ox + 22 + off.x + "px";
          refs.card.style.top = cl.y + oy + off.y + "px";
          if (refs.card.__hb) refs.card.__hb.textContent = String(n);
        }
      });
    });
  }

  // Structural sync: ensure a node-set per item, build cards for open items, then position.
  function draw() {
    marks.style.display = state.fabOpen ? "block" : "none";
    if (!state.fabOpen) return;
    state.items.forEach(function (it: any) {
      if (!els[it.id]) createNodes(it);
    });
    state.items.forEach(function (it: any) {
      var refs = els[it.id];
      if (state.open[it.id] && refs && !refs.card && !refs.closing) buildCard(it);
    });
    positionAll();
  }

  var raf: number | null = null;
  function scheduleReposition() {
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = null;
      positionAll();
    });
  }
  window.addEventListener("scroll", scheduleReposition, true);
  window.addEventListener("resize", function () {
    setFabPos();
    scheduleReposition();
  });
  document.addEventListener(
    "mousemove",
    function (e) {
      if (!state.fabOpen || !state.items.length) return;
      state.mouse = { x: e.clientX, y: e.clientY };
      scheduleReposition();
    },
    true,
  );

  document.addEventListener(
    "mousemove",
    function (e) {
      if (state.mode !== "pick") return;
      var el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || fab.contains(el) || insideMarks(el)) return;
      box(hover, el.getBoundingClientRect());
    },
    true,
  );
  document.addEventListener(
    "click",
    function (e) {
      if (state.mode !== "pick") return;
      if (fab.contains(e.target as Node) || insideMarks(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      var el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el) return;
      var data: any = (window as any).__pinpointExtractSelection(el);
      data.id = "a" + state.nextId++;
      data.comment = "";
      data.wantScreenshot = false;
      data.kind = "element";
      state.items.push(data);
      state.open[data.id] = true;
      state.ready = false;
      hover.style.display = "none";
      draw();
      sync();
    },
    true,
  );

  var sdrag: any = null;
  var rectOf = function (a: { x: number; y: number }, e: MouseEvent) {
    return {
      x: Math.min(a.x, e.clientX),
      y: Math.min(a.y, e.clientY),
      width: Math.abs(e.clientX - a.x),
      height: Math.abs(e.clientY - a.y),
    };
  };
  document.addEventListener(
    "mousedown",
    function (e) {
      if (state.mode !== "screenshot" || fab.contains(e.target as Node) || insideMarks(e.target))
        return;
      e.preventDefault();
      sdrag = { x: e.clientX, y: e.clientY };
    },
    true,
  );
  document.addEventListener(
    "mousemove",
    function (e) {
      if (state.mode !== "screenshot" || !sdrag) return;
      box(marquee, rectOf(sdrag, e));
    },
    true,
  );
  document.addEventListener(
    "mouseup",
    function (e) {
      if (state.mode !== "screenshot" || !sdrag) return;
      var r = rectOf(sdrag, e);
      sdrag = null;
      marquee.style.display = "none";
      if (r.width > 6 && r.height > 6) {
        var id = "a" + state.nextId++;
        state.items.push({
          id: id,
          kind: "screenshot",
          componentName: null,
          ancestry: [],
          selector: "",
          tagName: "",
          text: "",
          rect: r,
          pageX: r.x + window.scrollX,
          pageY: r.y + window.scrollY,
          comment: "",
          wantScreenshot: true,
        });
        state.open[id] = true;
        (window as any)[REGION_GLOBAL] = r;
        state.ready = false;
        draw();
        sync();
      }
    },
    true,
  );

  document.addEventListener(
    "keydown",
    function (e) {
      if (e.key === "Escape") setMode(null);
    },
    true,
  );

  async function doSend() {
    if (!state.items.length) return;
    state.ready = true;
    state.batchId++;
    sync();
    renderSendButton(bSend, { ready: true });
    bSend.title = "Copied — paste with Cmd+Shift+V into Claude";
    if ((window as any).__pinpointLink) {
      try {
        state.lastPromptId = await (window as any).__pinpointLink.send(serialize().items);
      } catch (_) {}
    }
  }

  sync();
  if ((window as any).__pinpointLink) {
    (window as any).__pinpointLink.init(function (promptId: any, status: string) {
      if (status === "running" && promptId === state.lastPromptId) {
        Object.keys(els).forEach(function (id) {
          removeNodes(els[id]);
        });
        els = {};
        state.items = [];
        state.open = {};
        state.ready = false;
        draw();
        sync();
      }
    });
  }
}
