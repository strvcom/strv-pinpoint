// Attaches window.__pinpointLink — ported verbatim from the old BRIDGE_LINK_FN
// String.raw block (cdp/bridge-link.ts). Reads window.__pinpointConfig.
export function installBridgeLink(): void {
  (window as any).__pinpointLink = (function () {
    var cfg = (window as any).__pinpointConfig || {};
    function init(onStatus: any) {
      if (!cfg.bridgeUrl || !cfg.sessionId) return;
      try {
        var es = new EventSource(
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
}
