import clipboard from "clipboardy";

/** Inject a fake in tests; default writes the system clipboard via clipboardy. */
export type ClipboardWriter = (text: string) => Promise<void>;

export const systemClipboard: ClipboardWriter = (text) => clipboard.write(text);
