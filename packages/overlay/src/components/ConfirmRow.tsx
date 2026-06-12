export function ConfirmRow({
  yesLabel,
  onYes,
  onNo,
}: {
  yesLabel: string;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button
        type="button"
        style="border:0;border-radius:6px;padding:5px 12px;background:#3a3a3a;color:#fff;cursor:pointer;font:12px system-ui"
        onClick={(e) => {
          e.stopPropagation();
          onNo();
        }}
      >
        Cancel
      </button>
      <button
        type="button"
        style="border:0;border-radius:6px;padding:5px 12px;background:#b91c1c;color:#fff;cursor:pointer;font:600 12px system-ui"
        onClick={(e) => {
          e.stopPropagation();
          onYes();
        }}
      >
        {yesLabel}
      </button>
    </div>
  );
}
