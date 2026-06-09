// Renders the Copy/Send button. Mirrors current behavior exactly.
// (TASK-18 will later add empty-disabled + transient-Copied states — NOT here.)
export function renderSendButton(btn: HTMLButtonElement, opts: { ready: boolean }): void {
  btn.textContent = opts.ready ? "Copied ✓" : "Copy";
  btn.style.background = opts.ready ? "#0a4" : "#0a7d34";
}
