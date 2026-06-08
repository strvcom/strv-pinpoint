import { type ChildProcess, spawn } from "node:child_process";

export type ClipboardWriter = (text: string) => Promise<void>;
type SpawnLike = (cmd: string, args: string[]) => ChildProcess;

/** The OS clipboard-write command for a given platform. */
export function clipboardCommand(platform: NodeJS.Platform): { cmd: string; args: string[] } {
  if (platform === "darwin") return { cmd: "pbcopy", args: [] };
  if (platform === "win32") return { cmd: "clip", args: [] };
  // Linux/other: xclip writing the clipboard selection.
  return { cmd: "xclip", args: ["-selection", "clipboard"] };
}

export function writeWith(
  text: string,
  platform: NodeJS.Platform,
  spawnImpl: SpawnLike = spawn,
): Promise<void> {
  const { cmd, args } = clipboardCommand(platform);
  return new Promise((resolve, reject) => {
    const child = spawnImpl(cmd, args);
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${code}`)),
    );
    child.stdin?.write(text);
    child.stdin?.end();
  });
}

/** Default writer: shells out to the platform's clipboard command. */
export const systemClipboard: ClipboardWriter = (text) => writeWith(text, process.platform);
