import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const CONFIG_RELPATH = ".pinpoint/config.json";

export interface PinpointFileConfig {
  driver?: "cdp";
  /** Persistent Chrome profile dir for the CDP driver. */
  profileDir?: string;
  port?: number;
}

export interface ReadDeps {
  exists?: (path: string) => boolean;
  readFile?: (path: string) => string;
}

export function readPinpointConfig(cwd: string, deps: ReadDeps = {}): PinpointFileConfig | null {
  const exists = deps.exists ?? existsSync;
  const readFile = deps.readFile ?? ((p: string) => readFileSync(p, "utf8"));
  const path = join(cwd, CONFIG_RELPATH);
  if (!exists(path)) return null;
  try {
    return JSON.parse(readFile(path)) as PinpointFileConfig;
  } catch {
    return null;
  }
}

export interface WriteDeps {
  mkdir?: (dir: string) => void;
  writeFile?: (path: string, content: string) => void;
}

export function writePinpointConfig(
  cwd: string,
  cfg: PinpointFileConfig,
  deps: WriteDeps = {},
): void {
  const mkdir = deps.mkdir ?? ((d: string) => void mkdirSync(d, { recursive: true }));
  const writeFile = deps.writeFile ?? ((p: string, c: string) => writeFileSync(p, c));
  const path = join(cwd, CONFIG_RELPATH);
  mkdir(dirname(path));
  writeFile(path, `${JSON.stringify(cfg, null, 2)}\n`);
}
