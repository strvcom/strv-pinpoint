// Attaches window.__pinpointLink — ported from the old BRIDGE_LINK_FN String.raw block.
// Reads window.__pinpointConfig. Returns a disposer that closes the EventSource (opened by
// init()) and removes the global, so a dev re-inject leaves no dangling SSE connection.
export function installBridgeLink(): () => void {
  let es: EventSource | null = null;
  (window as any).__pinpointLink = (function () {
    var cfg = (window as any).__pinpointConfig || {};
    function init(onStatus: any) {
      if (!cfg.bridgeUrl || !cfg.sessionId) return;
      try {
        es = new EventSource(
          cfg.bridgeUrl + "/session/" + encodeURIComponent(cfg.sessionId) + "/events",
        );
        es.onmessage = function (e) {
          try {
            var d = JSON.parse(e.data);
            if (d && d.type === "status" && onStatus) onStatus(d.promptId, d.status);
          } catch (_) {}
        };
      } catch (_) {}
    }
    async function send(items: any) {
      var r = await fetch(
        cfg.bridgeUrl + "/session/" + encodeURIComponent(cfg.sessionId) + "/send",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ items: items }),
        },
      );
      var j = await r.json();
      return j.promptId;
    }
    return { init: init, send: send };
  })();
  return function disposeBridgeLink() {
    try {
      es?.close();
    } catch (_) {}
    es = null;
    delete (window as any).__pinpointLink;
  };
}
