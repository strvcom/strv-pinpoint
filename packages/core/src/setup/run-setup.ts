import {
  type PinpointFileConfig,
  writePinpointConfig as writeConfigImpl,
} from "../config/pinpoint-config.js";
import {
  ensureGitignored as ensureGitignoredImpl,
  type ProfileMode,
  resolveProfileDir,
} from "../config/profile-dir.js";
import type { Driver } from "../driver/driver.js";

export interface RunSetupOptions {
  cwd: string;
  home: string;
  profileMode: ProfileMode;
  driver: Driver;
  /** seams (default to the real impls) */
  writeConfig?: (cwd: string, cfg: PinpointFileConfig) => void;
  ensureGitignored?: (cwd: string, entry: string) => void;
}

export type RunSetupResult =
  | { ok: true; driver: string; profileDir: string; configPath: string }
  | { ok: false; reason: string; remedy: string };

export async function runSetup(opts: RunSetupOptions): Promise<RunSetupResult> {
  const writeConfig = opts.writeConfig ?? writeConfigImpl;
  const ensureGitignored = opts.ensureGitignored ?? ensureGitignoredImpl;

  const health = await opts.driver.healthCheck();
  if (!health.ok) return { ok: false, reason: health.reason, remedy: health.remedy };

  const profileDir = resolveProfileDir({ cwd: opts.cwd, mode: opts.profileMode, home: opts.home });

  // Always gitignore .pinpoint/ — it holds the config and (in repo mode) a credential-bearing profile.
  ensureGitignored(opts.cwd, ".pinpoint/");
  writeConfig(opts.cwd, { driver: "cdp", profileDir });

  return {
    ok: true,
    driver: opts.driver.name,
    profileDir,
    configPath: `${opts.cwd}/.pinpoint/config.json`,
  };
}
