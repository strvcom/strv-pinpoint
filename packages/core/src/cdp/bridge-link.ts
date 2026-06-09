/**
 * Injected as part of the overlay. Defines window.__pinpointLink:
 *  - init(onStatus): opens the bridge SSE channel, routes {type:"status"} events to onStatus.
 *  - send(items): POSTs the batch to the bridge /send; resolves to the promptId.
 * Reads window.__pinpointConfig = { bridgeUrl, sessionId } (injected by the connector).
 */
export const BRIDGE_LINK_FN = String.raw`
window.__pinpointLink = (() => {
  var cfg = window.__pinpointConfig || {};
  function init(onStatus) {
    if (!cfg.bridgeUrl || !cfg.sessionId) return;
    try {
      var es = new EventSource(cfg.bridgeUrl + '/session/' + encodeURIComponent(cfg.sessionId) + '/events');
      es.onmessage = function (e) {
        try { var d = JSON.parse(e.data); if (d && d.type === 'status' && onStatus) onStatus(d.promptId, d.status); } catch (_) {}
      };
    } catch (_) {}
  }
  async function send(items) {
    var r = await fetch(cfg.bridgeUrl + '/session/' + encodeURIComponent(cfg.sessionId) + '/send', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: items }),
    });
    var j = await r.json();
    return j.promptId;
  }
  return { init: init, send: send };
})();
`;
