export const OVERLAY_CSS =
  ".pp-icon{background:transparent;border:0;color:#cfd3dc;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:color .15s ease,background .15s ease,transform .15s ease}" +
  ".pp-icon:hover{color:#fff;transform:scale(1.12)}" +
  // .pp-active now only sets the icon color; the blue highlight is the sliding .pp-tool-indicator.
  ".pp-icon.pp-active{color:#fff}" +
  ".pp-tool-indicator{transition:transform .2s ease,opacity .18s ease}" +
  ".pp-pill{transform-origin:right center;transition:transform .18s ease,opacity .18s ease}" +
  ".pp-card{transform-origin:top left;transition:transform .15s ease,opacity .15s ease}" +
  ".pp-badge{transition:transform .16s ease,opacity .16s ease}" +
  // Markdown comment editor (TASK-31) — shadow-scoped box + tight list styling.
  ".pp-md{box-sizing:border-box;width:100%;min-height:44px;max-height:160px;overflow:auto;background:#0e0e0e;color:#fff;border:1px solid #333;border-radius:4px;padding:6px 8px;font:12px system-ui}" +
  ".pp-md .ProseMirror{outline:none;white-space:pre-wrap;word-wrap:break-word}" +
  ".pp-md p{margin:0}" +
  ".pp-md ul,.pp-md ol{margin:2px 0;padding-left:18px}" +
  ".pp-md li{margin:1px 0}";
