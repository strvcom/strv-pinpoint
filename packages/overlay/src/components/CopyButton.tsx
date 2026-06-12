export function CopyButton({
  itemCount,
  copied,
  onCopy,
}: {
  itemCount: number;
  copied: boolean;
  onCopy: () => void;
}) {
  const disabled = itemCount === 0;

  const dynamicStyle = disabled
    ? "background:#2a2a2a;color:#777;cursor:not-allowed;opacity:.55"
    : copied
      ? "background:#0a4;cursor:pointer;opacity:1;color:#fff"
      : "background:#0a7d34;cursor:pointer;opacity:1;color:#fff";

  const style = `height:26px;padding:0 12px;border-radius:14px;border:0;color:#fff;font:600 12px system-ui;${dynamicStyle}`;

  return (
    <button
      type="button"
      disabled={disabled}
      style={style}
      title="Copy annotations to clipboard (then Cmd+Shift+V into Claude)"
      onClick={(e) => {
        e.stopPropagation();
        if (itemCount > 0) onCopy();
      }}
    >
      {copied && !disabled ? "Copied ✓" : "Copy"}
    </button>
  );
}
